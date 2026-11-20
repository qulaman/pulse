"use client";

import { useCallback, useEffect, useMemo, useRef, useState, ViewTransition, type KeyboardEvent, type MouseEvent } from "react";

import { useDeskParams } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel, useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Face, useAvatars } from "@/components/desk/ui/Face";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { RecurrenceSection } from "@/components/recurrence/RecurrenceSection";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { appendPage, inRange, parseRange, rowsLeft, type DayRange } from "@/lib/desk/archive";
import { useDraftTasks } from "@/lib/desk/drafts";
import { isPlainKey } from "@/lib/desk/keys";
import { SWITCH_SWAP } from "@/lib/desk/motion";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useGoneIds, usePeople } from "@/lib/people/queries";
import { HELD_STATUS, type BoardTask } from "@/lib/pulse/board";
import { useRecurrenceRulesSettled } from "@/lib/recurrence/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";
import { queueOf } from "@/lib/tasks/desk";
import { usePurgeClosed, useTaskActions } from "@/lib/tasks/mutations";
import { closedAtOf, directorScreen, directorTabOf, matchesQuery, peopleLoad, type DirectorTab, type Section } from "@/lib/tasks/overview";
import { useClosedPages, useMe, usePulseBoard, useSentTasks, useTaskArchive, useTaskSearch, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { useTaskReceipts } from "@/lib/tasks/receipts";
import { isOverdue } from "@/lib/tasks/status-text";

import {
  archiveStatusOf,
  groupChoices,
  groupOf,
  loadStateOf,
  matchesDue,
  matchesStatus,
  parseDue,
  parseStatus,
  parseTab,
  rowKeys,
  rowMoves,
  TABS,
  tableSections,
  worstLoad,
  type DueFilter,
  type LoadState,
  type Move,
  type StatusFilter,
} from "@/lib/desk/tasks";
import { taggedActions, useDirectorBoard, useWidthBucket, writeParams } from "./flow";
import { FailedScreen, LoadFailure, LoadNote } from "./LoadState";
import { DESK_NEW_TASK, MomentBar, type MomentCounter } from "./MomentBar";
import { BulkBar, PurgeDialog, TableKeysHint, TasksEmpty, TasksToolbar } from "./TableParts";
import { taskColumns } from "./taskColumns";
import { pressTaskKey } from "./taskKeys";
import { TaskPanel } from "./TaskPanel";
import { useRowActs } from "./useRowActs";
import { rowsOnScreen, useTaskSelection } from "./useTaskSelection";

/** The screen's frame while the lists land: the head, the moment (the archive has none), the tool bar, the rows. */
export function TasksSkeleton({ moment = true }: { moment?: boolean }) {
  return (
    <DeskPage>
      <PageTitle title="Задачи" />
      <SkeletonGroup className="tasks-skel flex flex-col gap-3.5" grow>
        {/* the moment's own box, so nothing moves when it lands */}
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
 * with Ctrl/Shift and X for a reminder, a new date or a recall in bulk (never «Принять», principle 3).
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
  const archiveTab = useDeskParams().get("tab") === "closed";

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

const NO_TASKS: TaskWithPeople[] = [];
const NO_PEOPLE: string[] = [];

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
  const now = useNow();
  const { pointsEnabled } = useDeskScope();
  const panel = useDeskPanel();
  const params = useDeskParams();
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
  // the panel shows another task in place (D-184)
  const openTask = useCallback((id: string) => writeParams({ id }, { type: "desk-pick" }), []);
  const closeTask = useCallback(() => writeParams({ id: null }), []);

  // the board holds the company; the table is this director's — only the author's answer closes a question
  const { rows, boardById, reasons } = useDirectorBoard(board, all, me.userId, now);
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
  // the table swaps its rows as one picture (D-184): «desk-switch» on the grid below
  const setTab = (next: DirectorTab) => writeParams({ tab: next }, { type: "desk-switch" });
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

  /* ---- the row in hand, the marked rows, the row that glows ---- */
  const { selected, setSelected, focusKey, mark, panelNext, picked, marked, plan, unpick, pickOne, pickTo, pickAll, pickStep, glow } = useTaskSelection({
    ids,
    tab,
    openId,
    openTask,
    gridBox,
    byId,
    all,
    rows,
    now,
  });

  // the table takes the keys from the first look, and again once the panel is closed
  useEffect(() => {
    if (openId) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    gridBox.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, [openId, tab]);

  /* ---- the director's moves: the desk's own (a popover from the cell, a small dialog), not the phone's sheets ---- */
  const reply = (task: TaskWithPeople) => {
    setSelected(task.id);
    setFocus(task.id);
    openTask(task.id);
  };
  const acts = useRowActs({
    actions,
    mark,
    tasks: known,
    rowOf: (id) => rows.get(id),
    now,
    companyId: me.companyId,
    openId,
    openTask,
    closeTask,
    onReply: reply,
  });

  const choose = (id: string) => {
    setSelected(id);
    // the panel follows the arrows: a quick hand sees each task at once (D-184)
    if (openId && openId !== id) writeParams({ id }, { type: "desk-pick", burst: true });
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
      pickAll();
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
      // Shift+↑/↓ marks as it goes, from the row in hand
      if (event.shiftKey) pickStep(row?.id ?? null, next);
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
    const taken = pressTaskKey(event.code, row, {
      root: gridBox.current,
      letters: keysOf(row),
      onLetter: (action) => (action === "reply" ? reply(row) : acts.press(action, row)),
    });
    if (taken) event.preventDefault();
    return taken;
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
  const { columns, tight } = taskColumns({
    shown,
    archived,
    archivedIds,
    rows,
    reasons,
    receipts: receipts.data,
    now,
    meId: me.userId,
    bucket,
    group,
    archiveTab,
    panelOpen: panel.isOpen,
    picked,
    avatars,
    goneIds,
    drafts,
    onPick: (id) => {
      pickOne(id);
      setSelected(id);
    },
    movesOf,
    onMove: pressMove,
    // the row's own menu: the row is the chosen one, the panel stays as it is
    menuOf: (task) => {
      setSelected(task.id);
      return rowMenu(task);
    },
  });

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
  // grouped by the person, each group opens with the person's face
  const personTitle = (section: Section<TaskWithPeople>) => {
    const id = section.key.slice("person:".length);
    return (
      <span className="tasks-group-face inline-flex items-center gap-2">
        <Face person={{ id, full_name: section.title, avatar_url: avatars.get(id) ?? null }} size={20} />
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
  const empty = (
    <TasksEmpty
      tab={tab}
      // no verdict while the answer is on its way: an empty list says nothing yet
      looking={archiveTab ? archive.busy : search.searching}
      query={query}
      archiveLoad={archiveTab ? archiveLoad : null}
      archiveBusy={archive.query.isFetching}
      onArchiveRetry={() => void archive.query.refetch()}
      nothingSent={all.length === 0}
      filtered={filtered}
      range={range}
      onReset={resetFilters}
      boardDown={boardDown}
      working={piles.working.length}
      onWorking={() => setTab("working")}
    />
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

      <TasksToolbar
        tab={tab}
        onTab={setTab}
        counts={{
          yours: piles.yours.length,
          working: piles.working.length,
          // a person or a filter narrows what is loaded; the plain tab counts what the server has —
          // less the refusals, which wait in «Ждут вас»
          closed: archiveTab ? Math.max(closedRows.length, archive.total ?? 0) : narrowed ? Math.max(piles.closed.length, search.total ?? 0) : Math.max(piles.closed.length, closedCount - declinedLoaded),
        }}
        group={group}
        choices={choices}
        onGroup={(value) => writeParams({ group: value === choices[0].value ? null : value })}
        who={who}
        people={personOptions}
        onWho={(id) => writeParams({ who: id })}
        archiveTab={archiveTab}
        status={archiveTab ? archiveStatus : status}
        onStatus={setStatus}
        range={range}
        onRange={setRange}
        due={due}
        onDue={setDue}
        now={now}
        query={query}
        onQuery={setQuery}
        tight={tight}
        // the button clears all of history: with a range on, its name would promise less than it does
        onPurge={archiveTab && !who && !range && closedCount > 0 ? () => setPurgeAsk(true) : null}
      />

      <ViewTransition update={SWITCH_SWAP} default="none">
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
      </ViewTransition>

      {ids.length > 0 && picked.size === 0 ? <TableKeysHint /> : null}

      {picked.size > 0 ? (
        <BulkBar
          count={marked.length}
          plan={plan}
          onNudge={bulkNudge}
          onExtend={() => acts.bulk.extend(plan.extend, bulkAnchor("extend"), unpick)}
          onRevoke={() => acts.bulk.revoke(plan.revoke, unpick)}
          onClear={unpick}
        />
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

      <PurgeDialog
        open={purgeAsk}
        count={closedCount}
        busy={purge.isPending}
        onClose={() => setPurgeAsk(false)}
        onConfirm={() => purge.mutate(undefined, { onSettled: () => setPurgeAsk(false) })}
      />

      {openId ? (
        <InPanel panelKey={`task:${openId}`} onClose={closeTask}>
          <TaskPanel
            key={openId}
            taskId={openId}
            me={me}
            row={boardById.get(openId)}
            base={taggedActions(actions, mark)}
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
