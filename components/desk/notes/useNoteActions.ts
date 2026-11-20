"use client";

import { useCallback, useMemo } from "react";

import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { isNetworkError } from "@/lib/net";
import { defaultTitle } from "@/lib/mindboard/list";
import { useCreateBoard, useMovePoint, usePointToThought } from "@/lib/mindboard/mutations";
import { splitCounts, splitList, type SplitPoint } from "@/lib/mindboard/split";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { firstLine, isConverted } from "@/lib/notes/list";
import { softDeleteNotes, useBinNotes, useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { dropCreate } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";
import { useIngestStore } from "@/lib/store/ingest";
import type { Me } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** A live thought — the kind of note the bar's actions work on. */
export function isThought(note: Note): boolean {
  return note.deleted_at === null && note.board_id === null && !isConverted(note);
}

/** Where thoughts go on a board: one of the live ones, or a new one made for them. */
export type BoardTarget = { id: string; title: string; fresh: boolean };

export type NoteActions = {
  bin: (note: Note) => void;
  binMany: (notes: Note[]) => void;
  pin: (note: Note) => void;
  copy: (note: Note) => void;
  remind: (notes: Note[], iso: string | null) => void;
  toBoard: (notes: Note[], target: BoardTarget) => void;
  toNewBoard: (notes: Note[]) => void;
  split: (note: Note, target: BoardTarget | "new") => void;
  announce: (note: Note) => void;
  assignWithDeadline: (note: Note) => void;
  restore: (note: Note) => void;
  purge: (notes: Note[]) => void;
};

const thoughtsWord = (n: number) => `${n} ${pluralRu(n, ["заметка", "заметки", "заметок"])}`;

/**
 * Every write of the desk's «Заметки» (D-177), the same caches and writes as the phone screen.
 * `leaving` — these notes leave the list (the choice moves on); `rows` — the rows the page shows
 * this instant; `purge` — «Удалить навсегда…» asks first.
 */
export function useNoteActions(me: Me | undefined, leaving: (ids: ReadonlySet<string>) => void, rows: () => readonly Note[], purge: (ids: string[]) => void) {
  const create = useCreateNote(me);
  const createBoard = useCreateBoard(me);
  const movePoint = useMovePoint(me);
  const toThought = usePointToThought(me);
  const update = useUpdateNote(me);
  const remove = useDeleteNote(me);
  const restore = useRestoreNote(me);
  const purgeNotes = usePurgeNotes(me);
  const binNotes = useBinNotes(me);

  /** The capture card's thought; refused for good (not the network) — the words go back into the card. */
  const capture = useCallback(
    (text: string, restoreText: (text: string) => void) => {
      if (!me) return;
      create.mutate(
        { id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID() },
        {
          onError: (error) => {
            if (!isNetworkError(error)) restoreText(text);
          },
        },
      );
    },
    [me, create],
  );

  const actions: NoteActions = useMemo(() => {
    const bin = (note: Note) => {
      leaving(new Set([note.id]));
      remove.mutate({ id: note.id });
    };
    const binMany = (list: Note[]) => {
      if (!me || list.length === 0) return;
      if (list.length === 1) {
        bin(list[0]);
        return;
      }
      const ids = new Set(list.map((note) => note.id));
      leaving(ids);
      const undo = binNotes(ids);
      toast(`${thoughtsWord(list.length)} в корзине`, { action: { label: "Отменить", onClick: undo } });
    };
    const pin = (note: Note) => {
      update.mutate({ id: note.id, pinned: !note.pinned });
      toast(note.pinned ? "Открепил" : "Закрепил сверху");
    };
    const copy = (note: Note) => {
      navigator.clipboard.writeText(note.text).then(
        () => toast("Скопировал"),
        () => toast("Не получилось скопировать"),
      );
    };
    const remind = (list: Note[], iso: string | null) => {
      for (const note of list) update.mutate({ id: note.id, remind_at: iso });
      const many = list.length > 1 ? ` · ${thoughtsWord(list.length)}` : "";
      toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}${many}` : `Напоминание снято${many}`);
    };
    /** The first free place at the bottom of the board. */
    const placeOn = (target: BoardTarget) => (target.fresh ? 1 : nextPlaceIn(rows().filter((row) => row.board_id === target.id && row.deleted_at === null), null));
    // thoughts go to the bottom of the board as points, in the list's order (D-140)
    const toBoard = (list: Note[], target: BoardTarget) => {
      const moving = list.filter((note) => isThought(note) && note.text.trim());
      if (moving.length === 0) return;
      const place = placeOn(target);
      leaving(new Set(moving.map((note) => note.id)));
      const cleared = moving.some((note) => note.remind_at && !note.reminded_at);
      moving.forEach((note, index) =>
        movePoint.mutate(
          { note, to: { boardId: target.id, position: place + index } },
          index === moving.length - 1
            ? {
                onSuccess: () => {
                  const where = moving.length === 1 ? `На доске «${target.title}»` : `${moving.length} ${pluralRu(moving.length, ["мысль", "мысли", "мыслей"])} на доске «${target.title}»`;
                  // «Отменить» brings each one back as it was: its reminder still to ring and its pin (D-177)
                  toast(`${where}${cleared ? " · напоминание снято" : ""}`, {
                    action: {
                      label: "Отменить",
                      onClick: () => {
                        for (const note of moving) toThought.mutate({ id: note.id, restore: { remind_at: note.reminded_at ? null : note.remind_at, pinned: note.pinned } });
                      },
                    },
                  });
                },
              }
            : undefined,
        ),
      );
    };
    // a move needs the network; a board made «for later» would wait with nothing on it
    const offline = () => {
      if (navigator.onLine) return false;
      toast("Нет связи — мысль осталась в «Мыслях»");
      return true;
    };
    const freshBoard = (then: (target: BoardTarget) => void) => {
      if (offline()) return;
      const id = crypto.randomUUID();
      const title = defaultTitle(new Date());
      createBoard.mutate({ id, title, client_request_id: crypto.randomUUID() }, { onSuccess: () => then({ id, title, fresh: true }) });
    };
    const toNewBoard = (list: Note[]) => freshBoard((target) => toBoard(list, target));
    // «Разложить по строкам на доску»: each line a point (details under a point — its sub-points),
    // the note itself to the bin; «Отменить» brings the note back and takes the points off
    const layOut = (note: Note, target: BoardTarget) => {
      if (!me) return;
      const points: SplitPoint[] = splitList(note.text) ?? [{ text: firstLine(note.text), children: [] }];
      const place = placeOn(target);
      const made: string[] = [];
      // every point's own write, settled or not: «Отменить» waits for them before it takes them off
      const landing: Promise<unknown>[] = [];
      const make = (row: Parameters<typeof create.mutateAsync>[0]) => landing.push(create.mutateAsync(row).catch(() => undefined));
      points.forEach((point, index) => {
        const id = crypto.randomUUID();
        made.push(id);
        make({ id, text: point.text, client_request_id: crypto.randomUUID(), board_id: target.id, position: place + index });
        point.children.forEach((child, at) => {
          const sub = crypto.randomUUID();
          made.push(sub);
          make({ id: sub, text: child, client_request_id: crypto.randomUUID(), board_id: target.id, parent_id: id, position: at + 1 });
        });
      });
      leaving(new Set([note.id]));
      const unbin = binNotes(new Set([note.id]));
      toast(`На доске «${target.title}» — ${splitCounts(points)} · заметка в корзине`, {
        action: {
          label: "Отменить",
          onClick: () => {
            unbin();
            // the points leave for good: they were made a moment ago and nobody has seen them. A
            // slow or offline write may still be on its way — the copies kept on this computer are
            // dropped (a closed tab never sends them), and the rest are taken off once they land
            for (const id of made) void dropCreate(id);
            void Promise.allSettled(landing)
              .then(() => softDeleteNotes(made))
              .then(() => purgeNotes.mutate({ ids: made }));
          },
        },
      });
    };
    const split = (note: Note, target: BoardTarget | "new") => {
      if (target === "new") freshBoard((board) => layOut(note, board));
      else layOut(note, target);
    };
    // «Объявить» and «Поручить со сроком…»: the desk's confirm panel, the usual way (D-81)
    const startFrom = (note: Note, as: "task" | "announcement") => useIngestStore.getState().startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, as);
    return {
      bin,
      binMany,
      pin,
      copy,
      remind,
      toBoard,
      toNewBoard,
      split,
      announce: (note) => startFrom(note, "announcement"),
      assignWithDeadline: (note) => startFrom(note, "task"),
      restore: (note) => {
        restore.mutate({ id: note.id });
        toast("Вернул в мысли");
      },
      purge: (list) => purge(list.map((note) => note.id)),
    };
  }, [me, leaving, rows, remove, update, movePoint, createBoard, create, binNotes, purgeNotes, restore, toThought, purge]);

  /** «Удалить навсегда» said yes. */
  const purgeNow = (ids: string[]) => {
    if (ids.length) purgeNotes.mutate({ ids });
  };

  return { actions, capture, purgeNow };
}
