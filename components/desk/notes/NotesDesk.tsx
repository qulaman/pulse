"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { useDeskDictationKeys } from "@/components/desk/voice/DictationMic";
import { useDeskVoiceClaim } from "@/components/desk/voice/claim";
import { NoteIcon } from "@/components/notes/icons";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { isNetworkError } from "@/lib/net";
import { defaultTitle, splitBoards, summariesOf, type BoardSummary } from "@/lib/mindboard/list";
import { useCreateBoard, useMovePoint, usePointToThought } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { splitCounts, splitList, type SplitPoint } from "@/lib/mindboard/split";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { useDictation, type Dictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, firstLine, groupNotes, isConverted, phoneRow, splitNotes, TRASH_DAYS } from "@/lib/notes/list";
import { restoreNotes, softDeleteNotes, useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { dropCreate, type PendingCreate } from "@/lib/notes/pending";
import { noteKeys, useNote, useNoteCounts, useNotes, useNoteSearch, useOlderNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useIngestStore } from "@/lib/store/ingest";
import { useMe, useSentTasks, type Me } from "@/lib/tasks/queries";
import { pluralRu, SHORT_STATUS } from "@/lib/tasks/status-text";
import { useTvState } from "@/lib/tv/queries";
import { boardLive } from "@/lib/tv/state";

import { Capture, CAPTURE_ID, MIC_LABEL } from "./Capture";
import { groupTitle, ListBones, NoteList, type ListGroup, type RowHandlers, type RowState } from "./NoteList";
import { PurgeDialog, type Purge } from "./PurgeDialog";

/** The stream's views: the thoughts, what they became, the bin (boards are a section of their own, D-177). */
export type NotesTab = "notes" | "converted" | "trash";

const TABS: readonly NotesTab[] = ["notes", "converted", "trash"];
const EMPTY: Note[] = [];
const NOBODY: ReadonlySet<string> = new Set();
/** An edit younger than this is simply on its way; older, with the network up, it is stuck. */
const STUCK_MS = 20_000;
/** A recording younger than this with no words yet is being heard on its device, not lost. */
const HEARING_MS = 2 * 60_000;
/** The note this browser had open last: «Заметки» come back to it, never to the newest (D-177). */
const LAST_KEY = "pulse.desk.notes.last";

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/** The phone's `?tab` (`active`, D-102) and the desk's own words lead to the same view. */
function tabOf(value: string | null): NotesTab {
  if (value === "active") return "notes";
  return TABS.includes(value as NotesTab) ? (value as NotesTab) : "notes";
}

/** A live thought — the kind of note the bar's actions work on. */
export function isThought(note: Note): boolean {
  return note.deleted_at === null && note.board_id === null && !isConverted(note);
}

/** What the bar or a key asked to open for a note: a menu under its button, or a sheet. */
export type Intent = { id: string; kind: "assign" | "remind" | "remind-custom" | "board" | "board-all" | "split" | "more" };

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

type NotesDeskValue = {
  me: Me | undefined;
  /** Every row the page can show: the cache, older search hits, the note read by id, what waits on this computer. */
  rows: Note[];
  loading: boolean;
  now: Date;
  tab: NotesTab;
  /** The note open on the right (`?n`). */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Several notes chosen at once (Ctrl/Shift-click, Shift+↑↓): the right column acts on all of them. */
  picked: ReadonlySet<string>;
  clearPicked: () => void;
  boards: MindBoard[];
  liveBoards: MindBoard[];
  summaries: Map<string, BoardSummary>;
  /** The note to stand on once `id` leaves the list (deleted, moved): the next one, else the one before. */
  neighbourOf: (id: string) => string | null;
  intent: Intent | null;
  setIntent: (intent: Intent | null) => void;
  /** The words of this recording are on their way (here, by the replay, or on the phone that made it). */
  hearing: (note: Note) => boolean;
  /** Kept on this computer only: not on the server yet. */
  phone: ReadonlyMap<string, PendingCreate>;
  dictation: Dictation;
  /** The note of `?n` is being read by its id (older than the loaded feed). */
  reading: boolean;
  /** Nothing at all yet: no thoughts, nothing became anything, an empty bin. */
  emptyAccount: boolean;
  actions: NoteActions;
};

const NotesDeskContext = createContext<NotesDeskValue | null>(null);

export function useNotesDesk(): NotesDeskValue {
  const value = useContext(NotesDeskContext);
  if (!value) throw new Error("useNotesDesk outside the notes desk");
  return value;
}

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function keepLast(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // a private window: «Заметки» simply open on the hint
  }
}

