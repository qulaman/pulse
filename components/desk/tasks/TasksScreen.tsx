"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel, useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { RecurrenceSection } from "@/components/recurrence/RecurrenceSection";
import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { useMinute } from "@/components/tasks/list/TaskList";
import { useDirectorControls } from "@/components/tasks/list/useDirectorControls";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { isPlainKey } from "@/lib/desk/keys";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { hasUnread, HELD_STATUS, type BoardTask } from "@/lib/pulse/board";
import { useRecurrenceRulesSettled } from "@/lib/recurrence/queries";
import { queueOf, type DeskReason } from "@/lib/tasks/desk";
import { usePurgeClosed, useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import {
  closedAtOf,
  directorScreen,
  directorTabOf,
  matchesQuery,
  peopleLoad,
  REASON_TONE,
  reasonFor,
  type DirectorTab,
  type Section,
} from "@/lib/tasks/overview";
import { useClosedPages, useMe, usePulseBoard, useSentTasks, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { useTaskReceipts } from "@/lib/tasks/receipts";
import { deadlineLabel, isOverdue, pluralRu, TEXT } from "@/lib/tasks/status-text";

import {
  DUE_FILTERS,
  DUE_LABEL,
  firstChanged,
  groupChoices,
  groupOf,
  inPlaceOf,
  KEY_CAP,
  latestLine,
  matchesDue,
  matchesStatus,
  parseDue,
  parseStatus,
  parseTab,
  rowKeys,
  rowMoves,
  rowSignature,
  stageOf,
  STATUS_FILTERS,
  statusFilterLabel,
  tableSections,
  underTitle,
  type DueFilter,
  type Move,
  type StatusFilter,
} from "@/lib/desk/tasks";
import { taggedActions, writeParams } from "./flow";
import { MomentBar, type MomentCounter } from "./MomentBar";
import { MoreButton, MoveRow } from "./RowMoves";
import { DeliveryCell } from "./TaskParts";
import { TaskPanel, type PanelNext } from "./TaskPanel";

const GLOW_MS = 1300;

/** The calm moment's quiet line on the desk: a new order is a line away, not the phone's voice (D-154). */
export const DESK_NEW_TASK = "Новую задачу — строкой сверху · Ctrl K";

/** The screen's frame while the lists land: the head, the moment, the tool bar, the rows. */
export function TasksSkeleton() {
  return (
    <DeskPage>
      <PageTitle title="Задачи" />
      <SkeletonGroup className="flex flex-col gap-5" grow>
        <Bone h={138} className="!rounded-[16px]" />
        <Bone h={36} w="72%" />
        <div className="flex flex-col gap-1">
          {Array.from({ length: 8 }, (_, index) => (
            <Bone key={index} h={44} />
          ))}
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Задачи» of the desk (tasks/022 A, D-154): the director's dashboard over the same data and
 * actions as the phone's «Задачи» (D-83) — the moment as one hero, the three piles as a table
 * grouped by reason, person or deadline, the row's two moves under the hand, filters, and the
 * task in the right-hand panel that goes on to the next one after the director's move.
 */
export function TasksScreen() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  // «Повторы» stand over the table: the screen comes with them, nothing lands later
  const rulesSettled = useRecurrenceRulesSettled();

  // isPending, not isLoading: a query enabled in this very render has not started fetching yet
  if (me.isPending || tasks.isPending || board.isPending || !rulesSettled || !me.data) return <TasksSkeleton />;
  if (tasks.isError && !tasks.data) {
    return (
      <DeskPage>
        <PageTitle title="Задачи" light="muted" />
        <EmptyState title="Не смог загрузить задачи" hint="Проверьте связь — попробую ещё раз сам, как только она будет" />
      </DeskPage>
    );
  }
  return <TasksView me={me.data} all={tasks.data ?? []} board={board.data ?? []} />;
}

type Tile = "yours" | "working" | "today" | "overdue" | "held";

function TasksView({ me, all, board }: { me: Me; all: readonly TaskWithPeople[]; board: readonly BoardTask[] }) {
  const actions = useTaskActions(me);
  const purge = usePurgeClosed();
  const pages = useClosedPages(me.userId);
  const people = usePeople();
  const now = useMinute();
  const { pointsEnabled } = useDeskScope();
  const panel = useDeskPanel();
  const params = useSearchParams();

  const openId = params.get("id");
  const who = params.get("who");
  const [query, setQueryState] = useState(() => params.get("q") ?? "");
  // the filters live in the address like the tab and the person: a link or a reload keeps them
  const status = parseStatus(params.get("status"));
  const due = parseDue(params.get("due"));
  const setStatus = (value: StatusFilter | null) => writeParams({ status: value });
  const setDue = (value: DueFilter | null) => writeParams({ due: value });
  const [purgeAsk, setPurgeAsk] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);

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

  const sections: Section<TaskWithPeople>[] = useMemo(() => tableSections(tab, group, piles[tab], reasons, now), [tab, group, piles, reasons, now]);
  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);

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

  /* ---- the phone's controls for a row: «⋯», the row's moves, the letters — their sheets are the desk's dialogs ---- */
  const deskActions: TaskActions = taggedActions(
    {
      ...actions,
      reissue: (input) => actions.reissue({ ...input, onOpen: openTask }),
      reassign: (input) => actions.reassign({ ...input, onOpen: openTask }),
    },
    setActed,
  );
  const controls = useDirectorControls({
    base: deskActions,
    companyId: me.companyId,
    tasks: all,
    questionOf: (id) => rows.get(id)?.question ?? null,
    requestOf: (id) => rows.get(id)?.time_request ?? null,
    suggestionOf: (id) => rows.get(id)?.suggestion ?? null,
    now,
    onThread: false,
  });

  const choose = (id: string) => {
    setSelected(id);
    if (openId && openId !== id) openTask(id);
  };
  const reply = (task: TaskWithPeople) => {
    setSelected(task.id);
    setFocus(task.id);
    openTask(task.id);
  };
  const pressMove = (move: Move, task: TaskWithPeople) => {
    if (move.held) return;
    setSelected(task.id);
    if (move.action === "answer") reply(task);
    else controls.press(move.action, task);
  };
  const movesOf = (task: TaskWithPeople) => {
    const row = rows.get(task.id);
    return rowMoves(task, reasons.get(task.id) ?? null, { request: row?.time_request, suggestion: row?.suggestion, nudgedAt: row?.nudged_at }, now);
  };
  const keysOf = (task: TaskWithPeople) => rowKeys(task, { request: Boolean(rows.get(task.id)?.time_request) });

  const onKey = (event: KeyboardEvent<HTMLDivElement>, row: TaskWithPeople | null) => {
    if (!isPlainKey(event)) return false;
    if (!row) return false;
    const key = keysOf(row).find((one) => one.code === event.code);
    if (!key) return false;
    event.preventDefault();
    if (key.action === "reply") reply(row);
    else controls.press(key.action, row);
    return true;
  };

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
    { key: "held", label: "Позже", value: counts.held, ...tile("held") },
  ];

  const closedLoaded = all.filter((task) => task.status === "done" || task.status === "revoked" || task.status === "declined").length;
  const declinedLoaded = all.filter((task) => task.status === "declined").length;
  // the server's count: the list holds the latest pages only, the purge takes all of them
  const closedCount = Math.max(closedLoaded, pages.total ?? 0);
  const moreClosed = closedCount > closedLoaded;
  const narrowed = Boolean(who || query.trim() || status || due);
  const filtered = Boolean(query.trim() || status || due);
  const resetFilters = () => {
    setQuery("");
    writeParams({ status: null, due: null });
  };

  /* ---- the table ---- */
  const panelOpen = panel.isOpen;
  // grouped by the person, the group's head names them: the column would only repeat it
  const byPerson = group === "person";
  const columns: Column<TaskWithPeople>[] = [
    ...(byPerson
      ? []
      : ([
          {
            key: "who",
            title: "Кто",
            width: panelOpen ? "150px" : "176px",
            sort: (a, b) => (a.assignee?.full_name ?? "").localeCompare(b.assignee?.full_name ?? "", "ru"),
            render: (task) => {
              // the ring is the director's move: the tone of the reason the task waits (D-154)
              const reason = reasons.get(task.id);
              return <PersonCell name={task.assignee?.full_name} muted={task.status === "done" || task.status === "revoked"} ring={reason ? REASON_TONE[reason] : null} />;
            },
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "what",
      title: "Что",
      sort: (a, b) => a.title.localeCompare(b.title, "ru"),
      render: (task) => {
        const row = rows.get(task.id);
        const under = underTitle(task, row, me.userId, now);
        const unread = row ? hasUnread(row, me.userId) : false;
        const closed = task.status === "done" || task.status === "revoked";
        return (
          <span className="flex min-w-0 items-start gap-2.5">
            <span className="mt-px shrink-0" data-testid="desk-glyph">
              <StatusGlyph status={task.status} overdue={isOverdue(task, now)} size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`truncate font-medium ${closed ? "text-text/70" : ""}`} title={task.title}>
                  {task.title}
                </span>
                {task.recurrence_rule_id ? (
                  <span className="shrink-0 text-muted" title="Повторяется">
                    <Icon name="repeat" size={13} />
                  </span>
                ) : null}
                {unread ? <span aria-label="новое сообщение" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
              </span>
              {under ? <span className="truncate text-[12px] leading-4 text-muted">{under}</span> : null}
            </span>
          </span>
        );
      },
    },
    {
      key: "due",
      title: "Срок",
      width: panelOpen ? "124px" : "132px",
      sort: (a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"),
      render: (task) => {
        // history says when it closed; a refusal keeps its deadline — the director still decides it
        const closed = task.status === "done" || task.status === "revoked";
        if (closed) return <span className="nums block truncate whitespace-nowrap text-[13px] text-muted">{humanAqtobe(new Date(closedAtOf(task)), now)}</span>;
        if (!task.deadline && task.priority === "high") return <span className="text-[13px] font-medium text-warn">{TEXT.urgent}</span>;
        const label = deadlineLabel(task, now);
        return (
          <span
            className={`nums block truncate whitespace-nowrap text-[13px] ${label.overdue ? "font-semibold" : label.none ? "text-muted" : ""}`}
            style={label.overdue ? { color: "var(--danger)" } : undefined}
          >
            {label.text}
          </span>
        );
      },
    },
    {
      key: "stage",
      title: "Стадия",
      width: panelOpen ? "112px" : "136px",
      // the stage in words, neutral: the ring at the title already says it in colour (D-154)
      render: (task) => (
        <span className="block truncate text-[13px] text-text/80" data-testid="desk-stage">
          {stageOf(task, reasons.get(task.id) ?? null, now).text}
        </span>
      ),
    },
    ...(panelOpen
      ? []
      : ([
          { key: "delivery", title: "Доставка", width: "168px", render: (task) => <DeliveryCell task={task} receipt={receipts.data?.[task.id]} now={now} /> },
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
      width: "48px",
      align: "right",
      render: (task) => {
        const moves = movesOf(task);
        return (
          <span className="flex justify-end">
            {moves.length > 0 ? (
              // the row's two moves under the hand: over the row's right end while it is hovered or
              // chosen (with the panel open the panel holds the chosen row's moves)
              <span
                className={`desk-row-moves pointer-events-none absolute inset-y-0 right-12 hidden items-center pl-10 pr-1 [.desk-row:hover_&]:pointer-events-auto [.desk-row:hover_&]:flex [.desk-row:hover_&]:[--fill:var(--fill-hover)] ${
                  panelOpen
                    ? ""
                    : "[.desk-row[aria-selected=true]_&]:pointer-events-auto [.desk-row[aria-selected=true]_&]:flex [.desk-row.desk-row[aria-selected=true]_&]:[--fill:var(--fill-chosen)]"
                }`}
                style={{
                  ["--fill-hover" as string]: "color-mix(in srgb, var(--surface-2) 55%, color-mix(in srgb, var(--surface) 40%, var(--bg)))",
                  ["--fill-chosen" as string]: "color-mix(in srgb, var(--accent) 7%, color-mix(in srgb, var(--surface) 40%, var(--bg)))",
                  background: "linear-gradient(90deg, transparent, var(--fill) 36px)",
                }}
              >
                <MoveRow moves={moves} onPress={(move) => pressMove(move, task)} />
              </span>
            ) : null}
            <MoreButton
              onPress={() => {
                // the row's own menu: the row is the chosen one, the panel stays as it is
                setSelected(task.id);
                controls.more(task);
              }}
            />
          </span>
        );
      },
    },
  ];

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
  const groups: Group<TaskWithPeople>[] = sections.map((section) => ({
    key: section.key,
    title: section.key.startsWith("person:") ? shortName(section.title) : section.title,
    tone: section.tone,
    rows: section.tasks,
    collapsed: folded.has(foldKey(section.key)),
    onToggle: () => toggleFold(section),
  }));

  const empty =
    all.length === 0 ? (
      <EmptyState title="Пока ничего не отправлено" hint="Новая задача — строкой поручения сверху (Ctrl K) или голосом с телефона" />
    ) : filtered ? (
      <EmptyState
        title={query.trim() ? `Ничего не нашёл по «${query.trim()}»` : "Под эти фильтры ничего не подходит"}
        action={
          <Button size="sm" variant="secondary" onClick={resetFilters}>
            Сбросить фильтры
          </Button>
        }
      />
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
      <EmptyState title="Закрытых пока нет" hint="Принятые, отозванные и отказы лягут сюда по дням" />
    );

  const chosen = focusKey ? all.find((task) => task.id === focusKey) : undefined;
  const chosenKeys = chosen ? keysOf(chosen) : [];
  const calm = screen.value === null && screen.closedToday === 0;

  return (
    <DeskPage>
      <PageTitle title="Задачи" light={screen.tone} />

      <MomentBar
        screen={screen}
        eyebrow={person ? `${shortName(person.name)} · ${screen.eyebrow}` : undefined}
        detail={calm ? DESK_NEW_TASK : undefined}
        counters={counters}
        queue={queue}
      />

      {/* the repeating orders (D-148): the phone's line and its list, a dialog here */}
      <div className="max-w-[560px] empty:hidden [&_[data-testid=recurrence-entry]]:mt-0 [&_[data-testid=recurrence-entry]]:min-h-[40px]">
        <RecurrenceSection personId={who} />
      </div>

      <Toolbar
        end={
          <>
            {tab === "closed" && !who && closedCount > 0 ? (
              <Button size="sm" variant="ghost" className="!px-2" onClick={() => setPurgeAsk(true)} data-testid="desk-purge">
                Очистить закрытые
              </Button>
            ) : null}
            <span className="nums whitespace-nowrap text-[13px] leading-5 text-muted" data-testid="desk-row-count">
              {ids.length} {pluralRu(ids.length, ["задача", "задачи", "задач"])}
            </span>
          </>
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
            { value: "closed", label: "Закрытые", count: narrowed ? piles.closed.length : Math.max(piles.closed.length, closedCount - declinedLoaded) },
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
        <Select aria-label="Человек" value={who ?? ""} onChange={(event) => writeParams({ who: event.target.value || null })} className="w-[140px]">
          <option value="">Все люди</option>
          {personOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {shortName(option.name)}
              {option.open > 0 ? ` · ${option.open}` : ""}
            </option>
          ))}
        </Select>
        <Select aria-label="Статус" value={status ?? ""} onChange={(event) => setStatus(parseStatus(event.target.value))} className="w-[148px]">
          <option value="">Любой статус</option>
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {statusFilterLabel(value)}
            </option>
          ))}
        </Select>
        <Select aria-label="Срок" value={due ?? ""} onChange={(event) => setDue(parseDue(event.target.value))} className="w-[136px]">
          <option value="">Любой срок</option>
          {DUE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {DUE_LABEL[value]}
            </option>
          ))}
        </Select>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по задачам" width={176} />
      </Toolbar>

      <div ref={gridBox} data-desk-tasks="">
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

      {ids.length > 0 ? (
        // the letters of the chosen row only — a hint never names a key that does nothing here
        <p className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted" data-testid="desk-keys-hint">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Enter</Kbd> открыть
          </span>
          {chosenKeys.map((key) => (
            <span key={key.code}>
              <Kbd>{KEY_CAP[key.code]}</Kbd> {key.label}
            </span>
          ))}
          {openId ? (
            <span>
              <Kbd>Esc</Kbd> закрыть
            </span>
          ) : null}
        </p>
      ) : null}

      {tab === "closed" && moreClosed ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void pages.more().finally(() => setLoadingMore(false));
            }}
          >
            Показать ещё · {closedCount - closedLoaded}
          </Button>
        </div>
      ) : null}

      {controls.sheets}

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
