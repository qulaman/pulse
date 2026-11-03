"use client";

import Link from "next/link";
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
import { StatTile } from "@/components/desk/ui/StatTile";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { RecurrenceSection } from "@/components/recurrence/RecurrenceSection";
import { Icon } from "@/components/tasks/desk/icons";
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
  closedSections,
  directorScreen,
  directorTabOf,
  matchesQuery,
  peopleLoad,
  REASON_TONE,
  reasonFor,
  workingSections,
  yoursSections,
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
  inPlaceOf,
  latestLine,
  matchesDue,
  matchesStatus,
  parseDue,
  parseStatus,
  parseTab,
  rowSignature,
  stageOf,
  STATUS_FILTERS,
  statusFilterLabel,
  underTitle,
  type DueFilter,
  type StatusFilter,
} from "@/lib/desk/tasks";
import { DeliveryCell, ToneLine } from "./TaskParts";
import { TaskPanel, type PanelNext } from "./TaskPanel";

const GLOW_MS = 1300;

/** The address of the screen, written without a navigation: `?tab`, `?who`, `?status`, `?due`, `?q`, `?id` (D-153 §1). */
function writeParams(patch: Record<string, string | null>) {
  const next = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  window.history.replaceState(null, "", text ? `${window.location.pathname}?${text}` : window.location.pathname);
}