/** The receipt of the page's dictaphone as a toast of the desk (the phone draws it in its lens). */
function receiptToast(receipt: Receipt) {
  if (receipt.tone === "ok") toast(`${receipt.eyebrow}: ${receipt.headline}`);
  else toast(`${receipt.eyebrow} — ${receipt.headline.toLowerCase()}. ${receipt.line}`);
}

/**
 * «Заметки» of the desk (D-177): the director's private notebook. A head across the work area
 * (the title, «только вам», the search, «Мысли · В деле · Корзина»), the stream on the left — the
 * capture card on top (Enter saves verbatim, V dictates), the thoughts as rows below — and the
 * chosen note as a document on the right (`?n`). The keyboard walks it: ↑/↓ through the rows
 * (Shift — several), Enter into the note, N — the capture, Ctrl+F — the search, 1–3 — the tabs,
 * T/R/B/A/P/Del — the chosen note's actions. Private to the author (D-75 §3): the same caches and
 * writes as the phone screen, and what waits on this computer laid over them.
 */
export function NotesDesk({ children }: { children: ReactNode }) {
  const me = useMe();
  const userId = me.data?.userId;
  const notes = useNotes(userId);
  const counts = useNoteCounts(userId);
  const older = useOlderNotes(userId);
  const boards = useBoards(userId);
  const tvState = useTvState();
  const pending = usePendingNotes(userId);
  const replayHearing = useReplayHearing();
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const create = useCreateNote(me.data);
  const createBoard = useCreateBoard(me.data);
  const movePoint = useMovePoint(me.data);
  const toThought = usePointToThought(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const restore = useRestoreNote(me.data);
  const purgeNotes = usePurgeNotes(me.data);
  const queryClient = useQueryClient();
  const menu = useContextMenu();
  const search = useRef<HTMLInputElement>(null);
  const now = useMinute();
  const params = useSearchParams();

  // the page's own microphone (D-177): everything said here is a thought, word for word (D-81)
  const isMine = useDeskVoiceClaim(MIC_LABEL);
  const dictation = useDictation(me.data, receiptToast);
  useDeskDictationKeys(dictation, isMine);

  const tab = tabOf(params.get("tab"));
  const selectedId = params.get("n");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(NOBODY);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [purging, setPurging] = useState<Purge | null>(null);
  const anchor = useRef<string | null>(null);

  const cached = notes.data ?? EMPTY;
  const loadedLive = useMemo(() => cached.filter((note) => note.deleted_at === null && note.board_id === null).length, [cached]);
  const hasOlder = (counts.data?.live ?? 0) > loadedLive;
  const found = useNoteSearch(userId, query, hasOlder);
  // a note asked for by its address (a reminder's push) and not among the loaded ones: read by id
  const known = Boolean(selectedId) && (cached.some((note) => note.id === selectedId) || pending.creates.some((entry) => entry.id === selectedId));
  const one = useNote(userId, selectedId, notes.isSuccess && !known);

  // the notes as the director should see them: the cache, older hits of the search, the note read
  // by its id, edits still on this computer laid over their rows, notes only here so far (D-95)
  const { rows, phone, waiting } = useMemo(() => {
    const byId = new Map(cached.map((note) => [note.id, note]));
    for (const hit of found.data ?? []) if (!byId.has(hit.id)) byId.set(hit.id, hit);
    if (one.data && !byId.has(one.data.id)) byId.set(one.data.id, one.data);
    for (const edit of pending.edits) {
      const row = byId.get(edit.id);
      if (row) byId.set(edit.id, { ...row, ...edit.fields, ...("remind_at" in edit.fields ? { reminded_at: null } : {}) });
    }
    const here = new Map<string, PendingCreate>();
    for (const entry of pending.creates) {
      if (byId.has(entry.id)) continue;
      here.set(entry.id, entry);
      byId.set(entry.id, phoneRow(entry));
    }
    // «ждёт связи»: with no network, or a write stuck for a while — not the second an autosave takes
    const late = (at: number) => !online || now.getTime() - at > STUCK_MS;
    return {
      rows: [...byId.values()],
      phone: here as ReadonlyMap<string, PendingCreate>,
      waiting: new Set([
        ...pending.creates.filter((entry) => late(Date.parse(entry.createdAt))).map((entry) => entry.id),
        ...pending.edits.filter((edit) => late(edit.at)).map((edit) => edit.id),
      ]) as ReadonlySet<string>,
    };
  }, [cached, found.data, one.data, pending, online, now]);

  const tv = tvState.data ?? null;
  const wallBoardId = boardLive(tv, now) ? (tv?.board_id ?? null) : null;
  const piles = useMemo(() => splitBoards(boards.data ?? [], now, wallBoardId), [boards.data, now, wallBoardId]);
  const liveIds = useMemo(() => new Set([...piles.live, ...piles.finished].map((board) => board.id)), [piles]);
  const summaries = useMemo(() => summariesOf(rows), [rows]);
  const split = useMemo(() => splitNotes(rows, now, liveIds), [rows, now, liveIds]);
  // the bin of «Заметки» holds thoughts only: points and boards lie in the bin of «Доски» (D-177)
  const trash = useMemo(() => split.trash.filter((note) => note.board_id === null), [split.trash]);

  const needle = query.trim();
  const shown = useMemo(
    () => ({ notes: filterNotes(split.active, query), converted: filterNotes(split.converted, query), trash: filterNotes(trash, query) }),
    [split, trash, query],
  );
  const groups: ListGroup[] = useMemo(() => {
    if (tab === "notes") return groupNotes(shown.notes, now).map((group) => ({ key: group.key, title: groupTitle(group.key, group.title), notes: group.notes }));
    return [{ key: tab, title: null, notes: tab === "converted" ? shown.converted : shown.trash }];
  }, [tab, shown, now]);
  // the notes in the order the list shows them: what ↑/↓ walk and where a deleted one hands over
  const order = useMemo(() => groups.flatMap((group) => group.notes.map((note) => note.id)), [groups]);
  const noteById = useMemo(() => new Map(rows.map((note) => [note.id, note])), [rows]);

  const loading = me.isLoading || notes.isLoading;
  // the server's numbers while nothing is searched — the feed may hold only the latest months
  const tabCounts: Record<NotesTab, number | undefined> = loading
    ? { notes: undefined, converted: undefined, trash: undefined }
    : needle
      ? { notes: shown.notes.length, converted: shown.converted.length, trash: shown.trash.length }
      : { notes: Math.max(split.active.length, counts.data?.thoughts ?? 0), converted: Math.max(split.converted.length, counts.data?.converted ?? 0), trash: trash.length };
  const emptyAccount = !loading && split.active.length === 0 && split.converted.length === 0 && trash.length === 0 && (counts.data?.live ?? 0) === 0;
  const reminders = useMemo(() => groups.find((group) => group.key === "reminders")?.notes.length ?? 0, [groups]);

  // the address and the screen: a ref for the handlers that outlive a render
  const live = useRef({ params, tab, selectedId, order, noteById, rows });
  useEffect(() => {
    live.current = { params, tab, selectedId, order, noteById, rows };
  });

  /** One key of the address changes; `n` goes with a change of the tab. */
  const replace = useCallback((next: { tab?: NotesTab; n?: string | null }, push = false) => {
    const query = new URLSearchParams(live.current.params.toString());
    if (next.tab !== undefined) {
      if (next.tab === "notes") query.delete("tab");
      else query.set("tab", next.tab);
      query.delete("n");
    }
    if (next.n !== undefined) {
      if (next.n) query.set("n", next.n);
      else query.delete("n");
    }
    const text = query.toString();
    const url = text ? `/desk/notes?${text}` : "/desk/notes";
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const select = useCallback(
    (id: string | null) => {
      replace({ n: id });
      if (id && live.current.tab === "notes") keepLast(id);
    },
    [replace],
  );
  const clearPicked = useCallback(() => setPicked(NOBODY), []);
  const setTab = useCallback(
    (next: NotesTab) => {
      if (next === live.current.tab) return;
      setPicked(NOBODY);
      setIntent(null);
      replace({ tab: next }, true);
    },
    [replace],
  );

  // entering «Заметки» with nothing chosen: the note this browser had open last, else the hint —
  // never the newest by itself (an office screen shows what is open, D-77 privacy)
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !notes.isSuccess) return;
    restored.current = true;
    if (live.current.tab !== "notes" || live.current.selectedId) return;
    const last = readLast();
    const note = last ? live.current.noteById.get(last) : undefined;
    if (note && isThought(note)) replace({ n: note.id });
  }, [notes.isSuccess, replace]);

  const neighbourOf = useCallback((id: string) => {
    const list = live.current.order;
    const at = list.indexOf(id);
    if (at < 0) return null;
    return list[at + 1] ?? list[at - 1] ?? null;
  }, []);
  /** Where the choice goes when these leave the list: the first row after them, else before. */
  const neighbourOutside = useCallback((ids: ReadonlySet<string>) => {
    const list = live.current.order;
    const current = live.current.selectedId;
    const at = current ? list.indexOf(current) : -1;
    for (let i = at + 1; i < list.length; i += 1) if (!ids.has(list[i])) return list[i];
    for (let i = at - 1; i >= 0; i -= 1) if (!ids.has(list[i])) return list[i];
    return null;
  }, []);
  const leaving = useCallback(
    (ids: ReadonlySet<string>) => {
      const current = live.current.selectedId;
      if (current && ids.has(current)) select(neighbourOutside(ids));
      setPicked(NOBODY);
    },
    [select, neighbourOutside],
  );

  /* ------------------------------------------------------------------ actions */

  const capture = useCallback(
    (text: string, restoreText: (text: string) => void) => {
      if (!me.data) return;
      create.mutate(
        { id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID() },
        {
          // refused for good (not the network): the words go back into the card, never lost
          onError: (error) => {
            if (!isNetworkError(error)) restoreText(text);
          },
        },
      );
    },
    [me.data, create],
  );

  const actions: NoteActions = useMemo(() => {
    const bin = (note: Note) => {
      leaving(new Set([note.id]));
      remove.mutate({ id: note.id });
    };
    const binMany = (list: Note[]) => {
      if (!me.data || list.length === 0) return;
      if (list.length === 1) {
        bin(list[0]);
        return;
      }
      const ids = new Set(list.map((note) => note.id));
      const key = noteKeys.mine(me.data.userId);
      const stamp = new Date().toISOString();
      leaving(ids);
      queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).map((note) => (ids.has(note.id) ? { ...note, deleted_at: stamp } : note)));
      void softDeleteNotes([...ids]).catch(() => queryClient.invalidateQueries({ queryKey: key }));
      toast(`${list.length} ${pluralRu(list.length, ["заметка", "заметки", "заметок"])} в корзине`, {
        action: {
          label: "Отменить",
          onClick: () => {
            queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).map((note) => (ids.has(note.id) ? { ...note, deleted_at: null } : note)));
            void restoreNotes([...ids]).catch(() => queryClient.invalidateQueries({ queryKey: key }));
          },
        },
      });
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
      const many = list.length > 1 ? ` · ${list.length} ${pluralRu(list.length, ["заметка", "заметки", "заметок"])}` : "";
      toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}${many}` : `Напоминание снято${many}`);
    };
    // thoughts go to the bottom of the board as points, in the list's order (D-140)
    const toBoard = (list: Note[], target: BoardTarget) => {
      const moving = list.filter((note) => isThought(note) && note.text.trim());
      if (moving.length === 0) return;
      const place = target.fresh ? 1 : nextPlaceIn(live.current.rows.filter((row) => row.board_id === target.id && row.deleted_at === null), null);
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
      if (!me.data) return;
      const points: SplitPoint[] = splitList(note.text) ?? [{ text: firstLine(note.text), children: [] }];
      const place = target.fresh ? 1 : nextPlaceIn(live.current.rows.filter((row) => row.board_id === target.id && row.deleted_at === null), null);
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
      const key = noteKeys.mine(me.data.userId);
      const stamp = new Date().toISOString();
      queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).map((row) => (row.id === note.id ? { ...row, deleted_at: stamp } : row)));
      void softDeleteNotes([note.id]).catch(() => queryClient.invalidateQueries({ queryKey: key }));
      toast(`На доске «${target.title}» — ${splitCounts(points)} · заметка в корзине`, {
        action: {
          label: "Отменить",
          onClick: () => {
            queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).map((row) => (row.id === note.id ? { ...row, deleted_at: null } : row)));
            void restoreNotes([note.id]);
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
      purge: (list) => setPurging({ notes: list.map((note) => note.id), boards: [] }),
    };
  }, [me.data, leaving, remove, update, movePoint, createBoard, create, queryClient, purgeNotes, restore, toThought]);

  /* ---------------------------------------------------------------- the list */

  const focusRow = (id: string) => {
    const node = document.getElementById(`nb-row-${id}`);
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  };

  /** Several chosen: from the anchor to `id` in the list's order. */
  const pickRun = (from: string, to: string) => {
    const list = live.current.order;
    const a = list.indexOf(from);
    const b = list.indexOf(to);
    if (a < 0 || b < 0) return new Set([to]);
    return new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1));
  };

  const handlers: RowHandlers = useMemo(
    () => ({
      onPick: (id, event) => {
        const current = live.current.selectedId;
        if (event.ctrlKey || event.metaKey) {
          setPicked((prev) => {
            const next = new Set(prev.size > 0 ? prev : current ? [current] : []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next.size > 1 ? next : NOBODY;
          });
          anchor.current = id;
          select(id);
          return;
        }
        if (event.shiftKey) {
          const from = anchor.current ?? current ?? id;
          const run = pickRun(from, id);
          setPicked(run.size > 1 ? run : NOBODY);
          select(id);
          return;
        }
        anchor.current = id;
        setPicked(NOBODY);
        select(id);
      },
      onMenu: (id, event) => {
        // a right click chooses its row first: the menu always acts on what is lit
        if (!picked.has(id)) {
          setPicked(NOBODY);
          anchor.current = id;
          select(id);
        }
        const note = live.current.noteById.get(id);
        if (!note) return;
        menu.open(event, picked.has(id) && picked.size > 1 ? bulkMenu() : rowMenu(note));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the menus read the latest through `live`
    [select, picked],
  );

  const stateOf = useCallback(
    (id: string): RowState => {
      const kept = phone.get(id);
      const note = noteById.get(id);
      return {
        waiting: waiting.has(id),
        voiceHere: Boolean(kept?.audio),
        hearing: note ? hearingOf(note) : false,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `hearingOf` is derived from the same three
    [phone, waiting, noteById, dictation.busy, replayHearing, now],
  );

  /** Its words are on their way: this page's dictaphone, the replay, or a fresh recording from the phone. */
  function hearingOf(note: Note): boolean {
    if (!note.audio_path || note.text.trim()) return false;
    if (dictation.busy.has(note.id) || replayHearing.has(note.id)) return true;
    return now.getTime() - Date.parse(note.created_at) < HEARING_MS;
  }

  /** The menu of a row (a right click): the chosen note's actions with their keys. */
  const rowMenu = (note: Note): MenuItem[] => {
    if (note.deleted_at !== null) {
      return [
        { key: "restore", label: "Вернуть в мысли", icon: <NoteIcon name="restore" size={14} />, onSelect: () => actions.restore(note) },
        "separator",
        { key: "purge", label: "Удалить навсегда…", hint: "Del", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.purge([note]) },
      ];
    }
    const thought = isThought(note);
    const empty = !note.text.trim();
    return [
      ...(thought
        ? ([
            { key: "assign", label: "Поручить…", hint: "T", icon: <NoteIcon name="task" size={14} />, disabled: empty, onSelect: () => setIntent({ id: note.id, kind: "assign" }) },
            { key: "remind", label: "Напомнить…", hint: "R", icon: <NoteIcon name="bell" size={14} />, onSelect: () => setIntent({ id: note.id, kind: "remind" }) },
            { key: "board", label: "На доску…", hint: "B", icon: <NoteIcon name="board" size={14} />, disabled: empty, onSelect: () => setIntent({ id: note.id, kind: "board" }) },
            { key: "pin", label: note.pinned ? "Открепить" : "Закрепить", hint: "P", icon: <NoteIcon name="pin" size={14} />, onSelect: () => actions.pin(note) },
            { key: "announce", label: "Объявить…", hint: "A", icon: <NoteIcon name="megaphone" size={14} />, disabled: empty, onSelect: () => actions.announce(note) },
          ] satisfies MenuItem[])
        : []),
      { key: "copy", label: "Скопировать текст", icon: <NoteIcon name="copy" size={14} />, disabled: empty, onSelect: () => actions.copy(note) },
      "separator",
      { key: "bin", label: "В корзину", hint: "Del", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.bin(note) },
    ];
  };
  const pickedNotes = () => [...picked].map((id) => noteById.get(id)).filter((note): note is Note => Boolean(note));
  const bulkMenu = (): MenuItem[] => {
    const list = pickedNotes();
    const thoughts = list.filter(isThought);
    return [
      { key: "board", label: "На доску…", icon: <NoteIcon name="board" size={14} />, disabled: thoughts.length === 0, onSelect: () => setIntent({ id: "picked", kind: "board" }) },
      { key: "remind", label: "Напомнить…", icon: <NoteIcon name="bell" size={14} />, disabled: thoughts.length === 0, onSelect: () => setIntent({ id: "picked", kind: "remind" }) },
      "separator",
      { key: "bin", label: `В корзину · ${list.length}`, danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.binMany(list.filter((note) => note.deleted_at === null)) },
    ];
  };

  /* ------------------------------------------------------------------ keys */

  const focusCapture = useRef(false);
  useEffect(() => {
    if (tab !== "notes" || !focusCapture.current) return;
    focusCapture.current = false;
    document.getElementById(CAPTURE_ID)?.focus();
  }, [tab]);

  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      const code = event.code;
      const typing = isTypingTarget(event.target);
      // Ctrl+F — the search, from anywhere (the note's text included)
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && code === "KeyF") {
        search.current?.focus();
        search.current?.select();
        return true;
      }
      if (typing || !isPlainKey(event) || (event.repeat && code !== "ArrowDown" && code !== "ArrowUp")) return false;
      const active = document.activeElement;
      const inList = Boolean(active?.closest("[data-notes-list]"));
      const fromList = !active || active === document.body || inList;
      // N — the capture card: a thought is written there (Alt+N is the shell's quick thought, D-177)
      if (code === "KeyN" && !event.shiftKey) {
        if (tab === "notes") document.getElementById(CAPTURE_ID)?.focus();
        else {
          focusCapture.current = true;
          setTab("notes");
        }
        return true;
      }
      if (!fromList) return false;
      if ((code === "Digit1" || code === "Digit2" || code === "Digit3") && !event.shiftKey) {
        setTab(TABS[Number(code.slice(5)) - 1]);
        return true;
      }
      if (code === "Escape" && picked.size > 0) {
        setPicked(NOBODY);
        return true;
      }
      const at = selectedId ? order.indexOf(selectedId) : -1;
      if (code === "ArrowDown" || code === "ArrowUp") {
        if (order.length === 0) return false;
        const next = order[code === "ArrowDown" ? Math.min(order.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1)];
        if (event.shiftKey) {
          const from = anchor.current ?? selectedId ?? next;
          anchor.current = from;
          const run = pickRun(from, next);
          setPicked(run.size > 1 ? run : NOBODY);
        } else {
          anchor.current = next;
          if (picked.size > 0) setPicked(NOBODY);
        }
        select(next);
        if (fromList) focusRow(next);
        return true;
      }
      if (event.shiftKey) return false;
      if (picked.size > 1) {
        const list = pickedNotes();
        if (code === "Delete" || (code === "Backspace" && inList)) {
          if (tab === "trash") actions.purge(list);
          else actions.binMany(list);
          return true;
        }
        if (code === "KeyB" && tab === "notes") {
          setIntent({ id: "picked", kind: "board" });
          return true;
        }
        if (code === "KeyR" && tab === "notes") {
          setIntent({ id: "picked", kind: "remind" });
          return true;
        }
        return false;
      }
      const note = selectedId ? noteById.get(selectedId) : undefined;
      if (!note) return false;
      // Backspace only from the list itself: a page with nothing focused never bins by a stray key
      if (code === "Delete" || (code === "Backspace" && inList)) {
        if (note.deleted_at !== null) actions.purge([note]);
        else actions.bin(note);
        return true;
      }
      if (!isThought(note)) return false;
      const empty = !note.text.trim();
      if (code === "Enter") {
        const body = document.querySelector<HTMLTextAreaElement>('[data-testid="desk-note"] [data-testid="note-editor"]');
        const title = document.querySelector<HTMLTextAreaElement>('[data-testid="desk-note"] [data-testid="note-title"]');
        const field = body && body.value ? body : (title ?? body);
        if (field) {
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        }
        return true;
      }
      if (code === "KeyT" && !empty) setIntent({ id: note.id, kind: "assign" });
      else if (code === "KeyR") setIntent({ id: note.id, kind: "remind" });
      else if (code === "KeyB" && !empty) setIntent({ id: note.id, kind: "board" });
      else if (code === "KeyA" && !empty) actions.announce(note);
      else if (code === "KeyP") actions.pin(note);
      else return false;
      return true;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open") || document.querySelector(".desk-pop")) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts("Заметки", [
    { keys: ["N"], label: "Новая мысль — в строку сверху" },
    { keys: ["Enter"], label: "Записать мысль (в строке) · писать в заметке (в списке)" },
    { keys: ["Shift Enter"], label: "Новая строка мысли" },
    { keys: ["V"], label: "Сказать мысль — слово в слово" },
    { keys: ["↑", "↓"], label: "По заметкам" },
    { keys: ["Shift ↑", "Shift ↓"], label: "Выбрать несколько" },
    { keys: ["T"], label: "Поручить" },
    { keys: ["R"], label: "Напомнить" },
    { keys: ["B"], label: "На доску" },
    { keys: ["A"], label: "Объявить" },
    { keys: ["P"], label: "Закрепить или открепить" },
    { keys: ["Del"], label: "В корзину" },
    { keys: ["Ctrl F"], label: "Поиск" },
    { keys: ["1", "2", "3"], label: "Мысли · В деле · Корзина" },
    { keys: ["Ctrl S"], label: "Сохранить сейчас (в заметке)" },
    { keys: ["Esc"], label: "Из заметки — обратно к списку" },
  ]);

  // «В деле»: what each thought became — the task's person and stage, or the announcement
  const sent = useSentTasks(tab === "converted" ? userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);
  const convertedLine = useCallback(
    (note: Note) => {
      if (note.converted_announcement_id) return "стала объявлением";
      const task = note.converted_task_id ? taskById.get(note.converted_task_id) : undefined;
      if (!task) return "стала задачей";
      const who = task.assignee?.full_name?.split(" ")[0];
      return ["стала задачей", who, SHORT_STATUS[task.status]].filter(Boolean).join(" · ");
    },
    [taskById],
  );

  const value: NotesDeskValue = {
    me: me.data,
    rows,
    loading,
    now,
    tab,
    selectedId,
    select,
    picked,
    clearPicked,
    boards: boards.data ?? [],
    liveBoards: piles.live,
    summaries,
    neighbourOf,
    intent,
    setIntent,
    hearing: hearingOf,
    phone,
    dictation,
    reading: Boolean(selectedId) && !known && (one.isLoading || one.isFetching) && !one.data,
    emptyAccount,
    actions,
  };

  const summary = loading || !tabCounts.notes
    ? null
    : [
        `${tabCounts.notes} ${pluralRu(tabCounts.notes ?? 0, ["мысль", "мысли", "мыслей"])}`,
        reminders > 0 ? `напомню ${reminders}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const emptyWords = needle
    ? "Ничего не нашёл — попробуйте другое слово"
    : tab === "converted"
      ? "Пока ничего не в деле: «Поручить» на мысли — и она окажется здесь"
      : tab === "trash"
        ? `Корзина пуста. Удалённая мысль ждёт здесь ${TRASH_DAYS} дня`
        : null;

  return (
    <NotesDeskContext.Provider value={value}>
      <div className="nb desk-page absolute inset-0 !max-w-none !pb-5" data-testid="desk-notes">
        <header className="nb-head">
          <div className="desk-page-title nb-title">
            <h1 className="font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em]">Заметки</h1>
            <span className="nb-private" title="Заметки видите только вы">
              <NoteIcon name="lock" size={12} />
              только вам
            </span>
          </div>
          <div className="nb-tools desk-fields">
            <SearchField
              ref={search}
              value={query}
              onChange={setQuery}
              width={248}
              placeholder={tab === "trash" ? "Найти в корзине" : tab === "converted" ? "Найти в деле" : "Найти в заметках"}
              aria-label="Поиск по заметкам"
            />
            <SegmentTabs<NotesTab>
              aria-label="Мысли, в деле, корзина"
              value={tab}
              onChange={setTab}
              items={[
                { value: "notes", label: "Мысли", count: tabCounts.notes },
                { value: "converted", label: "В деле", count: tabCounts.converted },
                { value: "trash", label: "Корзина", count: tabCounts.trash },
              ]}
            />
          </div>
        </header>

        <div className="nb-body">
          <section className="nb-stream" aria-label="Список заметок">
            {tab === "notes" ? <Capture onSave={capture} dictation={dictation} summary={summary} disabled={!me.data} /> : null}
            {tab === "trash" && trash.length > 0 && !loading ? (
              <div className="nb-trash-head">
                <p>Мысли хранятся здесь {TRASH_DAYS} дня. Пункты досок — в корзине «Досок»</p>
                <Button size="sm" variant="ghost" className="nb-purge" onClick={() => actions.purge(trash)} data-testid="desk-notes-purge">
                  Очистить · {trash.length}
                </Button>
              </div>
            ) : null}
            <div className="nb-scroll no-bar" data-testid="desk-notes-list" data-notes-list="" data-tab={tab}>
              {loading ? (
                <ListBones />
              ) : order.length === 0 ? (
                emptyWords && !(emptyAccount && !needle) ? <p className="nb-empty">{emptyWords}</p> : null
              ) : (
                <NoteList
                  groups={groups}
                  kind={tab}
                  selectedId={selectedId}
                  picked={picked}
                  now={now}
                  query={query}
                  stateOf={stateOf}
                  handlers={handlers}
                  label={tab === "converted" ? "В деле" : tab === "trash" ? "Корзина" : "Мысли"}
                  trashActions={tab === "trash" ? { restore: actions.restore, purge: (note) => actions.purge([note]) } : undefined}
                  convertedLine={convertedLine}
                />
              )}

              {/* the feed holds the latest months; the rest is one click away, and the search reaches it anyway */}
              {tab !== "trash" && hasOlder && !loading ? (
                needle ? (
                  <p className="nb-foot" data-testid="desk-notes-search-older">
                    {found.isFetching ? "Ищу и в старых заметках…" : "Искал и в старых заметках"}
                  </p>
                ) : (
                  <div className="nb-foot">
                    <Button size="sm" variant="secondary" block loading={older.isPending} onClick={() => older.mutate()} data-testid="desk-notes-older">
                      Показать раньше
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          </section>

          <section className="nb-main notes-main" aria-label="Заметка">
            {children}
          </section>
        </div>
      </div>

      {menu.node}
      <PurgeDialog
        purging={purging}
        onClose={() => setPurging(null)}
        onConfirm={(what) => {
          if (what.notes.length) purgeNotes.mutate({ ids: what.notes });
          const gone = new Set(what.notes);
          if (selectedId && gone.has(selectedId)) select(null);
          setPicked(NOBODY);
          setPurging(null);
        }}
      />
    </NotesDeskContext.Provider>
  );
}
