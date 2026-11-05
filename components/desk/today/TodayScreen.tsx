"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { taggedActions, usePanelFlow, writeParams } from "@/components/desk/tasks/flow";
import { FailedScreen, LoadFailure, LoadNote } from "@/components/desk/tasks/LoadState";
import { MomentBar, type MomentCounter } from "@/components/desk/tasks/MomentBar";
import { deskLayerOpen, TaskPanel } from "@/components/desk/tasks/TaskPanel";
import { DESK_NEW_TASK } from "@/components/desk/tasks/TasksScreen";
import { useDeskActs } from "@/components/desk/tasks/useDeskActs";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useContextMenu } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { useMinute } from "@/components/tasks/list/TaskList";
import { formatNum } from "@/lib/desk/format";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { useCalendar } from "@/lib/calendar/queries";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import { useDraftTasks } from "@/lib/desk/drafts";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { cursorStep, disputeLines, extrasWord, loadStateOf, matchesDue, orderLines, personNow, rowKeys, rowMoves, worstLoad, type LoadState, type Move, type QueryView } from "@/lib/desk/tasks";
import { isActive, useErrands } from "@/lib/errands/queries";
import { loadColor, useTeamLoads } from "@/lib/people/loads";
import { useNamesKey } from "@/lib/people/names";
import { isTeamMember, usePeople } from "@/lib/people/queries";
import { useOpenDisputes, useResolveDispute } from "@/lib/points/game";
import type { BoardTask } from "@/lib/pulse/board";
import { HELD_STATUS } from "@/lib/pulse/board";
import { usePushHealth } from "@/lib/push/health-query";
import { ordersWaiting } from "@/lib/shop/format";
import { useOrders, useSetOrderStatus } from "@/lib/shop/queries";
import { queueOf, type DeskItem, type DeskReason } from "@/lib/tasks/desk";
import { useTaskActions } from "@/lib/tasks/mutations";
import { directorScreen, directorTabOf, reasonFor } from "@/lib/tasks/overview";
import { useMe, usePulseBoard, useSentTasks, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";
import { useTvFeed } from "@/lib/tv/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits, type Visit, type VisitAnswer } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { LaunchBone, LaunchChecklist, useLaunchGate } from "./LaunchChecklist";
import { Agenda, Decisions, Feed, Overdue, Reception, reportWord, Reports, ReportsFailed, TeamNow, type ExtraDecision, type TeamRow } from "./TodayParts";

/** How many decisions stand on the screen before «…ещё N — разобрать по одной». */
const DECISIONS_SHOWN = 6;
/** How many people stand in «Команда сейчас» before «Вся команда». */
const TEAM_SHOWN = 8;
/** Where a dispute and an order are decided in full: words to the person, a cancelled order. */
const DISPUTES_HREF = "/desk/settings/points?view=disputes";
const ORDERS_HREF = "/desk/settings/points?view=shop";

/**
 * The grid of the day: the director's work on the left, the day around it on the right — one
 * column under the other once the panel takes the room (a container query, not the window's).
 */
const LAYOUT = "grid items-start gap-y-6 @min-[960px]:grid-cols-[minmax(0,1fr)_288px] @min-[960px]:gap-x-8 @min-[1100px]:grid-cols-[minmax(0,1fr)_340px] @min-[1500px]:grid-cols-[minmax(0,1fr)_420px]";

/** One block of the frame: its label, the rule of ink, rows of the block's own height. */
function BlockBone({ rows, height, label = "34%", wide = "64%" }: { rows: number; height: number; label?: string; wide?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-6 items-center">
        <Bone h={12} w={label} />
      </div>
      <div className="desk-list">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center" style={{ height }}>
            <Bone h={14} w={wide} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The frame while the first data lands: the head, the moment, the two columns. */
export function TodaySkeleton() {
  return (
    <DeskPage>
      {/* the date line's room is kept: the head does not move when the day lands */}
      <PageTitle title="Сегодня" state={{ text: "\u00a0" }} />
      <SkeletonGroup className="flex flex-col gap-3.5" grow>
        <div className="flex h-11 items-center gap-4">
          <Bone h={36} w={32} />
          <Bone h={18} w={240} />
        </div>
        <div className="@container">
          <div className={LAYOUT}>
            <div className="flex min-w-0 flex-col gap-6">
              <BlockBone rows={4} height={47} />
              <BlockBone rows={8} height={34} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <BlockBone rows={3} height={35} label="48%" wide="84%" />
              <BlockBone rows={2} height={35} label="38%" wide="72%" />
              <BlockBone rows={4} height={35} label="26%" wide="84%" />
            </div>
          </div>
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Сегодня» (D-154) — the director's home on the desk: what the moment is about and the move it
 * asks for as one total, then the work — the decisions waiting with their buttons at hand, the
 * late tasks with «Напомнить», the team now with the trouble first — and on the right the day
 * around it: the meetings, the reception, the company's last moves, the day's reports. J/K walk the
 * decisions and the late ones in the order they stand on the sheet. Every number is the
 * phone's own query; a task opens in the panel, a person leads to their tasks. A failed load is
 * said for what it is: no tasks — the screen's failure with «Повторить», never a green «всё
 * закрыто»; no queue — the same in the hero's and the decisions' place; any other block — a quiet
 * line in that block; a copy that could not be refreshed stays with the time it missed.
 */
export function TodayScreen() {
  useNamesKey();
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  const { pointsEnabled } = useDeskScope();
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
  if (!hydrated || me.isPending || !me.data || load.kind === "loading") return <TodaySkeleton />;
  if (taskLoad.kind === "failed") return <FailedScreen title="Сегодня" what="задачи" offline={taskLoad.offline} busy={busy} onRetry={retry} />;
  const view = (orders: OrdersQuery | null) => (
    <TodayView me={me.data as Me} all={tasks.data ?? []} board={board.data ?? []} load={load} boardLoad={boardLoad} busy={busy} onRetry={retry} orders={orders} />
  );
  // orders are read only where the points game is on: `useOrders` knows no switch of its own
  return pointsEnabled ? <WithOrders>{view}</WithOrders> : view(null);
}

type OrdersQuery = ReturnType<typeof useOrders>;

function WithOrders({ children }: { children: (orders: OrdersQuery) => ReactNode }) {
  return children(useOrders());
}

function TodayView({
  me,
  all,
  board,
  load,
  boardLoad,
  busy,
  onRetry,
  orders,
}: {
  me: Me;
  all: readonly TaskWithPeople[];
  board: readonly BoardTask[];
  /** the tasks and the queue together: the note over the screen */
  load: LoadState;
  boardLoad: LoadState;
  busy: boolean;
  onRetry: () => void;
  /** null — the points game is off in this company */
  orders: OrdersQuery | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useMinute();
  const actions = useTaskActions(me);
  const { pointsEnabled } = useDeskScope();
  const people = usePeople();
  const loads = useTeamLoads();
  const health = usePushHealth();
  const today = todayYmd(now);
  const reports = useTeamDailyReportDay(today, me.companyId);
  const calendar = useCalendar();
  const errands = useErrands();
  const visits = useVisits();
  const feed = useTvFeed();
  const answerVisit = useAnswerVisit();
  const disputes = useOpenDisputes(pointsEnabled);
  const resolve = useResolveDispute();
  const setOrderStatus = useSetOrderStatus();
  const drafts = useDraftTasks(me.userId);
  // a company nobody has worked in yet sees what to do next, not an empty «всё закрыто» (И-77)
  const launch = useLaunchGate(me.companyId, all);
  const launching = launch.state !== "off";

  const openId = params.get("id");
  const [focus, setFocus] = useState<string | null>(null);
  const openTask = useCallback((id: string) => writeParams({ id }), []);
  const closeTask = useCallback(() => writeParams({ id: null }), []);

  /* ---- the moment: the same numbers as «Задачи» ---- */
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
  const screen = useMemo(() => directorScreen(all, reasons, now), [all, reasons, now]);
  const open = useMemo(() => all.filter((task) => directorTabOf(task, reasons.get(task.id) ?? null) !== "closed"), [all, reasons]);
  const dueToday = useMemo(() => open.filter((task) => matchesDue(task, "today", now)), [open, now]);
  const counts = {
    working: open.filter((task) => !reasons.has(task.id)).length,
    today: dueToday.length,
    overdue: open.filter((task) => isOverdue(task, now)).length,
    held: all.filter((task) => task.status === HELD_STATUS).length,
  };
  const todayTab = dueToday.some((task) => reasons.has(task.id)) ? "yours" : "working";
  const counters: MomentCounter[] = [
    { key: "working", label: "В работе", value: counts.working, href: "/desk/tasks?tab=working" },
    { key: "today", label: "Сегодня", value: counts.today, href: `/desk/tasks?tab=${todayTab}&due=today` },
    { key: "overdue", label: "Просрочено", value: counts.overdue, href: "/desk/tasks?tab=yours&due=overdue" },
    { key: "held", label: "Отложены", value: counts.held, href: `/desk/tasks?tab=working&status=${HELD_STATUS}` },
  ];

  /* ---- the queue: the decisions, and the late ones apart ---- */
  const queue = useMemo(() => queueOf(board, now), [board, now]);
  const decisions = useMemo(() => queue.filter((item) => item.reason !== "overdue"), [queue]);
  const late = useMemo(() => queue.filter((item) => item.reason === "overdue"), [queue]);
  const ids = useMemo(() => [...decisions.slice(0, DECISIONS_SHOWN), ...late].map((item) => item.task.id), [decisions, late]);
  const flow = usePanelFlow(ids, openId, openTask);

  const deskActions = taggedActions(
    {
      ...actions,
      reissue: (input) => actions.reissue({ ...input, onOpen: openTask }),
      reassign: (input) => actions.reassign({ ...input, onOpen: openTask }),
    },
    flow.mark,
  );
  const reply = (task: { id: string }) => {
    setFocus(task.id);
    openTask(task.id);
  };
  const acts = useDeskActs({
    base: deskActions,
    tasks: board,
    flagsOf: (id) => ({ question: boardById.get(id)?.question ?? null, request: boardById.get(id)?.time_request ?? null, suggestion: boardById.get(id)?.suggestion ?? null }),
    now,
    companyId: me.companyId,
    onReply: reply,
    onOpen: openTask,
    afterRemove: (id) => {
      if (openId === id) closeTask();
    },
  });
  const context = useContextMenu();
  const menuOf = (item: DeskItem) => acts.menu(item.task, { onOpenRow: () => openTask(item.task.id) });

  /* ---- the keyboard's cursor over the decisions and the late ones (J/K), the panel following it when open ---- */
  const [cursorRaw, setCursor] = useState<string | null>(null);
  const cursor = openId && ids.includes(openId) ? openId : cursorRaw && ids.includes(cursorRaw) ? cursorRaw : null;
  const itemOf = (id: string | null) => (id ? [...decisions, ...late].find((item) => item.task.id === id) : undefined);

  // the row's moves: the letters show on the row under the cursor; the hint names them all
  const movesOf = (item: DeskItem): Move[] =>
    rowMoves(item.task, item.reason, { request: item.task.time_request, suggestion: item.task.suggestion, nudgedAt: item.task.nudged_at }, now);
  const onMove = (move: Move, item: DeskItem, target?: HTMLElement) => {
    if (move.held) return;
    setCursor(item.task.id);
    acts.press(move.action, item.task, target ? { at: target } : undefined);
  };

  /* ---- what the secondary blocks know: a stale copy of everything is said once, over the screen ---- */
  const blockLoad = (query: QueryView): LoadState => {
    const state = loadStateOf(query);
    return state.kind === "stale" && load.kind === "stale" ? { kind: "ready" } : state;
  };
  const noteOf = (state: LoadState, failed: string, refetch: () => void) => <LoadNote state={state} failed={failed} now={now} onRetry={refetch} />;
  const peopleLoad = blockLoad(people);
  const teamLoad = worstLoad([peopleLoad, blockLoad(loads)]);
  const loadsMissing = loadStateOf(loads).kind === "failed";
  const calendarLoad = blockLoad(calendar);
  const feedLoad = blockLoad(feed);
  const reportsLoad = blockLoad(reports);
  const receptionLoad = worstLoad([blockLoad(visits), blockLoad(errands)]);

  /* ---- besides tasks: disputes and orders, the same two lists as «Очки и магазин» (D-133) ---- */
  const openOrders = useMemo(
    () =>
      ordersWaiting(orders?.data ?? [], me.userId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders?.data, me.userId],
  );
  const openDisputes = pointsEnabled ? (disputes.data ?? []) : [];
  const extras: ExtraDecision[] = [
    ...openDisputes.map((dispute): ExtraDecision => {
      const { title, line, refund } = disputeLines(dispute, now);
      const busyHere = resolve.isPending && resolve.variables?.id === dispute.id;
      return {
        key: `dispute:${dispute.id}`,
        kind: "dispute",
        name: dispute.user?.full_name,
        title,
        line,
        href: DISPUTES_HREF,
        moves: [
          { key: "refund", label: refund ? `Вернуть ${formatNum(refund)}` : "Вернуть", main: true, busy: busyHere, onPress: () => resolve.mutate({ id: dispute.id, refund: true }) },
          { key: "keep", label: "Оставить", main: false, busy: busyHere, onPress: () => resolve.mutate({ id: dispute.id, refund: false }) },
        ],
      };
    }),
    ...openOrders.map((order): ExtraDecision => {
      const { title, line } = orderLines(order, now);
      return {
        key: `order:${order.id}`,
        kind: "order",
        name: order.user?.full_name,
        title,
        line,
        href: ORDERS_HREF,
        moves: [
          {
            key: "deliver",
            label: "Выдал",
            main: true,
            busy: setOrderStatus.isPending && setOrderStatus.variables?.order.id === order.id,
            onPress: () => setOrderStatus.mutate({ order, status: "delivered" }),
          },
        ],
      };
    }),
  ];
  const extrasLoad = pointsEnabled ? worstLoad([blockLoad(disputes), ...(orders ? [blockLoad(orders)] : [])]) : ({ kind: "ready" } as const);
  const retryExtras = () => {
    void disputes.refetch();
    void orders?.refetch();
  };

  /* ---- the team now: trouble first ---- */
  const teamRows = useMemo(() => {
    const reportRows = new Map((reports.data?.rows ?? []).map((row) => [row.user_id, row]));
    const staff = (people.data ?? []).filter(isTeamMember);
    const byPerson = new Map<string, TaskWithPeople[]>();
    for (const task of open) {
      const list = byPerson.get(task.assignee_id);
      if (list) list.push(task);
      else byPerson.set(task.assignee_id, [task]);
    }
    return staff
      .map((person) => {
        const load = loads.data?.[person.id];
        const color = loadColor(load, person.availability === "active", now.getTime());
        // no loads to read: the person is unknown, not «свободен»
        const state = loadsMissing ? { ring: null, line: "—", rank: 4 } : personNow(person, load, color, byPerson.get(person.id) ?? [], reasons, now);
        const channel = health.data?.get(person.id);
        const row: TeamRow & { rank: number; overdue: number; active: number } = {
          id: person.id,
          name: person.full_name,
          ring: state.ring,
          line: state.line,
          report: reportWord(reportRows.get(person.id), now),
          push: channel && (channel.state === "off" || channel.state === "broken") ? (channel.state === "off" ? "без уведомлений" : "пуш не прошёл") : null,
          rank: state.rank,
          overdue: load?.overdue ?? 0,
          active: load?.active ?? 0,
        };
        return row;
      })
      .sort((a, b) => a.rank - b.rank || b.overdue - a.overdue || b.active - a.active || a.name.localeCompare(b.name, "ru"));
  }, [people.data, loads.data, loadsMissing, health.data, reports.data, open, reasons, now]);

  /* ---- the reception ---- */
  const visitRows = visits.data ?? [];
  const visitors = awaitingDirector(visitRows);
  const messages = unreadMessages(visitRows);
  const mine = (errands.data ?? []).filter((errand) => errand.author_id === me.userId && isActive(errand)).slice(0, 4);
  const answer = (visit: Visit, value: VisitAnswer) => answerVisit.mutate({ id: visit.id, answer: value });

  /* ---- the keys of the screen: J/K the cursor, Enter opens it (or the stack), the row's letters ---- */
  const latest = useRef({ queue: queue.length, openId, cursor, ids, itemOf, acts, reply, openTask });
  useLayoutEffect(() => {
    latest.current = { queue: queue.length, openId, cursor, ids, itemOf, acts, reply, openTask };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target) || deskLayerOpen()) return;
      // the panel's own keys are its own; the screen answers from itself or from nowhere
      if (target && target !== document.body && !target.closest("#desk-main")) return;
      const k = latest.current;
      const step = event.code === "KeyJ" ? 1 : event.code === "KeyK" ? -1 : 0;
      if (step !== 0) {
        const next = cursorStep(k.ids, k.cursor, step);
        if (!next) return;
        event.preventDefault();
        setCursor(next);
        if (k.openId) k.openTask(next);
        document.querySelector(`#desk-main [data-row-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.code === "Enter" || event.code === "NumpadEnter") {
        // a focused button or link takes its own Enter
        if (target?.closest?.("button, a, [role=button], [role=grid]")) return;
        if (k.cursor && k.cursor !== k.openId) {
          event.preventDefault();
          k.openTask(k.cursor);
          return;
        }
        if (k.openId || k.queue === 0) return;
        event.preventDefault();
        router.push("/desk/inbox");
        return;
      }
      if (event.code === "Escape" && k.cursor && !k.openId) {
        event.preventDefault();
        setCursor(null);
        return;
      }
      const item = k.itemOf(k.cursor);
      if (!item) return;
      if (event.code === "Period") {
        event.preventDefault();
        document.querySelector<HTMLElement>(`#desk-main [data-row-key="${CSS.escape(item.task.id)}"] [data-testid="desk-row-more"]`)?.click();
        return;
      }
      const key = rowKeys(item.task, { request: Boolean(item.task.time_request) }).find((one) => one.code === event.code);
      if (!key) return;
      event.preventDefault();
      if (key.action === "reply") k.reply(item.task);
      else k.acts.press(key.action, item.task);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useShortcuts("Сегодня", [
    { keys: ["J", "K"], label: "По решениям и просрочкам — вниз, вверх" },
    { keys: ["Enter"], label: "Открыть строку в панели (без строки — «Разобрать по одной»)" },
    { keys: ["A"], label: "Принять сданную" },
    { keys: ["R"], label: "На доработку" },
    { keys: ["O"], label: "Ответить" },
    { keys: ["N"], label: "Напомнить" },
    { keys: ["D"], label: "Срок" },
    { keys: ["T"], label: "Передать" },
    { keys: ["."], label: "Все действия строки (или правый клик)" },
    { keys: ["Esc"], label: "Убрать курсор, закрыть панель" },
  ]);

  const calm = screen.value === null && screen.closedToday === 0;
  const reportDay = reports.data && reports.data.rows.some((row) => row.state !== "off") ? reports.data : null;
  const boardDown = boardLoad.kind === "failed";
  // with no task waiting, the hero's «всё закрыто» would stand over the disputes below it
  const extrasLine = queue.length === 0 ? extrasWord(openDisputes.length, openOrders.length) : null;
  const moment = extrasLine ? { ...screen, eyebrow: "Ваш ход", tone: "warn" as const } : screen;

  return (
    <DeskPage>
      <PageTitle
        title="Сегодня"
        state={{ text: dateLine(now) }}
        actions={load.kind === "stale" ? <LoadNote state={load} failed="" now={now} onRetry={onRetry} /> : undefined}
      />

      {boardDown ? (
        <LoadFailure what="очередь решений" offline={boardLoad.offline} busy={busy} onRetry={onRetry} />
      ) : launch.state === "on" ? (
        <LaunchChecklist people={people.data ?? []} health={health.data} healthKnown={!health.isPending} onHide={launch.hide} />
      ) : launch.state === "checking" ? (
        <LaunchBone />
      ) : (
        <MomentBar screen={moment} detail={extrasLine ?? (calm ? DESK_NEW_TASK : undefined)} counters={counters} queue={queue.length} enterKey />
      )}

      <div className="@container">
        <div className={LAYOUT}>
          <div className="flex min-w-0 flex-col gap-6">
            <Decisions
              items={decisions}
              limit={DECISIONS_SHOWN}
              openId={openId}
              cursorId={cursor}
              movesOf={movesOf}
              onMove={onMove}
              onOpen={(id) => {
                setCursor(id);
                openTask(id);
              }}
              menuOf={menuOf}
              onMenu={(item, event) => {
                setCursor(item.task.id);
                context.open(event, menuOf(item));
              }}
              compact={Boolean(openId)}
              now={now}
              drafts={drafts}
              extras={extras}
              // while the launch stands, an empty block would only repeat it: the same «nothing to say» as a failed queue
              failed={boardDown || launching}
              extrasNote={noteOf(extrasLoad, "Споры и заказы не загрузились", retryExtras)}
              extrasUnknown={extrasLoad.kind === "failed"}
            />
            <Overdue
              items={late}
              openId={openId}
              cursorId={cursor}
              movesOf={movesOf}
              onMove={onMove}
              onOpen={(id) => {
                setCursor(id);
                openTask(id);
              }}
              menuOf={menuOf}
              onMenu={(item, event) => {
                setCursor(item.task.id);
                context.open(event, menuOf(item));
              }}
              now={now}
              drafts={drafts}
            />
            {decisions.length + late.length > 0 ? (
              <p className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted" data-testid="today-keys-hint">
                <span>
                  <Kbd>J</Kbd> <Kbd>K</Kbd> по строкам
                </span>
                <span>
                  <Kbd>Enter</Kbd> открыть
                </span>
                <span>
                  <Kbd>?</Kbd> все клавиши
                </span>
              </p>
            ) : null}
            <TeamNow
              rows={teamRows.slice(0, TEAM_SHOWN)}
              total={teamRows.length}
              loading={peopleLoad.kind === "loading"}
              onOpen={(id) => router.push(`/desk/tasks?who=${encodeURIComponent(id)}`)}
              note={noteOf(teamLoad, "Команда не загрузилась", () => {
                void people.refetch();
                void loads.refetch();
              })}
              failed={peopleLoad.kind === "failed"}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Agenda
              events={calendar.data ?? []}
              loading={calendarLoad.kind === "loading"}
              note={noteOf(calendarLoad, "Встречи не загрузились", () => void calendar.refetch())}
              failed={calendarLoad.kind === "failed"}
              dueToday={dueToday.length}
              dueLast={dueToday.map((task) => task.deadline).filter((at): at is string => Boolean(at)).sort().at(-1) ?? null}
              now={now}
            />
            <Reception
              visitors={visitors}
              messages={messages}
              errands={mine}
              now={now}
              onAnswer={answer}
              busyId={answerVisit.isPending ? (answerVisit.variables?.id ?? null) : null}
              note={noteOf(receptionLoad, "Приёмная не загрузилась", () => {
                void visits.refetch();
                void errands.refetch();
              })}
              failed={receptionLoad.kind === "failed"}
            />
            <Feed
              events={feed.data ?? []}
              loading={feedLoad.kind === "loading"}
              now={now}
              note={noteOf(feedLoad, "Лента не загрузилась", () => void feed.refetch())}
              failed={feedLoad.kind === "failed"}
            />
            {reportsLoad.kind === "failed" ? (
              <ReportsFailed note={noteOf(reportsLoad, "Отчёты не загрузились", () => void reports.refetch())} />
            ) : reportDay ? (
              <Reports day={reportDay} />
            ) : null}
          </div>
        </div>
      </div>

      {acts.node}
      {context.node}

      {openId ? (
        <InPanel panelKey={`task:${openId}`} onClose={closeTask}>
          <TaskPanel
            key={openId}
            taskId={openId}
            me={me}
            row={boardById.get(openId)}
            base={taggedActions(actions, flow.mark)}
            now={now}
            pointsEnabled={pointsEnabled}
            onOpenTask={openTask}
            onClose={closeTask}
            next={flow.next}
            focusToken={focus === openId ? 1 : 0}
            onFocused={() => setFocus(null)}
            bodyKeys={false}
          />
        </InPanel>
      ) : null}
    </DeskPage>
  );
}

const DATE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/** «вторник, 3 ноября» — the head's quiet line. */
function dateLine(now: Date): string {
  return DATE.format(now);
}
