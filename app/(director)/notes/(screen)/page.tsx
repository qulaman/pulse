"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { BoardCard, BoardTrashCard, FinishedBoards, NewBoardCard } from "@/components/mindboard/BoardCards";
import { ConvertedCard, NoteCard, PendingCard, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder } from "@/components/notes/NotesRecorder";
import { NotesSheets, type BoardTarget, type Purge } from "@/components/notes/NotesSheets";
import { Tabs } from "@/components/tasks/list/Tabs";
import { TaskColumn, useAccordion, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { NotesSkeleton } from "@/components/ui/PageSkeletons";
import { toast } from "@/components/ui/Toast";
import { dateLineRu, humanAqtobe } from "@/lib/ai/time";
import { binCards } from "@/lib/mindboard/branch";
import { boardOnWall, defaultTitle, previewOf, splitBoards, summariesOf } from "@/lib/mindboard/list";
import { useCreateBoard, useMovePoint, usePurgeBoards, useRestoreBoard } from "@/lib/mindboard/mutations";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, firstLine, groupNotes, notesHero, splitNotes, TRASH_DAYS, type NoteFilter, type NoteGroupKey } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { dropCreate } from "@/lib/notes/pending";
import { useNoteCounts, useNotes, useNoteSearch, useOlderNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { usePendingOverlay } from "@/lib/notes/usePendingOverlay";
import { useIngestStore } from "@/lib/store/ingest";
import type { Section } from "@/lib/tasks/overview";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { useTvState } from "@/lib/tv/queries";
import { boardLive } from "@/lib/tv/state";
import { useSearchHold } from "@/lib/ui/searchHold";
import { useFlash } from "@/lib/useFlash";
import { useNow } from "@/lib/useNow";

/** A receipt stays on the screen long enough to be read over the shoulder of a thought. */
const RECEIPT_MS = 4_000;

const EMPTY: Note[] = [];


const TABS: readonly NoteFilter[] = ["active", "boards", "converted", "trash"];

/**
 * «Заметки» — the director's own thoughts (D-75), in the language of «Задачи» (D-83, D-93):
 * the date and the title, a status screen that is also the recorder — how many thoughts,
 * the latest, the week; hold the microphone and talk, or type — then four tabs «Мысли /
 * Доски / В деле / Корзина» that stick under the header, and the notes as cards that open in
 * place. «Доски» (D-102) hold the boards: points said one press at a time, put on the wall.
 * Reminders ring from here (D-95), a thought without network waits on the phone and shows
 * as «ждёт связи», older notes come by «Показать раньше», the bin keeps three days.
 * Nobody else ever sees this screen or these rows: privacy follows the author (D-75 §3).
 */
export default function NotesPage() {
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const create = useCreateNote(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const restore = useRestoreNote(me.data);
  const purge = usePurgeNotes(me.data);
  const boards = useBoards(me.data?.userId);
  const createBoard = useCreateBoard(me.data);
  const restoreBoard = useRestoreBoard(me.data);
  const purgeBoards = usePurgeBoards(me.data);
  const movePoint = useMovePoint(me.data);
  const tv = useTvState();
  const router = useRouter();
  const startFromNote = useIngestStore((state) => state.startFromNote);
  const writing = useIsMutating({ mutationKey: ["notes"] }) > 0;
  const now = useNow();

  const params = useSearchParams();
  // «‹ Заметки · доски» from a board comes back to the boards (/notes?tab=boards)
  const [filter, setFilter] = useState<NoteFilter>(() => {
    const tab = params.get("tab");
    return TABS.includes(tab as NoteFilter) ? (tab as NoteFilter) : "active";
  });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [purging, setPurging] = useState<Purge | null>(null);
  const [reminding, setReminding] = useState<Note | null>(null);
  // «Поручить»: the people sheet over the feed, the task leaves from here (D-108)
  const [assigning, setAssigning] = useState<Note | null>(null);
  // «На доску» (D-140): the thought becomes a point of the board picked in the sheet
  const [boarding, setBoarding] = useState<Note | null>(null);
  const [receipt, flash] = useFlash<Receipt>(RECEIPT_MS);
  const searchField = useRef<HTMLInputElement>(null);
  const holdSearch = useSearchHold(searchField, query);

  useEffect(() => {
    if (searchOpen) searchField.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  const dictation = useDictation(me.data, flash);

  // what the server holds past the loaded feed: the numbers, «Показать раньше», the search
  const serverCounts = useNoteCounts(me.data?.userId);
  const older = useOlderNotes(me.data?.userId);
  const cached = notes.data ?? EMPTY;
  const loadedLive = useMemo(() => cached.filter((note) => note.deleted_at === null && note.board_id === null).length, [cached]);
  const hasOlder = (serverCounts.data?.live ?? 0) > loadedLive;
  const search = useNoteSearch(me.data?.userId, query, hasOlder);
  const pending = usePendingNotes(me.data?.userId);
  const hearing = useReplayHearing();

  // the feed as the director should see it: the cache, older hits of the search, edits still
  // on the phone laid over their rows, and notes that exist only on the phone so far (D-95)
  const { rows, phone: phoneOnly, waiting } = usePendingOverlay(pending, cached, { extra: search.data ?? EMPTY });

  // the boards (D-102, D-140): the live ones for their tab (the one on the wall first, then the
  // pinned), the finished ones folded under them, the deleted ones for the bin
  const wallBoardId = boardLive(tv.data ?? null, now) ? (tv.data?.board_id ?? null) : null;
  const boardPiles = useMemo(() => splitBoards(boards.data ?? [], now, wallBoardId), [boards.data, now, wallBoardId]);
  const liveBoards = useMemo(() => new Set([...boardPiles.live, ...boardPiles.finished].map((board) => board.id)), [boardPiles]);
  const titleOf = useMemo(() => new Map((boards.data ?? []).map((board) => [board.id, board.title])), [boards.data]);
  const summaries = useMemo(() => summariesOf(rows), [rows]);
  const { shownBoards, shownFinished } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const hit = (board: MindBoard) => !needle || board.title.toLowerCase().includes(needle);
    return { shownBoards: boardPiles.live.filter(hit), shownFinished: boardPiles.finished.filter(hit) };
  }, [boardPiles, query]);
  const previews = useMemo(() => {
    const byBoard = new Map<string, Note[]>();
    for (const row of rows) if (row.board_id) byBoard.set(row.board_id, [...(byBoard.get(row.board_id) ?? []), row]);
    return new Map([...byBoard].map(([boardId, lines]) => [boardId, previewOf(lines)]));
  }, [rows]);

  const split = useMemo(() => splitNotes(rows, now, liveBoards), [rows, now, liveBoards]);
  // the bin by branches (D-121): sub-points that left with their point ride on its card
  const bin = useMemo(() => binCards(split.trash), [split.trash]);
  const piles = useMemo(() => ({ ...split, trash: bin.map((entry) => entry.card) }), [split, bin]);
  const ridersOf = useMemo(() => new Map(bin.map((entry) => [entry.card.id, entry.riders.map((rider) => rider.id)])), [bin]);
  const pile = filter === "active" ? piles.active : filter === "converted" ? piles.converted : filter === "trash" ? piles.trash : EMPTY;
  const shown = useMemo(() => filterNotes(pile, query), [pile, query]);
  const hero = useMemo(() => notesHero(piles, now, serverCounts.data?.thoughts), [piles, now, serverCounts.data]);
  // counts on the tabs follow the search, so a hit in another pile is visible from here;
  // without a search they are the server's — the feed may hold only the latest months
  const counts = useMemo(() => {
    if (query.trim()) {
      return {
        active: filterNotes(piles.active, query).length,
        boards: shownBoards.length + shownFinished.length,
        converted: filterNotes(piles.converted, query).length,
        trash: filterNotes(piles.trash, query).length,
      };
    }
    const server = serverCounts.data;
    return {
      active: Math.max(piles.active.length, server?.thoughts ?? 0),
      boards: boardPiles.live.length,
      converted: Math.max(piles.converted.length, server?.converted ?? 0),
      trash: piles.trash.length + boardPiles.trash.length,
    };
  }, [piles, query, serverCounts.data, shownBoards, shownFinished, boardPiles]);

  // the feed is filed by day (reminders, then pinned first); «В деле» and the bin are one plain pile each
  const sections: Section<Note>[] = useMemo(() => {
    if (filter !== "active") return shown.length ? [{ key: filter, title: "", tone: "muted", tasks: shown }] : [];
    return groupNotes(shown, now).map((group) => ({
      key: group.key,
      title: group.title,
      tone: group.key === "pinned" || group.key === "reminders" ? "accent" : "muted",
      tasks: group.notes,
    }));
  }, [filter, shown, now]);
  const groupOf = useMemo(() => {
    const map = new Map<string, NoteGroupKey>();
    for (const section of sections) for (const note of section.tasks) map.set(note.id, section.key as NoteGroupKey);
    return map;
  }, [sections]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((note) => note.id)), [sections]);
  const accordion = useAccordion(ids, { scope: `${filter}|${query.trim()}`, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);

  // a reminder's push opens /notes?n=<id>: that note opens in place once the feed is here
  const [linked, setLinked] = useState<string | null>(() => params.get("n"));
  if (linked && notes.data) {
    setLinked(null);
    if (filter !== "active") setFilter("active");
    accordion.focus(linked);
  }

  // what a note became is read from the director's tasks — only while «В деле» is on screen
  const sent = useSentTasks(filter === "converted" ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (me.isLoading || notes.isLoading || !me.data) return <NotesSkeleton />;

  // «Новая доска»: a title by date, the board opens with the microphone ready (D-102 §3)
  const newBoard = () => {
    const id = crypto.randomUUID();
    createBoard.mutate({ id, title: defaultTitle(new Date()), client_request_id: crypto.randomUUID() });
    router.push(`/notes/b/${id}`);
  };

  const boardsList = (
    <div className="card-in mt-3 flex flex-col gap-2" data-testid="boards-list">
      {query.trim() ? null : <NewBoardCard onCreate={newBoard} busy={false} />}
      {shownBoards.map((board: MindBoard) => (
        <BoardCard key={board.id} board={board} summary={summaries.get(board.id)} preview={previews.get(board.id)} onWall={boardOnWall(tv.data, board.id, now)} now={now} />
      ))}
      {shownFinished.length > 0 ? (
        // a search that hit a finished board shows it unfolded
        <FinishedBoards key={query.trim() ? "search" : "all"} count={shownFinished.length} open={query.trim() !== ""}>
          {shownFinished.map((board) => (
            <BoardCard key={board.id} board={board} summary={summaries.get(board.id)} onWall={boardOnWall(tv.data, board.id, now)} now={now} />
          ))}
        </FinishedBoards>
      ) : null}
      {/* no boards yet: «Новая доска» above is the empty state itself — a second card under it
          said the same «и выведите на стену» again; a search that found nothing says so */}
      {query.trim() && shownBoards.length + shownFinished.length === 0 ? (
        <div className="mt-1 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-8 text-center" data-testid="boards-empty">
          <Mascot state="calm" size={56} />
          <p className="mt-3 font-display text-[17px] font-semibold">Ничего не нашёл</p>
          <p className="mt-1 max-w-[280px] text-[14px] leading-[19px] text-muted">Попробуйте другое слово</p>
        </div>
      ) : null}
    </div>
  );

  const boardsInBin =
    filter === "trash" && boardPiles.trash.length > 0 ? (
      <div className="mt-1 flex flex-col gap-2">
        {boardPiles.trash.map((board) => (
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
      </div>
    ) : null;

  // a new thought goes to the feed, and the feed is shown whole
  const toFeed = () => {
    setFilter("active");
    setQuery("");
  };

  const remind = (note: Note, iso: string | null) => {
    update.mutate({ id: note.id, remind_at: iso });
    toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}` : "Напоминание снято");
  };

  const write = (text: string) => {
    toFeed();
    create.mutate({ id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID() });
    flash({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "Сохранено" });
  };

  const renderCard = (note: Note) => {
    if (filter === "converted") {
      return <ConvertedCard note={note} task={note.converted_task_id ? taskById.get(note.converted_task_id) : undefined} now={now} query={query} />;
    }
    const phone = phoneOnly.get(note.id);
    if (phone) {
      return <PendingCard note={note} voiced={phone.audio !== null} now={now} onDiscard={() => void dropCreate(note.id)} />;
    }
    if (filter === "trash") {
      const riders = ridersOf.get(note.id) ?? [];
      return (
        <TrashCard
          note={note}
          now={now}
          query={query}
          board={note.board_id ? titleOf.get(note.board_id) : undefined}
          riders={riders.length}
          onRestore={() => {
            restore.mutate({ id: note.id });
            toast(note.board_id ? "Вернул на доску" : "Вернул в мысли");
          }}
          // the point goes for good with the sub-points that rode with it
          onPurge={() => setPurging({ notes: [note.id, ...riders], boards: [], branch: riders.length > 0 })}
        />
      );
    }
    return (
      <NoteCard
        note={note}
        group={groupOf.get(note.id) ?? "today"}
        now={now}
        query={query}
        open={accordion.openId === note.id}
        busy={dictation.busy.has(note.id) || hearing.has(note.id)}
        offline={waiting.has(note.id)}
        onToggle={() => accordion.toggle(note.id)}
        onChangeText={(text) => update.mutate({ id: note.id, text })}
        onPin={() => update.mutate({ id: note.id, pinned: !note.pinned })}
        onDelete={() => {
          accordion.toggle(note.id);
          remove.mutate({ id: note.id });
        }}
        onAssign={() => setAssigning(note)}
        onAnnounce={() => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "announcement")}
        onRetranscribe={() => dictation.retranscribe(note)}
        onRemind={() => setReminding(note)}
        onToBoard={() => setBoarding(note)}
      />
    );
  };

  // the thought goes to the bottom of the board as a point; a new board is made first
  const toBoard = (target: BoardTarget) => {
    const note = boarding;
    setBoarding(null);
    if (!note) return;
    if (accordion.openId === note.id) accordion.toggle(note.id);
    const position = target.fresh ? 1 : nextPlaceIn(cached.filter((row) => row.board_id === target.id && row.deleted_at === null), null);
    movePoint.mutate(
      { note, to: { boardId: target.id, position } },
      {
        onSuccess: () =>
          toast(note.remind_at && !note.reminded_at ? `На доске «${target.title}» · напоминание снято` : `На доске «${target.title}»`, {
            action: { label: "Открыть", onClick: () => router.push(`/notes/b/${target.id}`) },
          }),
      },
    );
  };

  // no thoughts at all: the status card over the tabs already says «Пока пусто» and how to start —
  // the list under it does not say it a second time
  const saidByHero = filter === "active" && !query.trim() && hero.value === null;
  const empty = saidByHero ? null : (
    <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center" data-testid="notes-empty">
      <Mascot state="calm" size={64} />
      <p className="mt-4 font-display text-[17px] font-semibold">
        {query ? "Ничего не нашёл" : filter === "trash" ? "Корзина пуста" : filter === "converted" ? "Пока ничего не в деле" : "Пока пусто"}
      </p>
      <p className="mt-1 max-w-[280px] text-[14px] leading-[19px] text-muted">
        {query
          ? "Попробуйте другое слово"
          : filter === "trash"
            ? `Удалённая заметка ждёт здесь ${TRASH_DAYS} дня, потом исчезнет сама`
            : filter === "converted"
              ? "«Поручить» или «Объявить» на заметке — и она окажется здесь"
              : "Скажите мысль или напишите — запишу слово в слово"}
      </p>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead
        eyebrow={dateLineRu(now)}
        title="Заметки"
        actions={
          <HeadButton
            label={searchOpen ? "Закрыть поиск" : "Искать в заметках"}
            icon={searchOpen ? "close" : "search"}
            pressed={searchOpen}
            testId="notes-search-toggle"
            onClick={() => {
              if (searchOpen) setQuery("");
              setSearchOpen((open) => !open);
            }}
          />
        }
      />

      <div className="mt-3">
        <NotesRecorder hero={hero} receipt={receipt} dictation={dictation} writing={writing} onWrite={write} onCapture={toFeed} />
      </div>

      <Tabs
        className="mt-2"
        id="notes"
        testIdPrefix="notes-filter-"
        value={filter}
        onChange={(next) => setFilter(next)}
        items={[
          { key: "active", label: "Мысли", count: counts.active },
          { key: "boards", label: "Доски", count: counts.boards },
          { key: "converted", label: "В деле", count: counts.converted },
          { key: "trash", label: "Корзина", count: counts.trash },
        ]}
      >
        {searchOpen ? (
          <div className="mt-2 flex items-center gap-2 field px-3">
            <NoteIcon name="search" size={17} className="text-muted" />
            <input
              ref={searchField}
              type="search"
              value={query}
              onChange={(event) => {
                holdSearch(event.target.value);
                setQuery(event.target.value);
              }}
              placeholder={filter === "trash" ? "Найти в корзине" : filter === "converted" ? "Найти в деле" : filter === "boards" ? "Найти доску" : "Найти в заметках"}
              aria-label="Поиск по заметкам"
              className="min-h-[42px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
            {query ? (
              <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[20px] leading-none text-muted">
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </Tabs>

      {filter === "trash" && piles.trash.length + boardPiles.trash.length > 0 ? (
        <div className="mt-1 flex min-h-[36px] items-center justify-between gap-3 px-1">
          <p className="text-[13px] leading-4 text-muted">Хранится {TRASH_DAYS} дня, потом исчезнет</p>
          <Button
            variant="ghost"
            size="sm"
            className="!text-danger/80"
            onClick={() => setPurging({ notes: split.trash.map((note) => note.id), boards: boardPiles.trash.map((board) => board.id) })}
          >
            Очистить ({piles.trash.length + boardPiles.trash.length})
          </Button>
        </div>
      ) : null}

      {filter === "boards" ? (
        boardsList
      ) : (
        <>
          {boardsInBin}
          <div key={filter} className="card-in mt-1">
            {filter === "trash" && boardPiles.trash.length > 0 && sections.length === 0 ? null : (
              <TaskColumn sections={sections} empty={empty} renderCard={renderCard} />
            )}
          </div>
        </>
      )}

      {/* the feed holds the latest months; the rest is one tap away, and the search reaches it anyway */}
      {(filter === "active" || filter === "converted") && hasOlder ? (
        query.trim() ? (
          <p className="mt-3 px-1 text-center text-[13px] leading-4 text-muted" data-testid="notes-search-older">
            {search.isFetching ? "Ищу и в старых заметках…" : "Искал и в старых заметках"}
          </p>
        ) : (
          <div className="mt-3">
            <Button variant="secondary" block loading={older.isPending} data-testid="notes-older" onClick={() => older.mutate()}>
              Показать раньше
            </Button>
          </div>
        )
      ) : null}

      <NotesSheets
        me={me.data}
        assigning={assigning}
        onAssignClose={() => setAssigning(null)}
        boarding={boarding}
        onBoardClose={() => setBoarding(null)}
        boards={boardPiles.live}
        summaries={summaries}
        onBoard={toBoard}
        onNewBoard={() => {
          const id = crypto.randomUUID();
          const title = defaultTitle(new Date());
          createBoard.mutate({ id, title, client_request_id: crypto.randomUUID() }, { onSuccess: () => toBoard({ id, title, fresh: true }) });
        }}
        reminding={reminding}
        onRemindClose={() => setReminding(null)}
        onRemind={remind}
        purging={purging}
        onPurgeClose={() => setPurging(null)}
        onPurge={(what) => {
          if (what.notes.length) purge.mutate({ ids: what.notes });
          if (what.boards.length) purgeBoards.mutate({ ids: what.boards });
        }}
      />
    </main>
  );
}
