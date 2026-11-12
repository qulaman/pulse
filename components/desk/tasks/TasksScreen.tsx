"use client";

import { Bell, CalendarClock, Undo2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { TileFace } from "@/components/desk/team/TeamGrid";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel, useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { RecurrenceSection } from "@/components/recurrence/RecurrenceSection";
import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { appendPage, ARCHIVE_STATUSES, inRange, parseRange, rowsLeft, type DayRange } from "@/lib/desk/archive";
import { useDraftTasks } from "@/lib/desk/drafts";
import { useDeskLook } from "@/lib/desk/theme";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useGoneIds, usePeople } from "@/lib/people/queries";
import { hasUnread, HELD_STATUS, type BoardTask } from "@/lib/pulse/board";
import { useRecurrenceRulesSettled } from "@/lib/recurrence/queries";
import { useHydrated } from "@/lib/useHydrated";
import { queueOf, REASON_ORDER, type DeskReason } from "@/lib/tasks/desk";
import { usePurgeClosed, useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import {
  closedAtOf,
  directorScreen,
  directorTabOf,
  matchesQuery,
  peopleLoad,
  reasonFor,
  type DirectorTab,
  type Section,
} from "@/lib/tasks/overview";
import { useClosedPages, useMe, usePulseBoard, useSentTasks, useTaskArchive, useTaskSearch, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { useTaskReceipts } from "@/lib/tasks/receipts";
import { deadlineLabel, isOverdue, pluralRu, TEXT } from "@/lib/tasks/status-text";

import {
  archiveStatusOf,
  bulkPlan,
  columnFits,
  deliveryLine,
  DUE_FILTERS,
  DUE_LABEL,
  firstChanged,
  fitColumn,
  groupChoices,
  groupOf,
  handInVerdict,
  inPlaceOf,
  latestLine,
  loadStateOf,
  matchesDue,
  matchesStatus,
  parseDue,
  parseStatus,
  parseTab,
  pickedInOrder,
  pickRange,
  rowKeys,
  rowMoves,
  rowSignature,
  stageOf,
  STATUS_FILTERS,
  statusFilterLabel,
  TABS,
  tableSections,
  togglePick,
  underTitle,
  verdictRank,
  worstLoad,
  type DueFilter,
  type LoadState,
  type Move,
  type StatusFilter,
} from "@/lib/desk/tasks";
import { DateRangeField } from "./DateRange";
import { FaceName, useAvatars } from "./Face";
import { taggedActions, useWidthBucket, writeParams } from "./flow";
import { FailedScreen, LoadFailure, LoadNote } from "./LoadState";
import { MomentBar, type MomentCounter } from "./MomentBar";
import { DraftMark, MoreButton, MoveRow } from "./RowMoves";
import { DeliveryCell } from "./TaskParts";
import { deskLayerOpen, TaskPanel, type PanelNext } from "./TaskPanel";
import { useDeskActs } from "./useDeskActs";

const GLOW_MS = 1300;

/** The calm moment's quiet line on the desk: a new order is a line away, not the phone's voice (D-154). */
export const DESK_NEW_TASK = "Новую задачу — строкой сверху · Ctrl K";

/** The screen's frame while the lists land: the head, the moment (the archive has none), the tool bar, the rows. */
export function TasksSkeleton({ moment = true }: { moment?: boolean }) {
  return (
    <DeskPage>
      <PageTitle title="Задачи" />
      <SkeletonGroup className="tasks-skel flex flex-col gap-3.5" grow>
        {/* the moment's own box (a card in «Графит»), so nothing moves when it lands */}
        {moment ? (
          <div className="desk-total">
            <div className="flex h-11 items-center gap-4">
              <Bone h={36} w={32} />
              <Bone h={18} w={240} />
            </div>
          </div>
        ) : null}
        <div className="tasks-skel-bar flex h-8 items-center">
          <Bone h={14} w="56%" />
        </div>
        <div className="tasks-skel-grid desk-list">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="flex h-[34px] items-center">
              <Bone h={14} w="72%" />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Задачи» of the desk (tasks/022 A, D-154): the director's dashboard over the same data and
 * actions as the phone's «Задачи» (D-83) — the moment as one total, the three piles as a table
 * grouped by reason, person or deadline, the row's two moves under the hand, filters, and the
 * task in the right-hand panel that goes on to the next one after the director's move. Wave 3:
 * rows of 34 px with columns as wide as their words, a right click for a row's menu, rows marked
 * with Ctrl/Shift and X for a reminder, a new date or a recall in bulk (never «Принять», принцип 3).
 * «Закрытые» is the archive, by the server: when each closed and whether in time, a range of days
 * in the address, «Показать ещё» a page at a time, no total of what waits. The search reads the
 * loaded lists at once and the server's titles a moment later: on the two working tabs what it
 * finds there stands in a group of its own, «В архиве».
 */
export function TasksScreen() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  // «Повторы» stand over the table: the screen comes with them, nothing lands later
  const rulesSettled = useRecurrenceRulesSettled();
  const archiveTab = useSearchParams().get("tab") === "closed";

  const taskLoad = loadStateOf(tasks);
  const boardLoad = loadStateOf(board);
  const load = worstLoad([taskLoad, boardLoad]);
  const retry = () => {
    void tasks.refetch();
    void board.refetch();
  };
  const busy = tasks.isFetching || board.isFetching;
  // a start with no network pauses the queries before this boundary hydrates: the first render stays the server's skeleton
  const hydrated = useHydrated();
  // a state of the query, not isLoading: one enabled in this very render has not started fetching yet
  if (!hydrated || me.isPending || !rulesSettled || !me.data || load.kind === "loading") return <TasksSkeleton moment={!archiveTab} />;
  if (taskLoad.kind === "failed") return <FailedScreen title="Задачи" what="задачи" offline={taskLoad.offline} busy={busy} onRetry={retry} />;
  return <TasksView me={me.data} all={tasks.data ?? []} board={board.data ?? []} load={load} boardLoad={boardLoad} busy={busy} onRetry={retry} />;
}

type Tile = "yours" | "working" | "today" | "overdue" | "held";

/** The rows of the table as the eye sees them — sorted by a column, folded groups left out. */
function rowsOnScreen(box: HTMLElement | null): string[] {
  if (!box) return [];
  return [...box.querySelectorAll<HTMLElement>('[data-testid="desk-row"]')].map((row) => row.dataset.rowKey ?? "").filter(Boolean);
}

const NO_TASKS: TaskWithPeople[] = [];
const NO_PEOPLE: string[] = [];

const STAGE_ORDER = (task: TaskWithPeople, reason: DeskReason | null) => (reason ? REASON_ORDER.indexOf(reason) : 10 + ["sent", "accepted", "in_progress", "rework", "pending_review", "scheduled", "done", "revoked", "declined"].indexOf(task.status));

function TasksView({
  me,
  all,
  board,
  load,
  boardLoad,
  busy,
  onRetry,
}: {
  me: Me;
  all: readonly TaskWithPeople[];
  board: readonly BoardTask[];
  /** the tasks and the board together: the note over the screen */
  load: LoadState;
  /** the board alone: without it the table stands, but no word about questions can be trusted */
  boardLoad: LoadState;
  busy: boolean;
  onRetry: () => void;
}) {
  const actions = useTaskActions(me);
  const purge = usePurgeClosed();
  const pages = useClosedPages(me.userId);
  const people = usePeople();
  const goneIds = useGoneIds();
  const avatars = useAvatars();
  const now = useMinute();
  const { pointsEnabled } = useDeskScope();
  const panel = useDeskPanel();
  const params = useSearchParams();
  const context = useContextMenu();

  const openId = params.get("id");
  const who = params.get("who");
  const [query, setQueryState] = useState(() => params.get("q") ?? "");
  // the filters live in the address like the tab and the person: a link or a reload keeps them
  const status = parseStatus(params.get("status"));
  const due = parseDue(params.get("due"));
  const setStatus = (value: StatusFilter | null) => writeParams({ status: value });
  const setDue = (value: DueFilter | null) => writeParams({ due: value });
  const rangeFrom = params.get("from");
  const rangeTo = params.get("to");
  const range = useMemo(() => parseRange(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const setRange = (value: DayRange | null) => writeParams({ from: value?.from ?? null, to: value?.to ?? null });
  const [purgeAsk, setPurgeAsk] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const bucket = useWidthBucket(gridBox);
  const drafts = useDraftTasks(me.userId);

  const setQuery = (value: string) => {
    setQueryState(value);
    writeParams({ q: value.trim() ? value : null });
  };
  const openTask = useCallback((id: string) => writeParams({ id }), []);
  const closeTask = useCallback(() => writeParams({ id: null }), []);

  // the board holds the company; the table is this director's — only the author's answer closes a question
  const rows = useMemo(() => {
    const map = new Map<string, BoardTask>();
    for (const row of board) if (row.author_id === me.userId) map.set(row.id, row);
    return map;
  }, [board, me.userId]);
  const boardById = useMemo(() => new Map(board.map((row) => [row.id, row])), [board]);

  const reasons = useMemo(() => {
    const map = new Map<string, DeskReason>();
    for (const task of all) {
      const row = rows.get(task.id);
      const reason = reasonFor(task, row?.question, now, Boolean(row?.time_request));
      if (reason) map.set(task.id, reason);
    }
    return map;
  }, [all, rows, now]);
  // «Доставка»: the push receipts of every not yet accepted task — one query, one channel
  const sentIds = useMemo(() => all.filter((task) => task.status === "sent").map((task) => task.id), [all]);
  const receipts = useTaskReceipts(sentIds);
  const tabOf = useCallback((task: TaskWithPeople) => directorTabOf(task, reasons.get(task.id) ?? null), [reasons]);

  const scoped = useMemo(() => (who ? all.filter((task) => task.assignee_id === who) : all), [all, who]);
  const screen = useMemo(() => directorScreen(scoped, reasons, now), [scoped, reasons, now]);
  // the moment counts the person's piles before the filters of the tool bar
  const counts = useMemo(() => {
    const open = scoped.filter((task) => tabOf(task) !== "closed");
    return {
      yours: open.filter((task) => tabOf(task) === "yours").length,
      working: open.filter((task) => tabOf(task) === "working").length,
      today: open.filter((task) => matchesDue(task, "today", now)).length,
      overdue: open.filter((task) => isOverdue(task, now)).length,
      held: scoped.filter((task) => task.status === HELD_STATUS).length,
      todayYours: open.some((task) => tabOf(task) === "yours" && matchesDue(task, "today", now)),
    };
  }, [scoped, tabOf, now]);
  const queue = useMemo(() => queueOf(board, now).length, [board, now]);

  const found = useMemo(
    () => scoped.filter((task) => matchesQuery(task, query) && matchesStatus(task, status) && matchesDue(task, due, now)),
    [scoped, query, status, due, now],
  );
  const piles = useMemo(() => {
    const byTab: Record<DirectorTab, TaskWithPeople[]> = { yours: [], working: [], closed: [] };
    for (const task of found) byTab[tabOf(task)].push(task);
    return byTab;
  }, [found, tabOf]);

  // the first look opens where the director's move is; after that the tab is the address's
  const [firstTab] = useState<DirectorTab>(() => (counts.yours > 0 ? "yours" : "working"));
  const tab = parseTab(params.get("tab")) ?? firstTab;
  const setTab = (next: DirectorTab) => writeParams({ tab: next });
  const group = groupOf(tab, params.get("group"));
  const choices = groupChoices(tab);

  /* ---- history from the server: the archive on its own tab, the search on the other two ---- */
  const archiveTab = tab === "closed";
  // the deadline filter speaks of work ahead, and a status that never lives here narrows nothing
  const archiveStatus = archiveStatusOf(status);
  const archive = useTaskArchive(me.userId, { range, who, status: archiveStatus, text: query }, archiveTab);
  const search = useTaskSearch({ text: query, assignees: who ? [who] : NO_PEOPLE, closedOnly: true, enabled: !archiveTab });
  const archiveLoad = loadStateOf(archive.query);

  // the server's pages, and what only this screen knows yet: a task closed a second ago, a search
  // that fits a description or a person's name (the server reads titles)
  const closedRows = useMemo(() => {
    if (!archiveTab) return NO_TASKS;
    const known = scoped.filter((task) => tabOf(task) === "closed" && matchesQuery(task, query) && matchesStatus(task, archiveStatus) && inRange(closedAtOf(task), range));
    return appendPage(archive.rows, known);
  }, [archiveTab, archive.rows, scoped, tabOf, query, archiveStatus, range]);

  // «В архиве» on the two working tabs: what the search found and neither of them holds
  const archived = useMemo(() => {
    if (archiveTab || !query.trim()) return NO_TASKS;
    const own = new Map(all.map((task) => [task.id, task]));
    return appendPage(search.rows.filter((task) => matchesStatus(task, status) && matchesDue(task, due, now)), piles.closed)
      .filter((task) => {
        const row = own.get(task.id);
        return !row || tabOf(row) === "closed";
      })
      .sort((a, b) => closedAtOf(b).localeCompare(closedAtOf(a)));
  }, [archiveTab, query, search.rows, status, due, now, piles.closed, all, tabOf]);
  const archivedIds = useMemo(() => new Set(archived.map((task) => task.id)), [archived]);

  const shown = archiveTab ? closedRows : piles[tab];
  const sections: Section<TaskWithPeople>[] = useMemo(() => {
    const own = tableSections(tab, group, shown, reasons, now);
    return archived.length > 0 ? [...own, { key: "archive", title: "В архиве", tone: "muted", tasks: archived }] : own;
  }, [tab, group, shown, archived, reasons, now]);
  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);
  // every row a table may show; a loaded list's own copy wins
  const byId = useMemo(() => new Map([...archive.rows, ...search.rows, ...all].map((task) => [task.id, task])), [archive.rows, search.rows, all]);
  const known = useMemo(() => [...byId.values()], [byId]);

  /* ---- groups fold away (DataGrid's own folding: ↑/↓ step over a folded group) ---- */
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const foldKey = (key: string) => `${tab}:${group}:${key}`;

  /* ---- the row in hand: selected, or open in the panel; a row that leaves gives its place ---- */
  const [selected, setSelected] = useState<string | null>(null);
  const focusKey = openId ?? selected;
  const [anchor, setAnchor] = useState<{ id: string; index: number; tab: DirectorTab } | null>(null);
  const at = focusKey ? ids.indexOf(focusKey) : -1;
  if (focusKey && at >= 0 && (anchor?.id !== focusKey || anchor.index !== at || anchor.tab !== tab)) setAnchor({ id: focusKey, index: at, tab });
  const gone = Boolean(focusKey) && at < 0 && anchor !== null && anchor.id === focusKey && anchor.tab === tab;
  const inPlace = gone && anchor ? inPlaceOf(ids, anchor.index) : null;
  if (!openId && selected && gone && inPlace !== selected) setSelected(inPlace);

  // the director's own move on the open task: when it leaves the tab, the panel goes on to the next one
  const [acted, setActed] = useState<string | null>(null);
  const advance = Boolean(openId && gone && inPlace && acted === openId);
  useEffect(() => {
    if (advance && inPlace) openTask(inPlace);
  }, [advance, inPlace, openTask]);
  const panelNext: PanelNext | null =
    openId && gone && !advance ? { id: acted === openId ? null : inPlace, onGo: () => inPlace && openTask(inPlace) } : null;

  /* ---- the marked rows (Ctrl/Shift-click, X, Shift+↑/↓, Ctrl+A): kept while they stay in the table ---- */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [pickFrom, setPickFrom] = useState<string | null>(null);
  const marked = useMemo(() => pickedInOrder(ids, picked), [ids, picked]);
  const markedTasks = useMemo(() => marked.map((id) => byId.get(id)).filter((task): task is TaskWithPeople => Boolean(task)), [marked, byId]);
  const plan = useMemo(
    () => bulkPlan(markedTasks.map((task) => ({ ...task, nudged_at: rows.get(task.id)?.nudged_at ?? null, time_request: rows.get(task.id)?.time_request ?? null })), now),
    [markedTasks, rows, now],
  );
  const unpick = () => {
    setPicked(new Set());
    setPickFrom(null);
  };
  const pickOne = (id: string) => {
    setPicked((was) => togglePick(was, id));
    setPickFrom(id);
  };
  const pickTo = (id: string) => {
    const range = pickRange(rowsOnScreen(gridBox.current), pickFrom ?? focusKey, id);
    setPicked((was) => new Set([...was, ...range]));
    setPickFrom(id);
  };

  // Esc takes the marks off wherever the caret is (the bar's buttons, the page) — before the panel closes
  const hasPicks = picked.size > 0;
  useEffect(() => {
    if (!hasPicks) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || isTypingTarget(event.target) || deskLayerOpen()) return;
      event.preventDefault();
      setPicked(new Set());
      setPickFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPicks]);

  /* ---- a row changed under the eyes (Realtime, or the director's own move): it glows once ---- */
  const signatures = useMemo(() => new Map(all.map((task) => [task.id, rowSignature(task, rows.get(task.id))])), [all, rows]);
  const [seen, setSeen] = useState(signatures);
  const [glow, setGlow] = useState<string | null>(null);
  if (seen !== signatures) {
    const changed = firstChanged(seen, signatures, (id) => all.find((task) => task.id === id)?.status);
    setSeen(signatures);
    if (changed) setGlow(changed);
  }
  useEffect(() => {
    if (!glow) return;
    const timer = setTimeout(() => setGlow(null), GLOW_MS);
    return () => clearTimeout(timer);
  }, [glow]);

  // the table takes the keys from the first look, and again once the panel is closed
  useEffect(() => {
    if (openId) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    gridBox.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, [openId, tab]);

  /* ---- the director's moves: the desk's own (a popover from the cell, a small dialog), not the phone's sheets ---- */
  const deskActions: TaskActions = taggedActions(
    {
      ...actions,
      reissue: (input) => actions.reissue({ ...input, onOpen: openTask }),
      reassign: (input) => actions.reassign({ ...input, onOpen: openTask }),
    },
    setActed,
  );
  const reply = (task: TaskWithPeople) => {
    setSelected(task.id);
    setFocus(task.id);
    openTask(task.id);
  };
  const acts = useDeskActs({
    base: deskActions,
    tasks: known,
    flagsOf: (id) => ({ question: rows.get(id)?.question ?? null, request: rows.get(id)?.time_request ?? null, suggestion: rows.get(id)?.suggestion ?? null }),
    now,
    companyId: me.companyId,
    onReply: reply,
    onOpen: openTask,
    afterRemove: (id) => {
      if (openId === id) closeTask();
    },
  });

  const choose = (id: string) => {
    setSelected(id);
    if (openId && openId !== id) openTask(id);
  };
  const pressMove = (move: Move, task: TaskWithPeople, target?: HTMLElement) => {
    if (move.held) return;
    setSelected(task.id);
    acts.press(move.action, task, target ? { at: target } : undefined);
  };
  const movesOf = (task: TaskWithPeople) => {
    const row = rows.get(task.id);
    return rowMoves(task, reasons.get(task.id) ?? null, { request: row?.time_request, suggestion: row?.suggestion, nudgedAt: row?.nudged_at }, now);
  };
  const keysOf = (task: TaskWithPeople) => rowKeys(task, { request: Boolean(rows.get(task.id)?.time_request) });
  const rowMenu = (task: TaskWithPeople): MenuItem[] =>
    acts.menu(task, {
      onOpenRow: () => openTask(task.id),
      extra: [{ key: "pick", label: picked.has(task.id) ? "Снять отметку" : "Отметить", hint: "X", onSelect: () => pickOne(task.id) }],
    });

  /* ---- many rows: the bar's moves, and the same as a right click on a marked row ---- */
  const bulkAnchor = (name: string) => gridBox.current?.ownerDocument.querySelector<HTMLElement>(`[data-bulk="${name}"]`) ?? null;
  const bulkItems = (at: { x: number; y: number }): MenuItem[] => [
    { key: "b-nudge", label: `Напомнить · ${plan.nudge.length}`, disabled: plan.nudge.length === 0, onSelect: () => bulkNudge() },
    { key: "b-extend", label: `Перенести срок… · ${plan.extend.length}`, disabled: plan.extend.length === 0, onSelect: () => acts.bulk.extend(plan.extend, at, unpick) },
    "separator",
    { key: "b-revoke", label: `Отозвать… · ${plan.revoke.length}`, danger: true, disabled: plan.revoke.length === 0, onSelect: () => acts.bulk.revoke(plan.revoke, unpick) },
    "separator",
    { key: "b-clear", label: "Снять отметки", hint: "Esc", onSelect: unpick },
  ];
  const bulkNudge = () => {
    acts.bulk.nudge(plan.nudge);
    unpick();
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>, row: TaskWithPeople | null) => {
    // Ctrl/Cmd+A — every row in sight is marked
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyA") {
      event.preventDefault();
      setPicked(new Set(rowsOnScreen(gridBox.current)));
      return true;
    }
    if (!isPlainKey(event)) return false;
    if (event.code === "Escape" && picked.size > 0) {
      // the marks go first; the panel closes on the next Esc
      event.preventDefault();
      unpick();
      return true;
    }
    const order = rowsOnScreen(gridBox.current);
    const step = event.code === "ArrowDown" || event.code === "KeyJ" ? 1 : event.code === "ArrowUp" || event.code === "KeyK" ? -1 : 0;
    if (step !== 0 && (event.shiftKey || event.code === "KeyJ" || event.code === "KeyK")) {
      event.preventDefault();
      const here = row ? order.indexOf(row.id) : -1;
      const next = order[here < 0 ? 0 : Math.min(order.length - 1, Math.max(0, here + step))];
      if (!next) return true;
      if (event.shiftKey) {
        // Shift+↑/↓ marks as it goes, from the row in hand
        setPicked((was) => new Set([...was, ...(row ? [row.id] : []), next]));
        setPickFrom(next);
      }
      choose(next);
      return true;
    }
    if (event.shiftKey) return false;
    if (/^Digit[1-3]$/.test(event.code)) {
      event.preventDefault();
      setTab(TABS[Number(event.code.slice(5)) - 1]);
      return true;
    }
    if (!row) return false;
    if (event.code === "KeyX") {
      event.preventDefault();
      pickOne(row.id);
      return true;
    }
    if (event.code === "Period") {
      event.preventDefault();
      gridBox.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.id)}"] [data-testid="desk-row-more"]`)?.click();
      return true;
    }
    const key = keysOf(row).find((one) => one.code === event.code);
    if (!key) return false;
    event.preventDefault();
    if (key.action === "reply") reply(row);
    else acts.press(key.action, row);
    return true;
  };

  /* ---- the mouse: Ctrl/Shift-click marks, a right click is the row's menu ---- */
  const rowOf = (target: EventTarget) => (target as Element).closest?.<HTMLElement>('[data-testid="desk-row"]') ?? null;
  const onGridMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    // Shift-click marks a range — not a stretch of selected text
    if (event.shiftKey && rowOf(event.target)) event.preventDefault();
  };
  const onGridClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = rowOf(event.target);
    const id = el?.dataset.rowKey;
    if (!id || (event.target as Element).closest("button, a, input, select, textarea, label")) return;
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) pickTo(id);
    else pickOne(id);
    setSelected(id);
  };
  const onGridMenu = (event: MouseEvent<HTMLDivElement>) => {
    const id = rowOf(event.target)?.dataset.rowKey;
    const task = id ? byId.get(id) : undefined;
    if (!task) return;
    setSelected(task.id);
    if (picked.size > 1 && picked.has(task.id)) context.open(event, bulkItems({ x: event.clientX, y: event.clientY }));
    else context.open(event, rowMenu(task));
  };

  useShortcuts("Задачи", [
    { keys: ["↑", "↓"], label: "Выбрать строку (или J / K)" },
    { keys: ["Enter"], label: "Открыть в панели" },
    { keys: ["A"], label: "Принять сданную" },
    { keys: ["R"], label: "На доработку" },
    { keys: ["O"], label: "Ответить — курсор в поле переписки" },
    { keys: ["N"], label: "Напомнить" },
    { keys: ["D"], label: "Срок — выбор даты" },
    { keys: ["T"], label: "Передать другому" },
    { keys: ["."], label: "Все действия строки (или правый клик)" },
    { keys: ["X"], label: "Отметить строку" },
    { keys: ["Shift ↑↓"], label: "Отмечать подряд" },
    { keys: ["Ctrl A"], label: "Отметить все строки" },
    { keys: ["Esc"], label: "Снять отметки, затем закрыть панель" },
    { keys: ["1", "2", "3"], label: "Вкладки: ждут вас · в работе · закрытые" },
    { keys: ["1…6"], label: "В выборе срока — быстрые варианты" },
  ]);

  /* ---- the tool bar ---- */
  const loads = useMemo(() => peopleLoad(all, reasons), [all, reasons]);
  const personOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const person of people.data ?? []) if (person.is_active && person.role !== "tv") names.set(person.id, person.full_name);
    for (const task of all) if (task.assignee?.full_name && !names.has(task.assignee_id)) names.set(task.assignee_id, task.assignee.full_name);
    const open = new Map(loads.map((load) => [load.id, load.open]));
    return [...names]
      .map(([id, name]) => ({ id, name, open: open.get(id) ?? 0 }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "ru"));
  }, [people.data, all, loads]);
  const person = who ? personOptions.find((option) => option.id === who) : undefined;

  const tile = (name: Tile) => {
    const active =
      name === "yours" || name === "working" ? tab === name && !status && !due : name === "held" ? status === HELD_STATUS : due === name;
    const press = () => {
      if (active && (name === "today" || name === "overdue" || name === "held")) {
        writeParams({ status: null, due: null });
        return;
      }
      writeParams({
        status: name === "held" ? HELD_STATUS : null,
        due: name === "today" || name === "overdue" ? name : null,
        tab: name === "yours" || name === "overdue" ? "yours" : name === "today" ? (counts.todayYours ? "yours" : "working") : "working",
      });
    };
    return { active, onClick: press };
  };
  const counters: MomentCounter[] = [
    { key: "working", label: "В работе", value: counts.working, ...tile("working") },
    { key: "today", label: "Сегодня", value: counts.today, ...tile("today") },
    { key: "overdue", label: "Просрочено", value: counts.overdue, ...tile("overdue") },
    { key: "held", label: "Отложены", value: counts.held, ...tile("held") },
  ];

  const closedLoaded = all.filter((task) => task.status === "done" || task.status === "revoked" || task.status === "declined").length;
  const declinedLoaded = all.filter((task) => task.status === "declined").length;
  // the server's count: the list holds the latest pages only, the purge takes all of them
  const closedCount = Math.max(closedLoaded, pages.total ?? 0);
  const narrowed = Boolean(who || query.trim() || status || due);
  const filtered = Boolean(query.trim() || (archiveTab ? archiveStatus || range : status || due));
  const resetFilters = () => {
    setQuery("");
    writeParams({ status: null, due: null, from: null, to: null });
  };
  const leftInArchive = rowsLeft(archive.total, archive.rows.length);

  /* ---- the table: 34 px rows, columns as wide as their words ---- */
  const panelOpen = panel.isOpen;
  // grouped by the person, the group's head names them: the column would only repeat it
  const byPerson = group === "person";
  const closedRow = (task: TaskWithPeople) => task.status === "done" || task.status === "revoked" || archivedIds.has(task.id);
  // a column with nothing to say on this tab is not drawn: history has no receipts, no waiting
  // words; the rest give way on a narrow list so that «Что» stays readable (COLUMN_FLOOR)
  const showDelivery = !panelOpen && columnFits("delivery", bucket) && shown.some((task) => task.status === "sent" || task.status === "scheduled");
  const showLast = !panelOpen && columnFits("last", bucket) && shown.some((task) => latestLine(task, rows.get(task.id), now) !== null);
  // grouped by the reason or the stage, the group's head already says it
  const showStage = group !== "reason" && columnFits("stage", bucket);
  const showWho = !byPerson && columnFits("who", bucket);
  const showDue = columnFits("due", bucket);
  // the verdict leaves with the tick: on the narrowest list «Закрыта» says the most
  // the archive's own column: the panel says the same, so it leaves as early as the stage does
  const showVerdict = columnFits("stage", bucket);
  const anyPicked = picked.size > 0;
  const verdictOf = (task: TaskWithPeople) => (task.status === "pending_review" ? handInVerdict(task) : null);
  const closedText = (task: TaskWithPeople) => humanAqtobe(new Date(closedAtOf(task)), now);
  // with «Последнее» gone, a handed-in row's deadline makes room for how it was handed in; under
  // the head «Срок» a row of «В архиве» says what its date is
  const dueText = (task: TaskWithPeople) =>
    (showLast ? null : verdictOf(task)?.text) ??
    (closedRow(task) ? `закрыта ${closedText(task)}` : !task.deadline && task.priority === "high" ? TEXT.urgent : deadlineLabel(task, now).text);
  // under the floor of «Последнее» the columns keep to lower ceilings: their sum never leaves «Что» under its minimum
  const snug = !columnFits("last", bucket);
  // «Графит» shows the person's face before the name (D-171, D-174): the column keeps room for it
  const graphite = useDeskLook() === "graphite";
  const face = graphite ? 30 : 0;
  const widths = {
    who: fitColumn(shown.map((task) => shortName(task.assignee?.full_name)), { min: 96 + face, max: (snug ? 120 : 160) + face, extra: 10 + face }),
    due: fitColumn([...shown, ...archived].map(dueText), { min: 116, max: archived.length > 0 ? 196 : snug ? 132 : 172, perChar: archived.length > 0 ? 8 : undefined }),
    closed: fitColumn(shown.map(closedText), { min: 116, max: snug ? 136 : 172 }),
    verdict: fitColumn(shown.map((task) => handInVerdict(task)?.text ?? ""), { min: 84, max: snug ? 148 : 180, perChar: 8 }),
    stage: fitColumn(shown.map((task) => stageOf(task, reasons.get(task.id) ?? null, now).text), { min: 88, max: snug ? 110 : 150, extra: 34 }),
    // never narrower than its own head («ДОСТАВКА» in capitals)
    delivery: fitColumn(
      shown.map((task) => (task.status === "sent" ? (deliveryLine(task, receipts.data?.[task.id] ?? null, now)?.text ?? "") : "—")),
      { min: 104, max: snug ? 150 : 200 },
    ),
  };
  const everyColumn: Column<TaskWithPeople>[] = [
    {
      key: "pick",
      title: (
        <span className="sr-only">Отметка</span>
      ),
      // the journal: no room of its own — the mark hangs in the sheet's margin, the table starts on
      // its vertical; «Графит» holds its rows in a card that clips the margin, so the mark has a slot
      width: graphite ? "28px" : "0px",
      render: (task) => {
        const on = picked.has(task.id);
        return (
          <>
            {/* a marked row is tinted whole — the cell reaches over the row (it is the positioned parent) */}
            {on ? <span aria-hidden className="tasks-picked pointer-events-none absolute inset-0 bg-accent/[0.07]" /> : null}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={on ? "Снять отметку" : "Отметить"}
              title={`${on ? "Снять отметку" : "Отметить"} · X`}
              data-testid="desk-row-pick"
              data-on={on ? "" : undefined}
              onClick={(event) => {
                event.stopPropagation();
                pickOne(task.id);
                setSelected(task.id);
              }}
              className={`tasks-pick flex h-4 w-4 items-center justify-center rounded-[2px] border transition-opacity duration-[120ms] after:absolute ${
                graphite ? "relative after:-inset-2" : "absolute -left-[26px] top-1/2 -translate-y-1/2 after:-inset-y-2 after:-left-1 after:-right-2.5"
              } ${on ? "border-accent bg-accent text-bg opacity-100" : `border-muted/60 ${anyPicked ? "opacity-100" : "opacity-0 [.desk-row:hover_&]:opacity-100 focus-visible:opacity-100"}`}`}
            >
              {on ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </button>
          </>
        );
      },
    },
    ...(byPerson
      ? []
      : ([
          {
            key: "who",
            title: "Кто",
            width: widths.who,
            sort: (a, b) => (a.assignee?.full_name ?? "").localeCompare(b.assignee?.full_name ?? "", "ru"),
            render: (task) => (
              <span className="block" data-act-for={task.id} data-act="reassign handoff reissue">
                {graphite ? (
                  <FaceName
                    id={task.assignee_id}
                    name={task.assignee?.full_name}
                    avatar={avatars.get(task.assignee_id)}
                    muted={closedRow(task)}
                    gone={!closedRow(task) && goneIds.has(task.assignee_id)}
                  />
                ) : (
                  <PersonCell name={task.assignee?.full_name} size={24} muted={closedRow(task)} gone={!closedRow(task) && goneIds.has(task.assignee_id)} />
                )}
              </span>
            ),
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "what",
      title: "Что",
      width: columnFits("pick", bucket) ? "minmax(160px,1fr)" : "minmax(120px,1fr)",
      sort: (a, b) => a.title.localeCompare(b.title, "ru"),
      render: (task) => {
        const row = rows.get(task.id);
        const under = underTitle(task, row, me.userId, now);
        const unread = row ? hasUnread(row, me.userId) : false;
        return (
          // one line: the title, then the thread's newest word in grey — a row stays 34 px
          <span className="tasks-what flex min-w-0 items-center gap-2.5">
            <span className="shrink-0" data-testid="desk-glyph" data-status={task.status} title={stageOf(task, reasons.get(task.id) ?? null, now).text}>
              <StatusGlyph status={task.status} overdue={isOverdue(task, now)} size={16} />
            </span>
            <span className="flex min-w-0 items-baseline gap-2" title={under ? `${task.title}\n${under}` : task.title}>
              <span className={`min-w-0 shrink truncate font-medium ${closedRow(task) ? "text-text/70" : ""}`}>{task.title}</span>
              {under ? <span className="tasks-under min-w-0 max-w-[45%] shrink-[2] truncate text-[13px] text-muted">{under}</span> : null}
            </span>
            {task.recurrence_rule_id ? (
              <span className="shrink-0 text-muted" title="Повторяется">
                <Icon name="repeat" size={13} />
              </span>
            ) : null}
            {drafts.has(task.id) && task.status !== "revoked" ? <DraftMark /> : null}
            {unread ? (
              <span aria-label="новое сообщение" title="Новое сообщение" className="tasks-unread shrink-0 text-[12px] leading-4 text-accent">
                новое
              </span>
            ) : null}
          </span>
        );
      },
    },
    ...(archiveTab
      ? ([
          {
            key: "closed",
            title: "Закрыта",
            width: widths.closed,
            sort: (a, b) => closedAtOf(a).localeCompare(closedAtOf(b)),
            render: (task) => (
              <span className="block truncate whitespace-nowrap text-[13px] text-muted" data-testid="desk-row-closed">
                <When>{closedText(task)}</When>
              </span>
            ),
          },
          ...(showVerdict
            ? ([
                {
                  key: "verdict",
                  title: "В срок",
                  width: widths.verdict,
                  sort: (a, b) => verdictRank(handInVerdict(a)) - verdictRank(handInVerdict(b)),
                  render: (task) => {
                    const verdict = handInVerdict(task);
                    if (!verdict) return <span className="text-muted/60">—</span>;
                    return (
                      <span
                        className="block truncate whitespace-nowrap text-[13px]"
                        title={`Сдано ${humanAqtobe(new Date(task.completed_at as string), now)} · срок ${humanAqtobe(new Date(task.deadline as string), now)}`}
                        data-testid="desk-row-verdict"
                      >
                        <When overdue={verdict.late}>{verdict.text}</When>
                      </span>
                    );
                  },
                },
              ] satisfies Column<TaskWithPeople>[])
            : []),
        ] satisfies Column<TaskWithPeople>[])
      : []),
    {
      key: "due",
      title: "Срок",
      width: widths.due,
      sort: (a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"),
      render: (task) => {
        const verdict = verdictOf(task);
        if (verdict) {
          // a hand-in after the deadline is this row's missed deadline: the one colour it may carry (D-158)
          return (
            <span className="block truncate whitespace-nowrap text-[13px]" title={`Сдано ${verdict.text} · срок ${deadlineLabel(task, now).text}`} data-testid="desk-row-handin">
              <When overdue={verdict.late}>{dueText(task)}</When>
            </span>
          );
        }
        // a row of «В архиве» says when it closed; a refusal keeps its deadline — the director still decides it
        if (closedRow(task)) {
          return (
            <span className="block truncate whitespace-nowrap text-[13px] text-muted">
              <When>{dueText(task)}</When>
            </span>
          );
        }
        if (!task.deadline && task.priority === "high") return <span className="text-[13px] font-medium" data-act-for={task.id} data-act="extend retime">{TEXT.urgent}</span>;
        const label = deadlineLabel(task, now);
        return (
          <span className={`block truncate whitespace-nowrap text-[13px] ${label.none ? "text-muted" : ""}`} data-act-for={task.id} data-act="extend retime">
            <When overdue={label.overdue}>{label.text}</When>
          </span>
        );
      },
    },
    {
      key: "stage",
      title: "Стадия",
      width: widths.stage,
      sort: (a, b) => STAGE_ORDER(a, reasons.get(a.id) ?? null) - STAGE_ORDER(b, reasons.get(b.id) ?? null),
      // the stage in words, neutral: the ring at the title already says it (D-158)
      render: (task) => (
        <span className="block truncate text-[13px] text-text/80" data-testid="desk-stage">
          {stageOf(task, reasons.get(task.id) ?? null, now).text}
        </span>
      ),
    },
    ...(showDelivery
      ? ([{ key: "delivery", title: "Доставка", width: widths.delivery, render: (task) => <DeliveryCell task={task} receipt={receipts.data?.[task.id]} now={now} /> }] satisfies Column<TaskWithPeople>[])
      : []),
    ...(!showLast
      ? []
      : ([
          {
            key: "last",
            title: "Последнее",
            width: "minmax(0,0.8fr)",
            render: (task) => {
              const line = latestLine(task, rows.get(task.id), now);
              return line ? (
                <span className="block truncate text-[13px] text-text/80" title={line.text}>
                  {line.text}
                </span>
              ) : (
                <span className="text-muted/60">—</span>
              );
            },
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "more",
      title: "",
      width: "44px",
      align: "right",
      render: (task) => {
        const moves = movesOf(task);
        return (
          <span className="flex justify-end">
            {moves.length > 0 ? (
              // the row's two moves under the hand: over the row's right end while it is hovered or
              // chosen (with the panel open the panel holds the chosen row's moves)
              <span
                className={`desk-row-moves pointer-events-none absolute inset-y-0 right-8 hidden items-center pl-3 [.desk-row:hover_&]:pointer-events-auto [.desk-row:hover_&]:flex ${
                  panelOpen ? "" : "[.desk-row[aria-selected=true]_&]:pointer-events-auto [.desk-row[aria-selected=true]_&]:flex"
                }`}
              >
                <MoveRow className="flex-row-reverse" moves={moves} onPress={(move, target) => pressMove(move, task, target)} />
              </span>
            ) : null}
            <MoreButton
              items={() => {
                // the row's own menu: the row is the chosen one, the panel stays as it is
                setSelected(task.id);
                return rowMenu(task);
              }}
            />
          </span>
        );
      },
    },
  ];

  // the tool bar tightens with the table, so that the rows start higher: the person's list and the
  // search give up their spare width, and on the narrowest list the count (the tab says the same)
  const tight = !columnFits("delivery", bucket);
  const givenWay = new Set([!showWho && "who", (!showDue || archiveTab) && "due", !showDue && "closed", !showStage && "stage"]);
  const columns = everyColumn.filter((column) => !givenWay.has(column.key));

  const toggleFold = (section: Section<TaskWithPeople>) => {
    const key = foldKey(section.key);
    const shut = folded.has(key);
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // the chosen row folded away lets go of the choice; an open one keeps the panel
    if (!shut && selected && !openId && section.tasks.some((task) => task.id === selected)) setSelected(null);
  };
  // grouped by the person, «Графит» opens each group with the person's face
  const personTitle = (section: Section<TaskWithPeople>) => {
    const id = section.key.slice("person:".length);
    if (!graphite) return shortName(section.title);
    return (
      <span className="tasks-group-face inline-flex items-center gap-2">
        <TileFace person={{ id, full_name: section.title, avatar_url: avatars.get(id) ?? null }} size={20} />
        {shortName(section.title)}
      </span>
    );
  };
  const groups: Group<TaskWithPeople>[] = sections.map((section) => ({
    key: section.key,
    title: section.key.startsWith("person:") ? personTitle(section) : section.title,
    tone: section.tone,
    rows: section.tasks,
    collapsed: folded.has(foldKey(section.key)),
    onToggle: () => toggleFold(section),
  }));

  const boardDown = boardLoad.kind === "failed";
  // no verdict while the answer is on its way: an empty list says nothing yet
  const looking = archiveTab ? archive.busy : search.searching;
  const empty =
    looking ? (
      <EmptyState title={query.trim() ? `Ищу «${query.trim()}»…` : "Загружаю закрытые задачи…"} />
    ) : archiveTab && archiveLoad.kind === "failed" ? (
      <LoadFailure what="закрытые задачи" offline={archiveLoad.offline} busy={archive.query.isFetching} onRetry={() => void archive.query.refetch()} />
    ) : all.length === 0 ? (
      <EmptyState title="Пока ничего не отправлено" hint="Новая задача — строкой поручения сверху (Ctrl K) или голосом с телефона" />
    ) : filtered ? (
      <EmptyState
        title={query.trim() ? `Ничего не нашёл по «${query.trim()}»` : archiveTab && range ? "За этот период ничего не закрыто" : "Под эти фильтры ничего не подходит"}
        action={
          <Button size="sm" variant="secondary" onClick={resetFilters}>
            Сбросить фильтры
          </Button>
        }
      />
    ) : tab === "yours" && boardDown ? (
      // the statuses are known, the questions and the requests for time are not: no green here
      <EmptyState title="Вопросы и просьбы о сроке не загрузились" hint="Приёмки, отказов и просрочек нет, остальное станет видно после загрузки" />
    ) : tab === "yours" ? (
      <EmptyState
        tone="ok"
        title="Ваших решений ничего не ждёт"
        hint="Приёмка, вопросы, отказы и просрочки появятся здесь — и в «Разобрать» по одной"
        action={
          piles.working.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setTab("working")}>
              Что в работе · {piles.working.length}
            </Button>
          ) : undefined
        }
      />
    ) : tab === "working" ? (
      <EmptyState title="У команды нет открытых задач" hint={DESK_NEW_TASK} />
    ) : (
      <EmptyState title="Закрытых пока нет" hint="Принятые и отозванные лягут сюда по дням" />
    );

  const calm = screen.value === null && screen.closedToday === 0;

  return (
    <DeskPage>
      <PageTitle
        title="Задачи"
        actions={load.kind === "stale" ? <LoadNote state={load} failed="" now={now} onRetry={onRetry} /> : undefined}
      />

      {boardDown ? (
        <LoadFailure what="вопросы и просьбы о сроке" offline={boardLoad.offline} busy={busy} onRetry={onRetry} />
      ) : archiveTab ? null : (
        <MomentBar
          screen={screen}
          eyebrow={person ? `${shortName(person.name)} · ${screen.eyebrow}` : undefined}
          detail={calm ? DESK_NEW_TASK : undefined}
          counters={counters}
          queue={queue}
        />
      )}

      {/* the repeating orders (D-148): the phone's line and its list, a dialog here */}
      <div className="desk-repeats max-w-[560px] empty:hidden">
        <RecurrenceSection personId={who} />
      </div>

      <Toolbar
        end={
          // the button clears all of history: with a range on, its name would promise less than it does
          archiveTab && !who && !range && closedCount > 0 ? (
            <Button size="sm" variant="ghost" className="!min-h-8 !px-2" onClick={() => setPurgeAsk(true)} data-testid="desk-purge">
              Очистить закрытые
            </Button>
          ) : undefined
        }
      >
        <SegmentTabs<DirectorTab>
          aria-label="Задачи"
          value={tab}
          onChange={setTab}
          items={[
            { value: "yours", label: "Ждут вас", count: piles.yours.length },
            { value: "working", label: "В работе", count: piles.working.length },
            // a person or a filter narrows what is loaded; the plain tab counts what the server has —
            // less the refusals, which wait in «Ждут вас»
            { value: "closed", label: "Закрытые", count: archiveTab ? Math.max(closedRows.length, archive.total ?? 0) : narrowed ? Math.max(piles.closed.length, search.total ?? 0) : Math.max(piles.closed.length, closedCount - declinedLoaded) },
          ]}
        />
        <Select
          aria-label="Группы"
          value={group}
          onChange={(event) => writeParams({ group: event.target.value === choices[0].value ? null : event.target.value })}
          className="w-[140px]"
          data-testid="desk-group"
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Человек" value={who ?? ""} onChange={(event) => writeParams({ who: event.target.value || null })} className={tight ? "w-[116px]" : "w-[140px]"}>
          <option value="">Все люди</option>
          {personOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {shortName(option.name)}
              {option.open > 0 ? ` · ${option.open}` : ""}
            </option>
          ))}
        </Select>
        <Select aria-label="Статус" value={(archiveTab ? archiveStatus : status) ?? ""} onChange={(event) => setStatus(parseStatus(event.target.value))} className="w-[148px]">
          <option value="">Любой статус</option>
          {(archiveTab ? ARCHIVE_STATUSES : STATUS_FILTERS).map((value) => (
            <option key={value} value={value}>
              {statusFilterLabel(value)}
            </option>
          ))}
        </Select>
        {archiveTab ? (
          <DateRangeField value={range} onChange={setRange} now={now} />
        ) : (
          <Select aria-label="Срок" value={due ?? ""} onChange={(event) => setDue(parseDue(event.target.value))} className="w-[136px]">
            <option value="">Любой срок</option>
            {DUE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {DUE_LABEL[value]}
              </option>
            ))}
          </Select>
        )}
        <SearchField value={query} onChange={setQuery} placeholder={tight ? "Поиск" : "Поиск по задачам"} width={tight ? 128 : 176} />
      </Toolbar>

      <div ref={gridBox} data-desk-tasks="" onMouseDownCapture={onGridMouseDown} onClickCapture={onGridClick} onContextMenu={onGridMenu}>
        <DataGrid<TaskWithPeople>
          aria-label="Задачи"
          columns={columns}
          groups={groups}
          rowKey={(task) => task.id}
          selectedKey={focusKey}
          onSelect={(task) => choose(task.id)}
          onActivate={(task) => openTask(task.id)}
          // a click opens the row in the panel (master–detail)
          onRowClick={(task) => openTask(task.id)}
          rowHighlightKey={glow}
          empty={empty}
          onKey={onKey}
        />
      </div>

      {ids.length > 0 && !anyPicked ? (
        // the chosen row's letters stand on its own buttons: the hint keeps to the walk
        <p className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted" data-testid="desk-keys-hint">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Enter</Kbd> открыть
          </span>
          <span>
            <Kbd>?</Kbd> все клавиши
          </span>
        </p>
      ) : null}

      {anyPicked ? (
        // the marked rows' bar stands at the screen's foot while the table scrolls (принцип 3: no «Принять» here)
        <div className="sticky bottom-4 z-20 flex justify-center" data-testid="desk-bulk-bar">
          <div className="tasks-bulk flex items-center gap-1 rounded-[2px] border border-text bg-surface px-2 py-1">
            <span className="tasks-bulk-count nums px-2 text-[13px] leading-4">
              {/* the figure is keyed: a new count arrives instead of changing in place */}
              <b key={marked.length} className="tasks-bulk-n font-[inherit]">
                {marked.length}
              </b>{" "}
              {pluralRu(marked.length, ["отмечена", "отмечены", "отмечено"])}
            </span>
            <span aria-hidden className="tasks-bulk-rule h-5 w-px bg-border" />
            <Tooltip label="Тем, кому не напоминали последние полчаса">
              <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5 !text-text" disabled={plan.nudge.length === 0} onClick={bulkNudge} data-bulk="nudge">
                <Bell aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
                Напомнить <span className="nums text-muted">{plan.nudge.length}</span>
              </Button>
            </Tooltip>
            <Tooltip label="Один новый срок всем, кто в работе">
              <Button
                size="sm"
                variant="ghost"
                className="!min-h-8 !px-2.5 !text-text"
                disabled={plan.extend.length === 0}
                onClick={() => acts.bulk.extend(plan.extend, bulkAnchor("extend"), unpick)}
                data-bulk="extend"
              >
                <CalendarClock aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
                Перенести срок <span className="nums text-muted">{plan.extend.length}</span>
              </Button>
            </Tooltip>
            <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5 !text-danger" disabled={plan.revoke.length === 0} onClick={() => acts.bulk.revoke(plan.revoke, unpick)} data-bulk="revoke">
              <Undo2 aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
              Отозвать <span className="nums opacity-70">{plan.revoke.length}</span>
            </Button>
            <span aria-hidden className="tasks-bulk-rule h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5" onClick={unpick} data-testid="desk-bulk-clear">
              Снять <Kbd>Esc</Kbd>
            </Button>
          </div>
        </div>
      ) : null}

      {archiveTab ? <LoadNote state={archiveLoad} failed="Архив не ответил: показаны только последние закрытые" now={now} onRetry={() => void archive.query.refetch()} /> : null}
      {!archiveTab && query.trim() ? <LoadNote state={loadStateOf(search.query)} failed="Поиск по архиву не ответил" now={now} onRetry={() => void search.query.refetch()} /> : null}

      {!archiveTab && (search.total ?? 0) > search.rows.length ? (
        <p className="text-[13px] leading-[18px] text-muted" data-testid="desk-archive-cut">
          В архиве показаны последние <span className="nums">{search.rows.length}</span> из <span className="nums">{search.total}</span> ·{" "}
          <button type="button" onClick={() => setTab("closed")} className="desk-word desk-focus" data-testid="desk-archive-all">
            все в «Закрытых»
          </button>
        </p>
      ) : null}

      {archiveTab && leftInArchive > 0 ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={archive.loadingMore}
            onClick={() => void archive.more().catch(() => toast("Не получилось загрузить. Попробуйте ещё раз"))}
            data-testid="desk-archive-more"
          >
            Показать ещё · {leftInArchive}
          </Button>
        </div>
      ) : null}

      {acts.node}
      {context.node}

      <Dialog open={purgeAsk} onClose={() => setPurgeAsk(false)} title="Очистить закрытые" width="sm">
        <p className="text-[14px] leading-5 text-muted">
          Удалить {closedCount} {pluralRu(closedCount, ["закрытую задачу", "закрытые задачи", "закрытых задач"])} насовсем, вместе с перепиской? Отказы тоже уйдут.
          Начисленные очки останутся.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPurgeAsk(false)}>
            Не сейчас
          </Button>
          <Button size="sm" variant="danger" loading={purge.isPending} onClick={() => purge.mutate(undefined, { onSettled: () => setPurgeAsk(false) })}>
            Удалить
          </Button>
        </div>
      </Dialog>

      {openId ? (
        <InPanel panelKey={`task:${openId}`} onClose={closeTask}>
          <TaskPanel
            key={openId}
            taskId={openId}
            me={me}
            row={boardById.get(openId)}
            base={taggedActions(actions, setActed)}
            now={now}
            pointsEnabled={pointsEnabled}
            onOpenTask={openTask}
            onClose={closeTask}
            next={panelNext}
            focusToken={focus === openId ? 1 : 0}
            onFocused={() => setFocus(null)}
          />
        </InPanel>
      ) : null}
    </DeskPage>
  );
}
