"use client";

import { Lock, Plus, Presentation } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, ViewTransition, type CSSProperties } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { Morph } from "@/components/desk/ui/Morph";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { keysTaken } from "@/components/desk/ui/layers";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { PurgeDialog, type Purge } from "@/components/desk/notes/PurgeDialog";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { SWITCH_SWAP } from "@/lib/desk/motion";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { binCards } from "@/lib/mindboard/branch";
import { BOARD_TRASH_DAYS, boardExpiresAt, defaultTitle, splitBoards, summariesOf, type BoardSummary } from "@/lib/mindboard/list";
import { useCreateBoard, useDeleteBoard, usePurgeBoards, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { pointLabel } from "@/lib/mindboard/sketch";
import { wallBoardOf } from "@/lib/mindboard/wall";
import { firstLine, trashExpiresAt, whenRu } from "@/lib/notes/list";
import { usePurgeNotes, useRestoreNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes } from "@/lib/notes/replay";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { tvTime } from "@/lib/tv/clock";
import { presenterPoints, presenterStage } from "@/lib/tv/presenter";
import { useTvState } from "@/lib/tv/queries";
import { boardLive, boardPointOf } from "@/lib/tv/state";

import { BoardRowMenu } from "./BoardRowMenu";
import { BoardSheet } from "./BoardSheet";

export type BoardsTab = "live" | "finished" | "trash";
const TABS: readonly BoardsTab[] = ["live", "finished", "trash"];
const EMPTY: Note[] = [];
const DAY_MS = 86_400_000;

const tabOf = (value: string | null): BoardsTab => (TABS.includes(value as BoardsTab) ? (value as BoardsTab) : "live");
const pointsWord = (n: number) => `${n} ${pluralRu(n, ["пункт", "пункта", "пунктов"])}`;
const daysWord = (n: number) => `${n} ${pluralRu(n, ["день", "дня", "дней"])}`;

/** «4 пункта · 1 отмечен» — what a sheet says under itself; an empty board says so. */
function countWords(summary: BoardSummary | undefined): string {
  const total = summary?.total ?? 0;
  if (total === 0) return "пусто";
  const done = summary?.done ?? 0;
  return done > 0 ? `${pointsWord(total)} · ${done} ${pluralRu(done, ["отмечен", "отмечено", "отмечено"])}` : pointsWord(total);
}

/** The lines of every board, from the one notes cache — once per change of the cache, not per tile. */
function rowsByBoard(rows: readonly Note[]): Map<string, Note[]> {
  const out = new Map<string, Note[]>();
  for (const row of rows) {
    if (row.board_id === null || row.deleted_at !== null) continue;
    const list = out.get(row.board_id) ?? [];
    list.push(row);
    out.set(row.board_id, list);
  }
  return out;
}

/**
 * «Доски» of the desk (D-177) — the meeting tool, apart from the notebook: every board as the
 * office will see it, a dark 16:9 sheet in both themes, three to five across. On top, the board
 * that is on the wall now — a live sheet, «Пункт 3 из 10», «Открыть» and «Вести совещание»
 * (Enter); the wall itself is run from its board's head and from «Экран». Tabs «В работе ·
 * Завершённые · Корзина» (1–3, `?tab=`), a search over the titles and the words of the points
 * (the cache holds every live point), N — a new board titled by its date, opened at once. The bin
 * has the deleted boards and the points deleted from live boards, «Очистить» asks once.
 */
export function BoardsGallery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useDeskParams();
  const tab = tabOf(params.get("tab"));
  const me = useMe();
  const userId = me.data?.userId;
  const boards = useBoards(userId);
  const notes = useNotes(userId);
  const pending = usePendingNotes(userId);
  const tv = useTvState();
  const now = useMinute();
  const createBoard = useCreateBoard(me.data);
  const deleteBoard = useDeleteBoard(me.data);
  const restoreBoard = useRestoreBoard(me.data);
  const restoreNote = useRestoreNote(me.data);
  const purgeBoards = usePurgeBoards(me.data);
  const purgeNotes = usePurgeNotes(me.data);
  const [query, setQuery] = useState("");
  const [purging, setPurging] = useState<Purge | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const rows = notes.data ?? EMPTY;
  const state = tv.data ?? null;
  const wallId = boardLive(state, now) ? (state?.board_id ?? null) : null;
  // a board made without network is on screen from the click, like any other (D-95)
  const all = useMemo(() => {
    const list = [...(boards.data ?? [])];
    for (const kept of pending.boards) {
      if (list.some((board) => board.id === kept.id)) continue;
      list.push({ id: kept.id, company_id: kept.companyId, user_id: kept.userId, title: kept.title, deleted_at: null, pinned_at: null, finished_at: null, client_request_id: kept.crid, created_at: kept.createdAt, updated_at: kept.createdAt });
    }
    return list;
  }, [boards.data, pending.boards]);
  const piles = useMemo(() => splitBoards(all, now, wallId), [all, now, wallId]);
  const byBoard = useMemo(() => rowsByBoard(rows), [rows]);
  const summaries = useMemo(() => summariesOf(rows), [rows]);

  const needle = query.trim().toLowerCase();
  const hit = useCallback(
    (board: MindBoard) => {
      if (!needle) return true;
      if (board.title.toLowerCase().includes(needle)) return true;
      return (byBoard.get(board.id) ?? []).some((row) => row.text.toLowerCase().includes(needle) || (row.raw_transcript ?? "").toLowerCase().includes(needle));
    },
    [needle, byBoard],
  );

  // the bin: deleted boards, and points deleted from boards that are still alive (a deleted
  // board's points ride with it); sub-points that left with their point ride on its row
  const liveIds = useMemo(() => new Set([...piles.live, ...piles.finished].map((board) => board.id)), [piles]);
  const trashPoints = useMemo(
    () =>
      rows
        .filter((row) => row.board_id !== null && row.deleted_at !== null && liveIds.has(row.board_id) && trashExpiresAt(row).getTime() > now.getTime())
        .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "")),
    [rows, liveIds, now],
  );
  const binPoints = useMemo(() => binCards(trashPoints), [trashPoints]);
  const titleOf = useMemo(() => new Map(all.map((board) => [board.id, board.title])), [all]);

  const hero = tab === "live" && wallId ? (piles.live.find((board) => board.id === wallId) ?? null) : null;
  const shown = {
    live: piles.live.filter((board) => board.id !== hero?.id && hit(board)),
    finished: piles.finished.filter(hit),
    trashBoards: piles.trash.filter(hit),
    trashPoints: binPoints.filter(({ card }) => !needle || card.text.toLowerCase().includes(needle)),
  };
  const heroShown = hero && hit(hero) ? hero : null;
  const trashCount = piles.trash.length + binPoints.length;
  const loading = me.isLoading || boards.isLoading || notes.isLoading;

  const setTab = useCallback(
    (next: BoardsTab) => {
      const query = new URLSearchParams(window.location.search);
      if (next === "live") query.delete("tab");
      else query.set("tab", next);
      const tail = query.toString();
      // the desk's own address, no trip to the server; the boards swap as two pictures (D-184)
      writeDeskAddress(tail ? `${pathname}?${tail}` : pathname, { type: "desk-switch" });
    },
    [pathname],
  );

  const open = useCallback((id: string) => router.push(`/desk/boards/${id}`), [router]);
  const lead = useCallback((id: string) => router.push(`/desk/boards/${id}?lead=1`), [router]);

  const newBoard = useCallback(() => {
    if (!me.data) return;
    const id = crypto.randomUUID();
    createBoard.mutate({ id, title: defaultTitle(new Date()), client_request_id: crypto.randomUUID() });
    router.push(`/desk/boards/${id}`);
  }, [createBoard, me.data, router]);

  const binBoard = useCallback(
    (board: MindBoard) => {
      deleteBoard.mutate({ id: board.id });
      toast(`Доска в корзине — ${daysWord(BOARD_TRASH_DAYS)} можно вернуть`, { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: board.id }) } });
    },
    [deleteBoard, restoreBoard],
  );

  // the keys of the gallery: N, 1–3, Ctrl+F, Enter — «Вести совещание» of the board on the wall
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyF") {
        search.current?.focus();
        search.current?.select();
        return true;
      }
      if (!isPlainKey(event) || event.shiftKey || isTypingTarget(event.target) || keysTaken()) return false;
      if (event.code === "KeyN") {
        newBoard();
        return true;
      }
      const digit = ["Digit1", "Digit2", "Digit3"].indexOf(event.code);
      if (digit >= 0) {
        setTab(TABS[digit]);
        return true;
      }
      // Enter on the page itself (not on a focused button or link): the meeting of the board on the wall
      const target = event.target as HTMLElement | null;
      if (event.code === "Enter" && heroShown && (!target || target === document.body || target.id === "desk-main")) {
        lead(heroShown.id);
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcuts("Доски", [
    { keys: ["N"], label: "Новая доска" },
    { keys: ["1", "2", "3"], label: "В работе · Завершённые · Корзина" },
    { keys: ["Ctrl F"], label: "Найти доску или пункт" },
    { keys: ["Enter"], label: "Вести совещание — доска на стене" },
  ]);

  const confirmPurge = (target: Purge) => {
    setPurging(null);
    if (target.boards.length > 0) purgeBoards.mutate({ ids: target.boards });
    if (target.notes.length > 0) purgeNotes.mutate({ ids: target.notes });
  };

  return (
    <DeskPage width="full">
      <div className="desk-page-title boards-head flex flex-wrap items-end justify-between gap-3" data-testid="desk-boards">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate font-display text-[28px] font-semibold leading-[34px] tracking-[-0.025em]">Доски</h1>
          <p className="boards-privacy hidden items-center gap-1.5 text-[13px] leading-4 text-muted min-[1180px]:flex">
            <Lock aria-hidden size={14} />
            только вам · на стену — для кабинета
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField ref={search} value={query} onChange={setQuery} placeholder="Найти доску или пункт" width={260} aria-label="Найти доску или пункт" />
          <SegmentTabs<BoardsTab>
            aria-label="Доски"
            value={tab}
            onChange={setTab}
            items={[
              { value: "live", label: "В работе", count: loading ? undefined : piles.live.length },
              { value: "finished", label: "Завершённые", count: loading ? undefined : piles.finished.length },
              { value: "trash", label: "Корзина", count: loading || trashCount === 0 ? undefined : trashCount },
            ]}
          />
        </div>
      </div>

      {/* the tab's blocks in one box — one picture changing in place; the page's own gap between them */}
      <ViewTransition update={SWITCH_SWAP} default="none">
        <div className="flex flex-col" style={{ gap: "inherit" }}>
          {loading ? (
            <GalleryBones />
          ) : tab === "trash" ? (
            <BoardsBin
              boards={shown.trashBoards}
              points={shown.trashPoints}
              total={{ boards: piles.trash, points: trashPoints }}
              summaries={summaries}
              titleOf={titleOf}
              now={now}
              onRestoreBoard={(board) => {
                restoreBoard.mutate({ id: board.id });
                toast("Вернул доску", { action: { label: "Открыть", onClick: () => open(board.id) } });
              }}
              onRestorePoint={(note) => {
                restoreNote.mutate({ id: note.id });
                toast("Вернул на доску", { action: { label: "Открыть", onClick: () => note.board_id && open(note.board_id) } });
              }}
              onPurge={setPurging}
            />
          ) : (
            <>
              {heroShown ? <WallHero board={heroShown} rows={byBoard.get(heroShown.id) ?? EMPTY} summary={summaries.get(heroShown.id)} now={now} onOpen={() => open(heroShown.id)} onLead={() => lead(heroShown.id)} /> : null}
              {tab === "live" && heroShown ? (
                <p className="desk-label boards-group-label -mb-2 mt-1" data-testid="boards-ready">
                  Готовятся <span className="nums text-muted">{shown.live.length}</span>
                </p>
              ) : null}
              <div className="boards-grid" data-testid="boards-grid" data-tab={tab}>
                {tab === "live" && !needle ? (
                  <button type="button" className="boards-new" onClick={newBoard} data-testid="boards-new">
                    <span className="boards-new-plate">
                      <Plus aria-hidden size={20} />
                      <span className="text-[14px] font-semibold leading-5 text-text">Новая доска</span>
                      <span className="flex items-center gap-1.5 text-[12px] leading-4 text-muted">
                        <Kbd>N</Kbd> пункты к встрече
                      </span>
                    </span>
                  </button>
                ) : null}
                {(tab === "live" ? shown.live : shown.finished).map((board) => (
                  <BoardTile key={board.id} board={board} rows={byBoard.get(board.id) ?? EMPTY} summary={summaries.get(board.id)} now={now} me={me.data} onOpen={open} onBin={binBoard} />
                ))}
              </div>
              {(tab === "live" ? shown.live.length + (heroShown ? 1 : 0) : shown.finished.length) === 0 ? (
                needle ? (
                  <EmptyState title="Ничего не нашлось" hint="Ищу в названиях досок и в словах пунктов" />
                ) : tab === "finished" ? (
                  <EmptyState title="Завершённых досок нет" hint="Доска уходит сюда, когда совещание прошло: «⋯» → «Завершить доску»" />
                ) : (
                  <p className="text-[13px] leading-5 text-muted">Доска — пункты к совещанию: их видят на стене кабинета, а вы ведёте по ним встречу.</p>
                )
              ) : null}
            </>
          )}
        </div>
      </ViewTransition>
      <PurgeDialog purging={purging} onClose={() => setPurging(null)} onConfirm={confirmPurge} />
    </DeskPage>
  );
}