/** The screen's frame while the lists land: the head, the state line, the tool bar, the rows. */
export function TasksSkeleton() {
  return (
    <DeskPage>
      <PageTitle title="Задачи" />
      <SkeletonGroup className="flex flex-col gap-4" grow>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Bone key={index} h={68} className="!rounded-[16px]" />
          ))}
        </div>
        <Bone h={36} w="72%" />
        <div className="flex flex-col gap-1">
          {Array.from({ length: 8 }, (_, index) => (
            <Bone key={index} h={40} />
          ))}
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Задачи» of the desk (tasks/022 A): the director's dashboard over the same data and actions as
 * the phone's «Задачи» (D-83) — the state line, the three piles as a table grouped by the
 * phone's sections, filters, and the task in the right-hand panel.
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
        <PageTitle title="Задачи" />
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
  // the state line counts the person's piles before the filters of the tool bar
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

  const sections: Section<TaskWithPeople>[] = useMemo(() => {
    if (tab === "yours") return yoursSections(piles.yours.map((task) => ({ task, reason: reasons.get(task.id) as DeskReason })));
    if (tab === "working") return workingSections(piles.working, now, { reviewTitle: "На приёмке" });
    return closedSections(piles.closed, now);
  }, [tab, piles, reasons, now]);
  const groups: Group<TaskWithPeople>[] = sections.map((section) => ({ key: section.key, title: section.title, tone: section.tone, rows: section.tasks }));
  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);

  /* ---- the row in hand: selected, or open in the panel; a row that leaves gives its place ---- */
  const [selected, setSelected] = useState<string | null>(null);
  const focusKey = openId ?? selected;
  const [anchor, setAnchor] = useState<{ id: string; index: number; tab: DirectorTab } | null>(null);
  const at = focusKey ? ids.indexOf(focusKey) : -1;
  if (focusKey && at >= 0 && (anchor?.id !== focusKey || anchor.index !== at || anchor.tab !== tab)) setAnchor({ id: focusKey, index: at, tab });
  const gone = Boolean(focusKey) && at < 0 && anchor !== null && anchor.id === focusKey && anchor.tab === tab;
  const inPlace = gone && anchor ? inPlaceOf(ids, anchor.index) : null;
  if (!openId && selected && gone && inPlace !== selected) setSelected(inPlace);
  const panelNext: PanelNext | null = openId && gone ? { id: inPlace, onGo: () => inPlace && openTask(inPlace) } : null;

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

  /* ---- the phone's controls for a row: «⋯», A, R — their sheets are the desk's dialogs ---- */
  const deskActions: TaskActions = {
    ...actions,
    reissue: (input) => actions.reissue({ ...input, onOpen: openTask }),
    reassign: (input) => actions.reassign({ ...input, onOpen: openTask }),
  };
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

  const onKey = (event: KeyboardEvent<HTMLDivElement>, row: TaskWithPeople | null) => {
    if (!row || !isPlainKey(event)) return false;
    if ((event.code === "KeyA" || event.code === "KeyR") && row.status === "pending_review") {
      event.preventDefault();
      controls.press(event.code === "KeyA" ? "approve" : "rework", row);
      return true;
    }
    if (event.code === "KeyO") {
      event.preventDefault();
      setSelected(row.id);
      setFocus(row.id);
      openTask(row.id);
      return true;
    }
    return false;
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

  const closedLoaded = all.filter((task) => task.status === "done" || task.status === "revoked" || task.status === "declined").length;
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
  const columns: Column<TaskWithPeople>[] = [
    {
      key: "who",
      title: "Кто",
      width: panel.isOpen ? "150px" : "176px",
      sort: (a, b) => (a.assignee?.full_name ?? "").localeCompare(b.assignee?.full_name ?? "", "ru"),
      render: (task) => <PersonCell name={task.assignee?.full_name} muted={task.status === "done" || task.status === "revoked"} />,
    },
    {
      key: "what",
      title: "Что",
      sort: (a, b) => a.title.localeCompare(b.title, "ru"),
      render: (task) => {
        const row = rows.get(task.id);
        const under = underTitle(task, row, me.userId, now);
        const unread = row ? hasUnread(row, me.userId) : false;
        return (
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate font-medium ${task.status === "done" || task.status === "revoked" ? "text-text/70" : ""}`} title={task.title}>
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
        );
      },
    },
    {
      key: "due",
      title: "Срок",
      width: panel.isOpen ? "112px" : "132px",
      sort: (a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"),
      render: (task) => {
        // history says when it closed; a refusal keeps its deadline — the director still decides it
        const closed = task.status === "done" || task.status === "revoked";
        if (closed) return <span className="nums text-[13px] text-muted">{humanAqtobe(new Date(closedAtOf(task)), now)}</span>;
        if (!task.deadline && task.priority === "high") return <span className="text-[13px] font-medium text-warn">{TEXT.urgent}</span>;
        const label = deadlineLabel(task, now);
        return (
          <span className={`nums text-[13px] ${label.overdue ? "font-semibold" : label.none ? "text-muted" : ""}`} style={label.overdue ? { color: "var(--danger)" } : undefined}>
            {label.text}
          </span>
        );
      },
    },
    {
      key: "stage",
      title: "Стадия",
      width: panel.isOpen ? "124px" : "136px",
      render: (task) => <ToneLine line={stageOf(task, reasons.get(task.id) ?? null, now)} className="text-[13px] font-medium" testId="desk-stage" />,
    },
    ...(panel.isOpen
      ? []
      : ([
          { key: "delivery", title: "Доставка", width: "176px", render: (task) => <DeliveryCell task={task} receipt={receipts.data?.[task.id]} now={now} /> },
          {
            key: "last",
            title: "Последнее",
            width: "minmax(0,0.8fr)",
            render: (task) => {
              const line = latestLine(task, rows.get(task.id), now);
              return line ? (
                <span className="block truncate text-[13px]" style={line.tone ? { color: TONE_VAR[line.tone] } : undefined} title={line.text}>
                  {line.text}
                </span>
              ) : (
                <span className="text-muted">—</span>
              );
            },
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "more",
      title: "",
      width: "48px",
      align: "right",
      render: (task) => (
        <button
          type="button"
          aria-label="Действия"
          title="Действия"
          data-testid="desk-row-more"
          onClick={(event) => {
            // the row's own menu: the row is the chosen one, the panel stays as it is
            event.stopPropagation();
            setSelected(task.id);
            controls.more(task);
          }}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-[8px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5.5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="18.5" cy="12" r="1.7" />
          </svg>
        </button>
      ),
    },
  ];

  const empty =
    all.length === 0 ? (
      <EmptyState title="Пока ничего не отправлено" hint="Новая задача — строкой поручения сверху (Ctrl+K) или голосом с телефона" />
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
        title="Ваших решений ничего не ждёт"
        hint="Приёмка, вопросы, отказы и просрочки появятся здесь"
        action={
          piles.working.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setTab("working")}>
              Что в работе · {piles.working.length}
            </Button>
          ) : undefined
        }
      />
    ) : (
      <EmptyState title={tab === "working" ? "У команды нет открытых задач" : "Закрытых пока нет"} />
    );

  const yoursTile = tile("yours");
  const workingTile = tile("working");
  const todayTile = tile("today");
  const overdueTile = tile("overdue");
  const heldTile = tile("held");

  return (
    <DeskPage>
      <PageTitle
        title="Задачи"
        state={{ text: [person ? shortName(person.name) : null, screen.eyebrow, screen.detail].filter(Boolean).join(" · "), tone: screen.tone }}
      />

      {/* the state line: the phone's status screen as five numbers, each a filter */}
      <div
        className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] gap-2 [&_[data-testid=stat-tile]]:min-w-0"
        data-testid="desk-tasks-state"
      >
        <StatTile label="Ждут вас" value={counts.yours} tone={counts.overdue > 0 ? "danger" : "warn"} {...yoursTile} />
        <StatTile label="В работе" value={counts.working} tone="ok" {...workingTile} />
        <StatTile label="Сегодня" value={counts.today} tone="accent" {...todayTile} />
        <StatTile label="Просрочено" value={counts.overdue} tone="danger" {...overdueTile} />
        <StatTile label="Уйдут позже" value={counts.held} tone="muted" {...heldTile} />
        <Link
          href="/desk/inbox"
          prefetch
          data-testid="desk-inbox-entry"
          className="card flex flex-col justify-center gap-0.5 px-3.5 py-3 transition-[border-color] duration-[120ms] hover:border-accent/60"
        >
          <span className="text-[12px] font-medium leading-4 text-muted">Разобрать</span>
          <span className="flex items-center gap-1.5 font-display text-[15px] font-semibold leading-7 text-accent">
            {queue > 0 ? <span className="nums">{queue}</span> : null}
            по одной →
          </span>
        </Link>
      </div>

      {/* the repeating orders (D-148): the phone's line and its list, a dialog here */}
      <div className="max-w-[560px] empty:hidden [&_[data-testid=recurrence-entry]]:mt-0 [&_[data-testid=recurrence-entry]]:min-h-[40px]">
        <RecurrenceSection personId={who} />
      </div>

      <Toolbar
        end={
          <>
            {tab === "closed" && !who && closedCount > 0 ? (
              <Button size="sm" variant="ghost" className="!px-2 !text-danger/85" onClick={() => setPurgeAsk(true)} data-testid="desk-purge">
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
            // a person or a filter narrows what is loaded; the plain tab counts what the server has
            { value: "closed", label: "Закрытые", count: narrowed ? piles.closed.length : closedCount },
          ]}
        />
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

      <div ref={gridBox}>
        <DataGrid<TaskWithPeople>
          aria-label="Задачи"
          columns={columns}
          groups={groups}
          rowKey={(task) => task.id}
          selectedKey={focusKey}
          onSelect={(task) => {
            setSelected(task.id);
            if (openId && openId !== task.id) openTask(task.id);
          }}
          onActivate={(task) => openTask(task.id)}
          // a click opens the row in the panel (master–detail)
          onRowClick={(task) => openTask(task.id)}
          rowTone={(task) => {
            const reason = reasons.get(task.id);
            return reason ? REASON_TONE[reason] : null;
          }}
          rowHighlightKey={glow}
          empty={empty}
          onKey={onKey}
        />
      </div>

      {ids.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Enter</Kbd> открыть
          </span>
          <span>
            <Kbd>A</Kbd> принять
          </span>
          <span>
            <Kbd>R</Kbd> на доработку
          </span>
          <span>
            <Kbd>O</Kbd> ответить
          </span>
          <span>
            <Kbd>Esc</Kbd> закрыть
          </span>
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
            base={actions}
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
