"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { SearchField, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { BoardTrashCard } from "@/components/mindboard/BoardCards";
import { Marked, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { binCards } from "@/lib/mindboard/branch";
import { boardOnWall, defaultTitle, splitBoards, summariesOf, summaryLine, type BoardSummary } from "@/lib/mindboard/list";
import { useCreateBoard, usePurgeBoards, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import {
  awaitsReminder,
  awaitsWords,
  filterNotes,
  firstLine,
  groupNotes,
  noteTime,
  reminderRu,
  restLines,
  splitNotes,
  TRASH_DAYS,
  whenRu,
  type NoteGroupKey,
} from "@/lib/notes/list";
import { useCreateNote, usePurgeNotes, useRestoreNote } from "@/lib/notes/mutations";
import { useNoteCounts, useNotes, useNoteSearch, useOlderNotes, type Note } from "@/lib/notes/queries";
import { useMe, type Me } from "@/lib/tasks/queries";
import { useTvState, type TvState } from "@/lib/tv/queries";
import { boardLive } from "@/lib/tv/state";

import { BoardRowMenu } from "./BoardRowMenu";
import { PurgeDialog, type Purge } from "./PurgeDialog";

/** The left column's views: the thoughts, the boards, what the notes became, the bin. */
export type NotesTab = "notes" | "boards" | "converted" | "trash";

const TABS: readonly NotesTab[] = ["notes", "boards", "converted", "trash"];
const EMPTY: Note[] = [];

/** The phone's `?tab` (`active`, D-102) and the desk's own words lead to the same view. */
function tabOf(value: string | null): NotesTab {
  if (value === "active") return "notes";
  return TABS.includes(value as NotesTab) ? (value as NotesTab) : "notes";
}

type NotesDeskValue = {
  me: Me | undefined;
  /** The notes cache with the server search's older hits laid in: every row the column can show. */
  rows: Note[];
  loading: boolean;
  now: Date;
  /** The note open on the right (`?n`). */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** A note just made by «Новая заметка»: its editor takes the caret once. */
  focusId: string | null;
  focused: () => void;
  boards: MindBoard[];
  liveBoards: MindBoard[];
  summaries: Map<string, BoardSummary>;
  tv: TvState | null;
  newNote: () => void;
};

const NotesDeskContext = createContext<NotesDeskValue | null>(null);

export function useNotesDesk(): NotesDeskValue {
  const value = useContext(NotesDeskContext);
  if (!value) throw new Error("useNotesDesk outside the notes desk");
  return value;
}

/**
 * «Заметки» of the desk (D-153, D-75): the director's own thoughts and boards in two columns —
 * the list on the left (`?tab=notes|boards|converted|trash`, a search, the counts, «Показать
 * раньше», the bin), the chosen note (`?n`) or board (`/desk/notes/b/[id]`) on the right. The
 * list lives in the layout, so it keeps its place while the right column changes. Private to
 * the author (D-75 §3): the same caches and writes as the phone screen, nothing else.
 */
export function NotesDesk({ children }: { children: ReactNode }) {
  const me = useMe();
  const userId = me.data?.userId;
  const notes = useNotes(userId);
  const counts = useNoteCounts(userId);
  const older = useOlderNotes(userId);
  const boards = useBoards(userId);
  const tvState = useTvState();
  const create = useCreateNote(me.data);
  const createBoard = useCreateBoard(me.data);
  const restore = useRestoreNote(me.data);
  const restoreBoard = useRestoreBoard(me.data);
  const purgeNotes = usePurgeNotes(me.data);
  const purgeBoards = usePurgeBoards(me.data);
  const now = useMinute();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const boardId = /^\/desk\/notes\/b\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const tab: NotesTab = boardId ? "boards" : tabOf(params.get("tab"));
  const selectedId = boardId ? null : params.get("n");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [purging, setPurging] = useState<Purge | null>(null);

  const cached = notes.data ?? EMPTY;
  const loadedLive = useMemo(() => cached.filter((note) => note.deleted_at === null && note.board_id === null).length, [cached]);
  const hasOlder = (counts.data?.live ?? 0) > loadedLive;
  const search = useNoteSearch(userId, query, hasOlder);
  const rows = useMemo(() => {
    const byId = new Map(cached.map((note) => [note.id, note]));
    for (const hit of search.data ?? []) if (!byId.has(hit.id)) byId.set(hit.id, hit);
    return [...byId.values()];
  }, [cached, search.data]);

  const tv = tvState.data ?? null;
  const wallBoardId = boardLive(tv, now) ? (tv?.board_id ?? null) : null;
  const piles = useMemo(() => splitBoards(boards.data ?? [], now, wallBoardId), [boards.data, now, wallBoardId]);
  const liveIds = useMemo(() => new Set([...piles.live, ...piles.finished].map((board) => board.id)), [piles]);
  const summaries = useMemo(() => summariesOf(rows), [rows]);
  const titleOf = useMemo(() => new Map((boards.data ?? []).map((board) => [board.id, board.title])), [boards.data]);
  const split = useMemo(() => splitNotes(rows, now, liveIds), [rows, now, liveIds]);
  // the bin by branches (D-121): sub-points that left with their point ride on its card
  const bin = useMemo(() => binCards(split.trash), [split.trash]);

  const needle = query.trim();
  const boardHit = useCallback((board: MindBoard) => !needle || board.title.toLowerCase().includes(needle.toLowerCase()), [needle]);
  const shown = useMemo(
    () => ({
      notes: filterNotes(split.active, query),
      converted: filterNotes(split.converted, query),
      trash: bin.filter((entry) => filterNotes([entry.card], query).length > 0),
      live: piles.live.filter(boardHit),
      finished: piles.finished.filter(boardHit),
      trashBoards: piles.trash.filter(boardHit),
    }),
    [split, bin, piles, query, boardHit],
  );
  // the server's numbers while nothing is searched — the feed may hold only the latest months
  const tabCounts: Record<NotesTab, number> = needle
    ? { notes: shown.notes.length, boards: shown.live.length + shown.finished.length, converted: shown.converted.length, trash: shown.trash.length + shown.trashBoards.length }
    : {
        notes: Math.max(split.active.length, counts.data?.thoughts ?? 0),
        boards: piles.live.length,
        converted: Math.max(split.converted.length, counts.data?.converted ?? 0),
        trash: bin.length + piles.trash.length,
      };

  /** One key of the address changes; `n` goes with a change of the tab. */
  const replace = useCallback(
    (next: { tab?: NotesTab; n?: string | null }, push = false) => {
      const query = new URLSearchParams(params.toString());
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
      if (boardId) {
        router.push(url);
        return;
      }
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [params, boardId, router],
  );

  const select = useCallback((id: string | null) => replace({ n: id }), [replace]);
  // the board the arrows stand on in the list; opening it is a click or Enter
  const [boardFocus, setBoardFocus] = useState<string | null>(null);
  const setTab = (next: NotesTab) => {
    if (next === tab && !boardId) return;
    replace({ tab: next }, true);
  };

  // «Новая заметка»: an empty row at once, chosen, its editor ready — no dictation on the desk
  const newNote = useCallback(() => {
    if (!me.data) return;
    const id = crypto.randomUUID();
    setQuery("");
    create.mutate({ id, text: "", client_request_id: crypto.randomUUID() });
    setFocusId(id);
    replace({ tab: "notes", n: id });
  }, [me.data, create, replace]);

  // «Новая доска»: a title by date, the board opens on the right (D-102 §3)
  const newBoard = () => {
    const id = crypto.randomUUID();
    createBoard.mutate({ id, title: defaultTitle(new Date()), client_request_id: crypto.randomUUID() });
    router.push(`/desk/notes/b/${id}`);
  };

  const focused = useCallback(() => setFocusId(null), []);

  const value: NotesDeskValue = {
    me: me.data,
    rows,
    loading: me.isLoading || notes.isLoading,
    now,
    selectedId,
    select,
    focusId,
    focused,
    boards: boards.data ?? [],
    liveBoards: piles.live,
    summaries,
    tv,
    newNote,
  };

  const noteColumns: Column<{ note: Note; group: NoteGroupKey }>[] = [
    { key: "text", title: "Заметка", render: ({ note }) => <NoteLine note={note} now={now} query={query} /> },
    {
      key: "when",
      title: "",
      width: "96px",
      align: "right",
      render: ({ note, group }) => (
        // «В деле» says when the thought became something, the feed — when it was had
        <span className="nums whitespace-nowrap text-[12px] text-muted">{tab === "converted" ? whenRu(note.converted_at ?? note.created_at, now) : noteTime(note.created_at, group, now)}</span>
      ),
    },
  ];
  const noteGroups: Group<{ note: Note; group: NoteGroupKey }>[] =
    tab === "notes"
      ? groupNotes(shown.notes, now).map((group) => ({
          key: group.key,
          title: group.title,
          tone: group.key === "pinned" || group.key === "reminders" ? ("accent" as const) : undefined,
          rows: group.notes.map((note) => ({ note, group: group.key })),
        }))
      : [{ key: "converted", title: null, rows: shown.converted.map((note) => ({ note, group: "month" as NoteGroupKey })) }];

  const boardColumns: Column<MindBoard>[] = [
    {
      key: "title",
      title: "Доска",
      render: (board) => <BoardLine board={board} summary={summaries.get(board.id)} onWall={boardOnWall(tv, board.id, now)} query={query} />,
    },
    { key: "when", title: "", width: "96px", align: "right", render: (board) => <span className="nums whitespace-nowrap text-[12px] text-muted">{whenRu(board.updated_at, now)}</span> },
    { key: "menu", title: "", width: "44px", align: "center", render: (board) => <BoardRowMenu board={board} me={me.data} /> },
  ];
  const boardGroups: Group<MindBoard>[] = [
    { key: "live", title: shown.finished.length > 0 ? "В работе" : null, rows: shown.live },
    { key: "finished", title: "Завершённые", tone: "muted", rows: shown.finished },
  ];

  const emptyWords = needle
    ? { title: "Ничего не нашёл", hint: "Попробуйте другое слово" }
    : tab === "boards"
      ? { title: "Досок пока нет", hint: "Соберите пункты к планёрке — и выведите на стену" }
      : tab === "converted"
        ? { title: "Пока ничего не в деле", hint: "«Поручить» на заметке — и она окажется здесь" }
        : tab === "trash"
          ? { title: "Корзина пуста", hint: `Удалённая заметка ждёт здесь ${TRASH_DAYS} дня, потом исчезнет сама` }
          : { title: "Пока пусто", hint: "«Новая заметка» — и пишите мысль" };
  const empty = <EmptyState title={emptyWords.title} hint={emptyWords.hint} />;

  const trashTotal = bin.length + piles.trash.length;

  return (
    <NotesDeskContext.Provider value={value}>
      <div className="absolute inset-0 grid grid-cols-[400px_minmax(0,1fr)]" data-testid="desk-notes">
        <section className="flex min-h-0 flex-col border-r border-border" aria-label="Список заметок">
          <div className="flex flex-col gap-3 px-5 pb-3 pt-5">
            <PageTitle
              title="Заметки"
              actions={
                tab === "boards" ? (
                  <Button size="sm" onClick={newBoard} disabled={!me.data} data-testid="desk-board-new">
                    Новая доска
                  </Button>
                ) : (
                  <Button size="sm" onClick={newNote} disabled={!me.data} data-testid="desk-note-new">
                    Новая заметка
                  </Button>
                )
              }
            />
            <SegmentTabs<NotesTab>
              aria-label="Заметки и доски"
              value={tab}
              onChange={setTab}
              items={[
                { value: "notes", label: "Мысли", count: tabCounts.notes },
                { value: "boards", label: "Доски", count: tabCounts.boards },
                { value: "converted", label: "В деле", count: tabCounts.converted },
                { value: "trash", label: "Корзина", count: tabCounts.trash },
              ]}
            />
            <SearchField
              value={query}
              onChange={setQuery}
              width={360}
              placeholder={tab === "boards" ? "Найти доску" : tab === "trash" ? "Найти в корзине" : tab === "converted" ? "Найти в деле" : "Найти в заметках"}
              aria-label="Поиск по заметкам"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6" data-testid="desk-notes-list">
            {value.loading ? (
              <ListBones />
            ) : tab === "boards" ? (
              <DataGrid
                aria-label="Доски"
                columns={boardColumns}
                groups={boardGroups}
                rowKey={(board) => board.id}
                selectedKey={boardFocus ?? boardId}
                // the arrows only move the choice; a click or Enter opens the board — a board is a
                // whole screen, opening one on every key press made the list stutter
                onSelect={(board) => setBoardFocus(board.id)}
                onRowClick={(board) => router.push(`/desk/notes/b/${board.id}`)}
                onActivate={(board) => router.push(`/desk/notes/b/${board.id}`)}
                empty={empty}
              />
            ) : tab === "trash" ? (
              <div className="flex flex-col gap-2" data-testid="desk-notes-trash">
                {trashTotal > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] leading-4 text-muted">Хранится {TRASH_DAYS} дня, потом исчезнет</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="!text-danger/80"
                      onClick={() => setPurging({ notes: split.trash.map((note) => note.id), boards: piles.trash.map((board) => board.id) })}
                    >
                      Очистить ({trashTotal})
                    </Button>
                  </div>
                ) : null}
                {shown.trashBoards.map((board) => (
                  <BoardTrashCard
                    key={board.id}
                    board={board}
                    summary={summaries.get(board.id)}
                    now={now}
                    onRestore={() => {
                      restoreBoard.mutate({ id: board.id });
                      toast("Вернул доску");
                    }}
                    onPurge={() => setPurging({ notes: [], boards: [board.id] })}
                  />
                ))}
                {shown.trash.map(({ card, riders }) => (
                  <TrashCard
                    key={card.id}
                    note={card}
                    now={now}
                    query={query}
                    board={card.board_id ? titleOf.get(card.board_id) : undefined}
                    riders={riders.length}
                    onRestore={() => {
                      restore.mutate({ id: card.id });
                      toast(card.board_id ? "Вернул на доску" : "Вернул в мысли");
                    }}
                    // the point goes for good with the sub-points that rode with it
                    onPurge={() => setPurging({ notes: [card.id, ...riders.map((rider) => rider.id)], boards: [], branch: riders.length > 0 })}
                  />
                ))}
                {shown.trash.length + shown.trashBoards.length === 0 ? empty : null}
              </div>
            ) : (
              <DataGrid
                aria-label={tab === "converted" ? "В деле" : "Мысли"}
                columns={noteColumns}
                groups={noteGroups}
                rowKey={({ note }) => note.id}
                selectedKey={selectedId}
                onSelect={({ note }) => select(note.id)}
                empty={empty}
              />
            )}

            {/* the feed holds the latest months; the rest is one click away, and the search reaches it anyway */}
            {(tab === "notes" || tab === "converted") && hasOlder && !value.loading ? (
              needle ? (
                <p className="mt-3 text-center text-[12px] leading-4 text-muted" data-testid="desk-notes-search-older">
                  {search.isFetching ? "Ищу и в старых заметках…" : "Искал и в старых заметках"}
                </p>
              ) : (
                <div className="mt-3">
                  <Button size="sm" variant="secondary" block loading={older.isPending} onClick={() => older.mutate()} data-testid="desk-notes-older">
                    Показать раньше
                  </Button>
                </div>
              )
            ) : null}
          </div>
        </section>

        <section className="relative min-h-0 overflow-y-auto" aria-label="Заметка">
          {children}
        </section>
      </div>

      <PurgeDialog
        purging={purging}
        onClose={() => setPurging(null)}
        onConfirm={(what) => {
          if (what.notes.length) purgeNotes.mutate({ ids: what.notes });
          if (what.boards.length) purgeBoards.mutate({ ids: what.boards });
          setPurging(null);
        }}
      />
    </NotesDeskContext.Provider>
  );
}

/** A row of the list: the mark (pinned, spoken, written), the first line, the next one or the reminder. */
function NoteLine({ note, now, query }: { note: Note; now: Date; query: string }) {
  const head = firstLine(note.text);
  const rest = restLines(note.text).replace(/\s*\n\s*/g, " ");
  const ringing = awaitsReminder(note);
  const name = note.pinned ? "pin" : note.audio_path ? "wave" : "note";
  return (
    <span className="flex min-w-0 items-start gap-2.5" data-note-id={note.id}>
      <span
        aria-hidden
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${note.pinned ? "var(--accent)" : "var(--text-muted)"} 14%, transparent)`,
          color: note.pinned ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        <NoteIcon name={name} size={11} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          <Marked text={head || (awaitsWords(note) ? "Голосовая заметка" : "Без текста")} query={query} />
        </span>
        {ringing ? (
          <span className="nums flex items-center gap-1 truncate text-[12px] font-semibold leading-4 text-accent">
            <NoteIcon name="bell" size={11} />
            {reminderRu(note, now)}
          </span>
        ) : rest ? (
          <span className="block truncate text-[12px] leading-4 text-muted">
            <Marked text={rest} query={query} />
          </span>
        ) : null}
      </span>
    </span>
  );
}

function BoardLine({ board, summary, onWall, query }: { board: MindBoard; summary: BoardSummary | undefined; onWall: boolean; query: string }) {
  return (
    <span className="flex min-w-0 items-start gap-2.5" data-board-id={board.id}>
      <span
        aria-hidden
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${onWall ? "var(--accent)" : "var(--text-muted)"} 14%, transparent)`, color: onWall ? "var(--accent)" : "var(--text-muted)" }}
      >
        <NoteIcon name="board" size={11} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${board.finished_at ? "text-muted" : ""}`}>
          <Marked text={board.title} query={query} />
        </span>
        <span className="flex items-center gap-1.5 truncate text-[12px] leading-4 text-muted">
          {board.pinned_at && !board.finished_at ? (
            <span className="text-accent" title="Закреплена">
              <NoteIcon name="pin" size={11} />
            </span>
          ) : null}
          <span className="truncate">{summaryLine(summary)}</span>
          {onWall ? <span className="shrink-0 font-semibold text-accent">· на стене</span> : null}
        </span>
      </span>
    </span>
  );
}

function ListBones() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} className="block h-[44px] rounded-[10px] bg-surface-2/70" />
      ))}
    </div>
  );
}