/** The board on the wall now: the live sheet, where the meeting is, «Открыть» and «Вести совещание». */
function WallHero({ board, rows, summary, now, onOpen, onLead }: { board: MindBoard; rows: Note[]; summary: BoardSummary | undefined; now: Date; onOpen: () => void; onLead: () => void }) {
  const state = useTvState().data ?? null;
  const focus = boardPointOf(state, now);
  const data = useMemo(() => wallBoardOf(board, rows, { view: "list", focus }, () => null), [board, rows, focus]);
  const points = useMemo(() => presenterPoints(rows, board.id), [rows, board.id]);
  const stage = presenterStage(points, focus);
  const until = state?.board_until ? new Date(state.board_until) : null;
  const left = until ? Math.max(0, Math.round((until.getTime() - now.getTime()) / 60_000)) : null;
  const handed = rows.filter((row) => row.parent_id === null && row.converted_task_id !== null).length;
  return (
    <section className="boards-hero" data-testid="boards-hero" aria-label="Доска на стене">
      <button type="button" className="boards-hero-sheet" onClick={onOpen} aria-label={`Открыть доску «${board.title}»`}>
        <BoardSheet data={data} size="hero" foot="на стене · кабинет" clock={tvTime(now)} />
      </button>
      <div className="flex min-w-0 flex-col">
        <p className="boards-live-chip">
          <span aria-hidden className="boards-live-dot" />
          На стене{left !== null && until ? (left <= 90 ? ` · ещё ${left} мин` : ` · до ${tvTime(until)}`) : ""}
        </p>
        <h2 className="mt-3 truncate font-display text-[20px] font-semibold leading-[28px] tracking-[-0.02em]">{board.title}</h2>
        <p className="mt-2 truncate text-[16px] leading-[22px] text-muted" data-testid="boards-hero-step">
          {stage.kind === "point" ? (
            <>
              Пункт {stage.at + 1} из {stage.total} — <b className="font-semibold text-text">{stage.point.text}</b>
            </>
          ) : stage.kind === "ready" ? (
            "На стене вся доска — совещание ещё не начато"
          ) : (
            "На доске пока нет пунктов"
          )}
        </p>
        {points.length > 0 ? (
          <span aria-hidden className="boards-steps mt-3" style={{ "--steps": points.length } as CSSProperties}>
            {points.map((point, index) => (
              <i key={point.id} data-done={point.done ? "" : undefined} data-here={stage.kind === "point" && stage.at === index ? "" : undefined} />
            ))}
          </span>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Presentation aria-hidden size={16} />} onClick={onLead} data-testid="boards-hero-lead">
            Вести совещание
            <Kbd>Enter</Kbd>
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpen}>
            Открыть
          </Button>
        </div>
        <p className="mt-auto pt-5 text-[13px] leading-5 text-muted">
          {countWords(summary)}
          {handed > 0 ? ` · ${handed} ${pluralRu(handed, ["поручен", "поручено", "поручено"])}` : ""}
        </p>
      </div>
    </section>
  );
}

