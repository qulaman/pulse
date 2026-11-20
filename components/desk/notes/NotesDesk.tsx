"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ViewTransition, type ReactNode } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useContextMenu } from "@/components/desk/ui/Menu";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { useDeskDictationKeys } from "@/components/desk/voice/DictationMic";
import { useDeskVoiceClaim } from "@/components/desk/voice/claim";
import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { PICK_SWAP, SWITCH_SWAP } from "@/lib/desk/motion";
import { splitBoards, summariesOf, type BoardSummary } from "@/lib/mindboard/list";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { useDictation, type Dictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, groupNotes, splitNotes, TRASH_DAYS } from "@/lib/notes/list";
import type { PendingCreate } from "@/lib/notes/pending";
import { useNote, useNoteCounts, useNotes, useNoteSearch, useOlderNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { usePendingOverlay } from "@/lib/notes/usePendingOverlay";
import { useMe, useSentTasks, type Me } from "@/lib/tasks/queries";
import { pluralRu, SHORT_STATUS } from "@/lib/tasks/status-text";
import { useTvState } from "@/lib/tv/queries";
import { boardLive } from "@/lib/tv/state";
import { useNow } from "@/lib/useNow";

import { Capture, MIC_LABEL } from "./Capture";
import { pickRun, tabOf, useNotesKeys, type Intent, type NotesTab } from "./keys";
import { bulkMenu, rowMenu } from "./menus";
import { groupTitle, ListBones, NoteList, type ListGroup, type RowHandlers, type RowState } from "./NoteList";
import { PurgeDialog, type Purge } from "./PurgeDialog";
import { isThought, useNoteActions, type NoteActions } from "./useNoteActions";

const EMPTY: Note[] = [];
const NOBODY: ReadonlySet<string> = new Set();
/** A recording younger than this with no words yet is being heard on its device, not lost. */
const HEARING_MS = 2 * 60_000;
/** The note this browser had open last: «Заметки» come back to it, never to the newest (D-177). */
const LAST_KEY = "pulse.desk.notes.last";

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
  const menu = useContextMenu();
  const search = useRef<HTMLInputElement>(null);
  const now = useNow();
  const params = useDeskParams();

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
  const extra = useMemo(() => (one.data ? [...(found.data ?? EMPTY), one.data] : (found.data ?? EMPTY)), [found.data, one.data]);
  const { rows, phone, waiting } = usePendingOverlay(pending, cached, { extra });

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
  const live = useRef({ tab, selectedId, order, noteById, rows });
  useEffect(() => {
    live.current = { tab, selectedId, order, noteById, rows };
  });

  /**
   * One key of the address changes; `n` goes with a change of the tab. Through the desk's address
   * (D-184): a tab swaps the list and the paper («desk-switch»), a note — the paper only
   * («desk-pick»); from the keys a quick hand sees each note at once.
   */
  const replace = useCallback((next: { tab?: NotesTab; n?: string | null }, push = false, fromKeys = false) => {
    // from the address as it is now, not as drawn: a pick may still wait for its transition
    const query = new URLSearchParams(window.location.search);
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
    writeDeskAddress(url, { push, type: next.tab !== undefined ? "desk-switch" : "desk-pick", burst: fromKeys });
  }, []);

  const select = useCallback(
    (id: string | null, fromKeys = false) => {
      replace({ n: id }, false, fromKeys);
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

  const rowsNow = useCallback(() => live.current.rows, []);
  const askPurge = useCallback((ids: string[]) => setPurging({ notes: ids, boards: [] }), []);
  const { actions, capture, purgeNow } = useNoteActions(me.data, leaving, rowsNow, askPurge);

  /* ---------------------------------------------------------------- the list */

  /** Its words are on their way: this page's dictaphone, the replay, or a fresh recording from the phone. */
  const hearingOf = useCallback(
    (note: Note): boolean => {
      if (!note.audio_path || note.text.trim()) return false;
      if (dictation.busy.has(note.id) || replayHearing.has(note.id)) return true;
      return now.getTime() - Date.parse(note.created_at) < HEARING_MS;
    },
    [dictation.busy, replayHearing, now],
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
    [phone, waiting, noteById, hearingOf],
  );

  const pickedNotes = () => [...picked].map((id) => noteById.get(id)).filter((note): note is Note => Boolean(note));

  // the row handlers keep their identity between renders (the rows are memoised); the menus they
  // open are this render's — the notes and the actions as they are now, not as they were
  const menuOf = () => ({
    forRow: (note: Note) => rowMenu(note, actions, setIntent),
    forMany: () => bulkMenu(pickedNotes(), actions, setIntent),
    open: menu.open,
  });
  const menus = useRef(menuOf());
  useEffect(() => {
    menus.current = menuOf();
  });

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
          const run = pickRun(live.current.order, from, id);
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
        const { open, forRow, forMany } = menus.current;
        open(event, picked.has(id) && picked.size > 1 ? forMany() : forRow(note));
      },
    }),
    [select, picked],
  );

  /* ------------------------------------------------------------------ keys */

  useNotesKeys({ tab, setTab, order, selectedId, select, picked, setPicked, anchor, pickedNotes, noteById, actions, setIntent, search });

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
            <ViewTransition update={SWITCH_SWAP} default="none">
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
            </ViewTransition>
          </section>

          {/* the paper stays, the note on it changes (D-184) */}
          <ViewTransition update={PICK_SWAP} default="none">
            <section className="nb-main notes-main" aria-label="Заметка">
              {children}
            </section>
          </ViewTransition>
        </div>
      </div>

      {menu.node}
      <PurgeDialog
        purging={purging}
        onClose={() => setPurging(null)}
        onConfirm={(what) => {
          purgeNow(what.notes);
          const gone = new Set(what.notes);
          if (selectedId && gone.has(selectedId)) select(null);
          setPicked(NOBODY);
          setPurging(null);
        }}
      />
    </NotesDeskContext.Provider>
  );
}
