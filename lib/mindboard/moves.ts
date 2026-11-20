"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ejectReceipt } from "@/components/mindboard/carry";
import { toast } from "@/components/ui/Toast";
import { firstLine } from "@/lib/notes/list";
import type { NoteFields } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { afterBoard } from "@/lib/tv/state";

import { boardText, defaultTitle, splitBoards, summariesOf } from "./list";
import type { MindBoard } from "./queries";
import { withCaption, type Sketch } from "./sketch";
import { nextPlaceIn } from "./tree";
import type { BoardData, BoardWrites } from "./useBoard";

/**
 * What a board screen does to the board as a whole, the same on the phone and on the desk
 * (D-140, D-141, D-144). The phone's haptics come in as a parameter; the toasts are the same.
 */

/** One line's change, as the screen writes it (the desk also updates a line only typed there). */
type Edit = (row: Note, fields: NoteFields) => void;

/** «Скопировать текстом»: the points by their numbers, for a messenger. */
export async function copyBoardText(title: string, rows: readonly Note[]): Promise<void> {
  try {
    await navigator.clipboard.writeText(boardText(title, rows));
    toast("Скопировал доску текстом");
  } catch {
    toast("Не получилось скопировать");
  }
}

/** «Снять все отметки»: every tick of the board, sub-points too, off at once; the toast puts them back. */
export function untickAll(rows: readonly Note[], phone: ReadonlySet<string>, edit: Edit, felt?: () => void): void {
  const ticked = rows.filter((row) => row.done_at !== null && !phone.has(row.id));
  if (ticked.length === 0) return;
  for (const row of ticked) edit(row, { done_at: null });
  felt?.();
  toast(`Снял ${ticked.length} ${pluralRu(ticked.length, ["отметку", "отметки", "отметок"])}`, {
    action: { label: "Вернуть", onClick: () => ticked.forEach((row) => edit(row, { done_at: row.done_at })) },
  });
}

/**
 * The pad is closed with «Готово» (D-141): a drawing goes back on its point, or — `row` null —
 * comes as a new point (`add`, the screen's own way to write one).
 */
export function saveSketch(
  row: Note | null,
  sketch: Sketch | null,
  caption: string,
  to: { edit: Edit; add: (sketch: Sketch | null, caption: string) => void },
): void {
  if (!row) {
    if (sketch || caption) to.add(sketch, caption);
    return;
  }
  const text = withCaption(row.text, caption);
  to.edit(row, { sketch, ...(text === null ? {} : { text }) });
  toast(sketch ? "Рисунок сохранён" : "Рисунок стёрт — пункт остался");
}

/**
 * The board leaving the wall and a point leaving for another board. `open` — how the screen
 * opens a board (the phone's and the desk's addresses differ). `picker` — the props of
 * `BoardPicker` for «На другую доску…»; `move(row)` opens it for that point.
 */
export function useBoardMoves(data: BoardData, writes: Pick<BoardWrites, "control" | "movePoint" | "createBoard">, open: (boardId: string) => void, now: Date) {
  const queryClient = useQueryClient();
  const { id, me, notes, boards, tv, board } = data;
  const { control, movePoint, createBoard } = writes;
  const [moving, setMoving] = useState<Note | null>(null);
  const others = useMemo(() => splitBoards(boards.data ?? [], now).live.filter((other) => other.id !== id), [boards.data, now, id]);
  const summaries = useMemo(() => summariesOf(notes.data ?? []), [notes.data]);

  /** What the meeting got through, with the way to carry what is open to a new board. */
  const ejected = () => ejectReceipt(queryClient, me.data, board, notes.data ?? [], open);
  // the wall goes to the face — or to the round, while a week board waits in it (D-144)
  const eject = () => control.mutate(afterBoard(tv.data ?? null, new Date()), { onSuccess: ejected });

  // «На другую доску» (D-140): to the bottom of the chosen board; a new board is made first
  const moveTo = (target: { id: string; fresh: boolean }) => {
    const row = moving;
    setMoving(null);
    if (!row) return;
    const position = target.fresh ? 1 : nextPlaceIn((notes.data ?? []).filter((note) => note.board_id === target.id && note.deleted_at === null), null);
    movePoint.mutate(
      { note: row, to: { boardId: target.id, position } },
      {
        onSuccess: () =>
          toast(`Пункт на доске «${target.fresh ? defaultTitle(new Date()) : (boards.data?.find((other) => other.id === target.id)?.title ?? "")}»`, {
            action: { label: "Открыть", onClick: () => open(target.id) },
          }),
      },
    );
  };

  const picker = {
    open: moving !== null,
    onClose: () => setMoving(null),
    subject: moving ? firstLine(moving.text) : null,
    boards: others,
    summaries,
    onPick: (other: MindBoard) => moveTo({ id: other.id, fresh: false }),
    onNew: () => {
      // a move needs the network; a board made «for later» would wait with nothing on it
      if (!navigator.onLine) {
        setMoving(null);
        toast("Нет связи — пункт остался на этой доске");
        return;
      }
      const fresh = crypto.randomUUID();
      createBoard.mutate({ id: fresh, title: defaultTitle(new Date()), client_request_id: crypto.randomUUID() }, { onSuccess: () => moveTo({ id: fresh, fresh: true }) });
    },
  };

  return { eject, ejected, move: setMoving, picker };
}