/** One board of the gallery: the sheet as the room will see it, the title, the count, the meter, «⋯». */
const BoardTile = memo(function BoardTile({
  board,
  rows,
  summary,
  now,
  me,
  onOpen,
  onBin,
}: {
  board: MindBoard;
  rows: Note[];
  summary: BoardSummary | undefined;
  now: Date;
  me: { userId: string } | undefined;
  onOpen: (id: string) => void;
  onBin: (board: MindBoard) => void;
}) {
  const data = useMemo(() => wallBoardOf(board, rows, { view: "list", focus: null }, () => null), [board, rows]);
  const total = summary?.total ?? 0;
  const done = summary?.done ?? 0;
  return (
    <article className="boards-tile" data-testid="boards-tile" data-finished={board.finished_at ? "" : undefined}>
      <button type="button" className="boards-tile-sheet" onClick={() => onOpen(board.id)} aria-label={`Открыть доску «${board.title}»`} data-testid="boards-open">
        <BoardSheet data={data} />
      </button>
      <div className="mt-2.5 flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* the title flies onto the board's page and back (D-184) */}
          <Morph part="board" id={board.id}>
            <p className="truncate text-[14px] font-semibold leading-5" title={board.title}>
              {board.title}
            </p>
          </Morph>
          <p className="truncate text-[13px] leading-5 text-muted">
            {countWords(summary)} · {board.finished_at ? `завершена ${whenRu(board.finished_at, now)}` : whenRu(board.updated_at, now)}
            {board.pinned_at && !board.finished_at ? " · закреплена" : ""}
          </p>
        </div>
        <BoardRowMenu board={board} me={me} onBin={onBin} />
      </div>
      {total > 0 && done > 0 ? (
        <span aria-hidden className="boards-meter" style={{ "--done": done / total } as CSSProperties}>
          <i />
        </span>
      ) : null}
    </article>
  );
});

/**
 * The bin of «Доски»: deleted boards with their points, and points deleted from boards that live
 * on — desk rows, «Вернуть» and «Удалить навсегда»; «Очистить» takes it all and asks once.
 */
function BoardsBin({
  boards,
  points,
  total,
  summaries,
  titleOf,
  now,
  onRestoreBoard,
  onRestorePoint,
  onPurge,
}: {
  boards: MindBoard[];
  points: { card: Note; riders: Note[] }[];
  total: { boards: MindBoard[]; points: Note[] };
  summaries: Map<string, BoardSummary>;
  titleOf: Map<string, string>;
  now: Date;
  onRestoreBoard: (board: MindBoard) => void;
  onRestorePoint: (note: Note) => void;
  onPurge: (purge: Purge) => void;
}) {
  const leftWords = (at: Date) => {
    const days = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
    return `исчезнет через ${daysWord(days)}`;
  };
  if (boards.length + points.length === 0) {
    return <EmptyState title="Корзина пуста" hint={`Удалённые доски и пункты ждут здесь ${daysWord(BOARD_TRASH_DAYS)}`} />;
  }
  return (
    <section className="boards-bin" data-testid="boards-bin">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-5 text-muted">Хранится {daysWord(BOARD_TRASH_DAYS)}, потом исчезнет</p>
        <Button
          size="sm"
          variant="ghost"
          className="boards-bin-clear"
          data-testid="boards-bin-clear"
          onClick={() => onPurge({ notes: total.points.map((note) => note.id), boards: total.boards.map((board) => board.id), points: true })}
        >
          Очистить
        </Button>
      </div>
      <ul className="boards-bin-list mt-2">
        {boards.map((board) => (
          <li key={board.id} className="boards-bin-row" data-testid="boards-bin-board">
            <span className="boards-bin-kind">Доска</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold leading-5">{board.title}</span>
              <span className="block truncate text-[13px] leading-5 text-muted">
                {countWords(summaries.get(board.id))} · {leftWords(boardExpiresAt(board))}
              </span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => onRestoreBoard(board)}>
              Вернуть
            </Button>
            <Button size="sm" variant="ghost" className="boards-bin-purge" onClick={() => onPurge({ notes: [], boards: [board.id] })}>
              Удалить навсегда
            </Button>
          </li>
        ))}
        {points.map(({ card, riders }) => (
          <li key={card.id} className="boards-bin-row" data-testid="boards-bin-point">
            <span className="boards-bin-kind">Пункт</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-5">{firstLine(pointLabel(card.text, card.sketch)) || "Без слов"}</span>
              <span className="block truncate text-[13px] leading-5 text-muted">
                с доски «{(card.board_id && titleOf.get(card.board_id)) || "Доска"}»
                {riders.length > 0 ? ` · и ${riders.length} ${pluralRu(riders.length, ["подпункт", "подпункта", "подпунктов"])}` : ""} · {leftWords(trashExpiresAt(card))}
              </span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => onRestorePoint(card)}>
              Вернуть
            </Button>
            <Button size="sm" variant="ghost" className="boards-bin-purge" onClick={() => onPurge({ notes: [card.id, ...riders.map((rider) => rider.id)], boards: [], branch: riders.length > 0, points: true })}>
              Удалить навсегда
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GalleryBones() {
  return (
    <SkeletonGroup className="boards-grid" grow>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} data-testid="boards-bones">
          <span className="block aspect-video w-full rounded-[12px] bg-surface-2" />
          <Bone className="mt-3" w="66%" h={16} />
          <Bone className="mt-2" w="40%" h={12} />
        </div>
      ))}
    </SkeletonGroup>
  );
}
