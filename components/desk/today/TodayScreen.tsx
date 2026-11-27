"use client";

import { CheckCheck, ConciergeBell, Trophy, Coffee } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { useDeskParams } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { taggedActions, useDirectorBoard, usePanelFlow, writeParams } from "@/components/desk/tasks/flow";
import { FailedScreen, LoadFailure, LoadNote } from "@/components/desk/tasks/LoadState";
import { DESK_NEW_TASK, MomentBar, momentAct, type MomentCounter } from "@/components/desk/tasks/MomentBar";
import { pressTaskKey } from "@/components/desk/tasks/taskKeys";
import { TaskPanel } from "@/components/desk/tasks/TaskPanel";
import { useCallFirst } from "@/components/desk/tasks/RowMoves";
import { useRowActs } from "@/components/desk/tasks/useRowActs";
import { useScreenKeys } from "@/components/desk/team/keys";
import { usePersonMoves } from "@/components/desk/team/PersonMoves";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { formatNum } from "@/lib/desk/format";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { nextEvent, ymdOfEvent } from "@/lib/calendar/agenda";
import { useCalendar } from "@/lib/calendar/queries";
import { humanAqtobe } from "@/lib/ai/time";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import { messagesOf, topOf } from "@/lib/desk/home";
import { useSecretaries } from "@/lib/errands/queries";
import { useRating } from "@/lib/points/queries";
import { useDraftTasks } from "@/lib/desk/drafts";
import { cursorStep, disputeLines, extrasWord, loadStateOf, matchesDue, orderLines, personNow, rowKeys, rowMoves, worstLoad, type LoadState, type Move, type QueryView } from "@/lib/desk/tasks";
import { loadColor, useTeamLoads } from "@/lib/people/loads";
import { shortName, useNamesKey } from "@/lib/people/names";
import { isTeamMember, usePeople, type Person } from "@/lib/people/queries";
import { absenceOf } from "@/lib/people/team";
import { useOpenDisputes, useResolveDispute } from "@/lib/points/game";
import type { BoardTask } from "@/lib/pulse/board";
import { HELD_STATUS, hasUnread } from "@/lib/pulse/board";
import { greeting, quietLine } from "@/lib/pulse/briefing";
import { lookOf } from "@/lib/idle/look";
import { tasksOf } from "@/lib/idle/people";
import { useComposeStore } from "@/lib/store/compose";
import { usePushHealth } from "@/lib/push/health-query";
import { ordersWaiting } from "@/lib/shop/format";
import { useOrders, useSetOrderStatus } from "@/lib/shop/queries";
import { queueOf, type DeskItem } from "@/lib/tasks/desk";
import { noPushIds, type AttentionReason } from "@/lib/tasks/attention";
import { BLIND_NUDGE_HINT } from "@/lib/tasks/reasons";
import { useTaskActions } from "@/lib/tasks/mutations";
import { directorScreen, directorTabOf } from "@/lib/tasks/overview";
import { useMe, usePulseBoard, useSentTasks, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { useRemindersToday } from "@/lib/notes/reminders";
import { isOverdue } from "@/lib/tasks/status-text";
import { useTvFeed } from "@/lib/tv/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits, type Visit, type VisitAnswer } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { addressOf } from "@/components/desk/team/shared";

import { DayAgenda, agendaOf } from "./day/DayAgenda";
import { DayFeed } from "./day/DayFeed";
import { ReportsFailedTile, ReportsTile, WeekTile } from "./day/DayFigures";
import { DayMessages } from "./day/DayMessages";
import { DayPult } from "./day/DayPult";
import { DayColumn } from "./day/DayColumn";
import { Card, Head } from "./day/kit";
import { DoorCard, MeetingCard, meetingNow } from "./day/NowBand";
import type { QuietItem } from "./day/QuietStrip";
import { RowsBone } from "./home/parts";
import { LaunchBone, LaunchChecklist, useLaunchGate } from "./LaunchChecklist";
import { JustSent, PeopleBone, PeopleNow, PersonHome, type PersonRow } from "./PeopleNow";
import { Attention, Decisions, Overdue, reportWord, type ExtraDecision } from "./TodayParts";

/** The verdict's reasons «Требует внимания» lists; the decisions and the late ones have blocks of their own. */
const WATCHED: ReadonlySet<AttentionReason> = new Set(["no_push", "unaccepted", "soon"]);

/** How many decisions stand on the screen before «…ещё N — разобрать по одной». */
const DECISIONS_SHOWN = 6;
/** «Только что отправлено» — the director's own tasks of the last half hour, at most this many. */
const JUST_SENT_MS = 30 * 60_000;
const JUST_SENT_SHOWN = 3;
/** Where a dispute and an order are decided in full: words to the person, a cancelled order. */
const DISPUTES_HREF = "/desk/rating?view=disputes";
const ORDERS_HREF = "/desk/shop";

/**
 * «Сегодня» is one column (D-196): every card one under another, the page's full width, from the same
 * left edge as every desk screen — the work first, then the day around it. The column narrows with the
 * panel open; its cards keep their order whatever the data does.
 */
const COLUMN = "flex w-full min-w-0 flex-col gap-5";

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

/** The frame while the first data lands: the head, the moment, the column's first cards (D-122). */
export function TodaySkeleton() {
  return (
    <DeskPage width="full">
      <div className={COLUMN}>
        {/* the date line's room is kept: the head does not move when the day lands */}
        <PageTitle title="Сегодня" state={{ text: " " }} />
        <SkeletonGroup className="day-side" grow>
          <div className="flex h-11 items-center gap-4">
            <Bone h={36} w={32} />
            <Bone h={18} w={240} />
          </div>
          <div className="flex h-[30px] items-center gap-2">
            <Bone h={30} w={140} />
            <Bone h={30} w={210} />
          </div>
          <BlockBone rows={4} height={47} />
          <div className="day-figures">
            <BlockBone rows={2} height={35} label="40%" wide="60%" />
            <BlockBone rows={2} height={35} label="40%" wide="70%" />
          </div>
          <BlockBone rows={4} height={42} label="22%" wide="84%" />
          <div className="flex flex-col gap-1">
            <div className="flex h-6 items-center">
              <Bone h={12} w="22%" />
            </div>
            <PeopleBone />
          </div>
        </SkeletonGroup>
      </div>
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
  const params = useDeskParams();
  const now = useNow();
  const actions = useTaskActions(me);
  const { pointsEnabled } = useDeskScope();
  const people = usePeople();
  const loads = useTeamLoads();
  const health = usePushHealth();
  const today = todayYmd(now);
  const reports = useTeamDailyReportDay(today, me.companyId);
  const calendar = useCalendar();
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
  // the chosen person (`?p=`): the phone's circle of people opened on the home — their card under
  // the tiles (D-164, D-168); a task opened from it goes to the panel and the card stays
  const personId = params.get("p");
  const [focus, setFocus] = useState<string | null>(null);
  // E or «Изменить…» on a row: the task's panel opens in its form (D-203)
  const [editFor, setEditFor] = useState<string | null>(null);
  // the panel shows another task or person in place (D-184)
  const openTask = useCallback((id: string) => writeParams({ id }, { type: "desk-pick" }), []);
  const closeTask = useCallback(() => writeParams({ id: null }), []);
  const openPerson = useCallback((id: string) => writeParams({ p: id, id: null }, { type: "desk-pick" }), []);
  const closePerson = useCallback(() => writeParams({ p: null }), []);

  /* ---- the moment: the same numbers as «Задачи» ---- */
  const { boardById, reasons } = useDirectorBoard(board, all, me.userId, now);
  // one verdict for every screen of the director (lib/tasks/attention.ts, D-194): an order lying
  // untaken, a holder whose pushes do not reach — the moment says it, never «по плану»
  const noPush = useMemo(() => noPushIds(health.data), [health.data]);
  const reach = useCallFirst();
  const screen = useMemo(() => directorScreen(all, reasons, now, { noPush }), [all, reasons, now, noPush]);
  // what needs him besides the decisions and the late ones: they have blocks of their own
  const watch = useMemo(
    () =>
      (screen.attention?.items ?? []).flatMap((item) => {
        if (!WATCHED.has(item.reason)) return [];
        const task = boardById.get(item.id);
        return task ? [{ task, reason: item.reason }] : [];
      }),
    [screen.attention, boardById],
  );
  const open = useMemo(() => all.filter((task) => directorTabOf(task, reasons.get(task.id) ?? null) !== "closed"), [all, reasons]);
  const dueToday = useMemo(() => open.filter((task) => matchesDue(task, "today", now)), [open, now]);
  const counts = {
    // taken work only: an order nobody has accepted is no «в работе», and never green (D-194)
    working: open.filter((task) => !reasons.has(task.id) && task.status !== "sent" && task.status !== HELD_STATUS).length,
    untaken: open.filter((task) => !reasons.has(task.id) && task.status === "sent").length,
    today: dueToday.length,
    overdue: open.filter((task) => isOverdue(task, now)).length,
    held: all.filter((task) => task.status === HELD_STATUS).length,
  };
  const todayTab = dueToday.some((task) => reasons.has(task.id)) ? "yours" : "working";
  const counters: MomentCounter[] = [
    { key: "working", label: "В работе", value: counts.working, href: "/desk/tasks?tab=working" },
    ...(counts.untaken > 0 ? [{ key: "untaken", label: "Не приняты", value: counts.untaken, href: "/desk/tasks?tab=working&status=sent" }] : []),
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

  const reply = (task: { id: string }) => {
    setFocus(task.id);
    openTask(task.id);
  };
  const acts = useRowActs({
    actions,
    mark: flow.mark,
    tasks: board,
    rowOf: (id) => boardById.get(id),
    now,
    companyId: me.companyId,
    openId,
    openTask,
    closeTask,
    onReply: reply,
    onEdit: (task) => {
      setEditFor(task.id);
      openTask(task.id);
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
  // a decision or a late one opened, or its menu asked for: the cursor comes to its row
  const openRow = (id: string) => {
    setCursor(id);
    openTask(id);
  };
  const onRowMenu = (item: DeskItem, event: MouseEvent) => {
    setCursor(item.task.id);
    context.open(event, menuOf(item));
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
  const receptionLoad = blockLoad(visits);

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

  /* ---- the people: the phone's circles — those with work, and the free (D-164, D-168) ---- */
  // each person's tasks as the phone's waiting screen reads them off the same board: the circle's
  // colour, ring and badge (lib/idle/look.ts); a task just accepted has no moment of gold here
  const crew = useMemo(
    () =>
      tasksOf(
        board.map((task) => ({
          id: task.id,
          assignee_id: task.assignee_id,
          status: task.status,
          deadline: task.deadline,
          title: task.title,
          question: task.question,
          request: task.time_request && task.time_request.senderId !== me.userId ? task.time_request.proposed : null,
          decline_reason: task.decline_reason,
          unread: hasUnread(task, me.userId),
          scheduled_send_at: task.scheduled_send_at,
        })),
        now.getTime(),
      ),
    [board, me.userId, now],
  );
  const byPerson = useMemo(() => {
    const map = new Map<string, TaskWithPeople[]>();
    for (const task of open) {
      const list = map.get(task.assignee_id);
      if (list) list.push(task);
      else map.set(task.assignee_id, [task]);
    }
    return map;
  }, [open]);
  const teamRows = useMemo(() => {
    const reportRows = new Map((reports.data?.rows ?? []).map((row) => [row.user_id, row]));
    const staff = (people.data ?? []).filter(isTeamMember);
    return staff.map((person): PersonRow => {
      const load = loads.data?.[person.id];
      const color = loadColor(load, person.availability === "active", now.getTime());
      const mine = byPerson.get(person.id) ?? [];
      // no loads to read: the person is unknown, not «дел нет»
      const state = loadsMissing ? { ring: null, line: "—", rank: 4 } : personNow(person, load, color, mine, reasons, now);
      const channel = health.data?.get(person.id);
      return {
        id: person.id,
        name: person.full_name,
        ring: state.ring,
        line: state.line,
        active: Math.max(load?.active ?? 0, mine.length),
        report: reportWord(reportRows.get(person.id), now),
        push: channel && (channel.state === "off" || channel.state === "broken") ? (channel.state === "off" ? "уведомления не включены" : "пуш не прошёл") : null,
        // «на месте» is the team's one definition (lib/people/team.ts): «отошёл до …» is away too
        away: absenceOf(person, now.getTime()) !== null,
        look: lookOf((crew[person.id] ?? []).filter((task) => task.status !== "done")),
      };
    });
  }, [people.data, loads.data, loadsMissing, health.data, reports.data, byPerson, reasons, crew, now]);
  const personOf = (id: string | null): Person | null => (id ? ((people.data ?? []).find((p) => p.id === id) ?? null) : null);
  const opened = personOf(personId);
  const give = useCallback((person: Person) => useComposeStore.getState().request("", { id: person.id, name: shortName(person.full_name), address: addressOf(person) }), []);
  const givable = (person: Person | null): person is Person => Boolean(person && person.is_active && person.role !== "director" && person.role !== "tv" && person.id !== me.userId);
  // a person on the desk has one set of moves in one order, wherever they are opened (D-194)
  const personMoves = usePersonMoves("today");
  const personMenu = (person: Person): MenuItem[] => [
    { key: "peek", label: "Открыть карточку", onSelect: () => openPerson(person.id) },
    ...personMoves.menu(person, givable(person) ? { give: () => give(person) } : undefined),
  ];
  const onPersonMenu = (id: string, event: MouseEvent) => {
    const person = personOf(id);
    if (!person) return;
    event.preventDefault();
    context.open(event, personMenu(person));
  };
  const taskMenu = (task: TaskWithPeople) => acts.menu(task, { onOpenRow: () => openTask(task.id) });

  /* ---- what the director has just given: found again on the home ---- */
  const justSent = useMemo(
    () =>
      all
        .filter((task) => task.author_id === me.userId && now.getTime() - new Date(task.created_at).getTime() < JUST_SENT_MS && task.status !== "revoked")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, JUST_SENT_SHOWN),
    [all, me.userId, now],
  );

  /* ---- the feed's line about a task: found among the director's own by its title ---- */
  const byTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...all].sort((a, b) => a.created_at.localeCompare(b.created_at))) map.set(task.title.trim().toLowerCase(), task.id);
    return map;
  }, [all]);
  const taskOfTitle = (title: string | null) => (title ? (byTitle.get(title.trim().toLowerCase()) ?? null) : null);
  const dueList = useMemo(() => [...dueToday].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")), [dueToday]);
  // «Напомню сегодня · N» (D-177): the director's own reminders, the same small read as the desk's ring
  const reminders = useRemindersToday(me.userId, now);

  /* ---- who is at the door ---- */
  const visitRows = visits.data ?? [];
  const visitors = awaitingDirector(visitRows);
  const messages = unreadMessages(visitRows);
  const answer = (visit: Visit, value: VisitAnswer) => answerVisit.mutate({ id: visit.id, answer: value });

  /* ---- the keys of the screen: J/K the cursor, Enter opens it (or the stack), the row's letters ---- */
  const toGive = givable(opened) ? opened : null;
  useScreenKeys((event) => {
    if (event.shiftKey) return false;
    const target = event.target as HTMLElement | null;
    // the panel's own keys are its own; the screen answers from itself or from nowhere
    if (target && target !== document.body && !target.closest("#desk-main")) return false;
    // T with a person open in the panel: the order line knows whom (the phone's circle, then hold)
    if (event.code === "KeyT" && toGive && !openId) {
      give(toGive);
      return true;
    }
    const step = event.code === "KeyJ" ? 1 : event.code === "KeyK" ? -1 : 0;
    if (step !== 0) {
      const next = cursorStep(ids, cursor, step);
      if (!next) return false;
      setCursor(next);
      if (openId) openTask(next);
      document.querySelector(`#desk-main [data-row-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
      return true;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      // a focused button or link takes its own Enter
      if (target?.closest?.("button, a, [role=button], [role=grid]")) return false;
      if (cursor && cursor !== openId) {
        openTask(cursor);
        return true;
      }
      if (openId || queue.length === 0) return false;
      router.push("/desk/inbox");
      return true;
    }
    if (event.code === "Escape" && cursor && !openId) {
      setCursor(null);
      return true;
    }
    // the chosen person's card under the tiles: Esc puts it away once nothing above it is open
    if (event.code === "Escape" && personId && !openId) {
      closePerson();
      return true;
    }
    const item = itemOf(cursor);
    if (!item) return false;
    return pressTaskKey(event.code, item.task, {
      root: document.getElementById("desk-main"),
      letters: rowKeys(item.task, { request: Boolean(item.task.time_request) }),
      onLetter: (action) => (action === "reply" ? reply(item.task) : acts.press(action, item.task)),
    });
  });

  useShortcuts("Сегодня", [
    { keys: ["J", "K"], label: "По решениям и просрочкам — вниз, вверх" },
    { keys: ["Enter"], label: "Открыть строку в панели (без строки — «Разобрать по одной»)" },
    { keys: ["A"], label: "Принять сданную" },
    { keys: ["R"], label: "На доработку" },
    { keys: ["O"], label: "Ответить" },
    { keys: ["N"], label: "Напомнить" },
    { keys: ["D"], label: "Срок" },
    { keys: ["T"], label: "Передать (у выбранного человека — дать ему задачу)" },
    { keys: ["E"], label: "Изменить задачу — текст, срок, человек" },
    { keys: ["."], label: "Все действия строки (или правый клик)" },
    { keys: ["Esc"], label: "Убрать курсор, закрыть панель, убрать карточку человека" },
  ]);

  const calm = screen.value === null && screen.closedToday === 0;
  const reportDay = reports.data && reports.data.rows.some((row) => row.state !== "off") ? reports.data : null;
  const boardDown = boardLoad.kind === "failed";
  // with no task waiting, the hero's «всё закрыто» would stand over the disputes below it
  const extrasLine = queue.length === 0 ? extrasWord(openDisputes.length, openOrders.length) : null;
  const moment = extrasLine ? { ...screen, eyebrow: "Ваш ход", tone: "warn" as const } : screen;
  // the phone's first words under the face: a greeting, and the quiet day said in one sentence
  const firstName = me.fullName.trim().split(/\s+/)[0] ?? "";
  const brief = calm
    ? quietLine(
        open.map((task) => ({
          id: task.id,
          title: task.title,
          deadline: task.deadline,
          assignee: shortName(task.assignee?.full_name ?? "") || null,
          assigneeId: task.assignee_id,
          // an order nobody has taken is not «в работе»
          taken: task.status !== "sent",
        })),
        now,
      )
    : null;

  /* ---- the day around the director (D-196): «Сейчас», the quiet strip, the figures, two stacks ---- */
  const events = calendar.data ?? [];
  const calendarFailed = calendarLoad.kind === "failed";
  const calendarKnown = calendarLoad.kind !== "loading" && !calendarFailed;
  // the meeting of the moment stands in «Сейчас»; «Встречи и сроки» keeps the rest of the day
  const meeting = calendarFailed ? null : meetingNow(events, now);
  const agendaEvents = calendarKnown ? agendaOf(events, now, meeting) : [];
  // the words of the director's tasks: questions and requests for time are «Ждут вас»'s on the left
  const words = useMemo(() => messagesOf(board, me.userId, now).filter((message) => message.kind === "word"), [board, me.userId, now]);
  const secretaries = useSecretaries();
  const rating = useRating("week", pointsEnabled);
  const leaders = useMemo(() => topOf(rating.data ?? []), [rating.data]);
  const ratingLoad = blockLoad(rating);

  const band: { key: string; node: ReactNode }[] = [];
  if (visitors.length > 0 || messages.length > 0 || receptionLoad.kind === "failed") {
    band.push({
      key: "door",
      node: (
        <DoorCard
          visitors={visitors}
          messages={messages}
          now={now}
          onAnswer={answer}
          busyId={answerVisit.isPending ? (answerVisit.variables?.id ?? null) : null}
          note={noteOf(receptionLoad, "Посетители не загрузились", () => void visits.refetch())}
          index={0}
        />
      ),
    });
  }
  if (meeting) band.push({ key: `meeting:${meeting.id}`, node: <MeetingCard event={meeting} now={now} index={band.length} /> });

  // a block with nothing to say is a capsule — never one that did not load (it keeps its card, D-194)
  const quiet: QuietItem[] = [];
  if (!boardDown && words.length === 0) quiet.push({ key: "messages", icon: CheckCheck, ink: "ok", text: "Всё прочитано" });
  const agendaEmpty = agendaEvents.length === 0 && dueList.length === 0 && reminders.count === 0;
  if (calendarKnown && agendaEmpty && !meeting) {
    const later = nextEvent(events.filter((event) => ymdOfEvent(event) > today), now);
    quiet.push({
      key: "agenda",
      icon: Coffee,
      ink: "sky",
      text: "Встреч сегодня нет",
      more: later ? `ближайшая ${humanAqtobe(new Date(later.starts_at), now)} — «${later.title}»` : undefined,
      href: "/desk/calendar",
    });
  }
  const noSecretary = secretaries.data !== undefined && secretaries.data.length === 0;
  if (noSecretary) quiet.push({ key: "secretary", icon: ConciergeBell, ink: "muted", text: "Секретаря нет", more: "добавить в «Команде»", href: "/desk/team" });
  if (pointsEnabled && rating.data && leaders.length === 0) {
    quiet.push({ key: "rating", icon: Trophy, ink: "muted", text: "Очков за неделю пока нет", hint: "Начислите строкой поручения: «Марату 50 очков за объект»", href: "/desk/rating" });
  }

  const figures: ReactNode[] = [];
  if (reportsLoad.kind === "failed") figures.push(<ReportsFailedTile key="reports" note={noteOf(reportsLoad, "Отчёты не загрузились", () => void reports.refetch())} index={0} />);
  else if (reportDay) figures.push(<ReportsTile key="reports" day={reportDay} index={0} />);
  if (pointsEnabled && (ratingLoad.kind === "failed" || rating.isPending)) {
    figures.push(
      <Card key="rating" ink="gold" index={1} testId="home-rating">
        <Head icon={Trophy} sign="rating" title="Неделя" href="/desk/rating" />
        {rating.isPending ? <RowsBone rows={3} wide="64%" /> : noteOf(ratingLoad, "Рейтинг не загрузился", () => void rating.refetch())}
      </Card>,
    );
  } else if (pointsEnabled && leaders.length > 0) figures.push(<WeekTile key="rating" rows={rating.data ?? []} index={1} />);

  // the day's own words and hours: cards only when they have something (else capsules above)
  const yours: ReactNode[] = [];
  if (words.length > 0) yours.push(<DayMessages key="messages" me={me} messages={words} now={now} onOpenTask={openTask} index={0} />);
  if (!calendarKnown || !agendaEmpty) {
    yours.push(
      <DayAgenda
        key="agenda"
        events={agendaEvents}
        due={dueList}
        reminders={reminders}
        onOpenTask={openTask}
        now={now}
        note={calendarLoad.kind === "loading" ? <RowsBone rows={2} /> : noteOf(calendarLoad, "Встречи не загрузились", () => void calendar.refetch())}
        index={0}
      />,
    );
  }

  const head = boardDown ? (
    <LoadFailure what="очередь решений" offline={boardLoad.offline} busy={busy} onRetry={onRetry} />
  ) : launch.state === "on" ? (
    <LaunchChecklist people={people.data ?? []} health={health.data} healthKnown={!health.isPending} onHide={launch.hide} />
  ) : launch.state === "checking" ? (
    <LaunchBone />
  ) : (
    <MomentBar
      screen={moment}
      detail={extrasLine ?? (calm ? (brief ?? DESK_NEW_TASK) : undefined)}
      counters={counters}
      queue={queue.length}
      enterKey
      act={momentAct(screen, screen.focus ? boardById.get(screen.focus) : undefined, now, {
        press: (action, task) => acts.press(action, task),
        open: openRow,
      }, screen.focus ? reach.phoneOf(boardById.get(screen.focus)?.assignee_id ?? "") : null)}
    />
  );

  return (
    <DeskPage width="full">
      <div className={COLUMN}>
        <PageTitle
          title="Сегодня"
          state={{ text: `${dateLine(now)} · ${greeting(now, firstName)}` }}
          actions={load.kind === "stale" ? <LoadNote state={load} failed="" now={now} onRetry={onRetry} /> : undefined}
        />
        <div className="@container">
          <DayColumn
            head={head}
            quiet={quiet}
            band={band}
            yours={yours}
            figures={figures.length > 0 ? <div className="day-figures">{figures}</div> : null}
            pult={noSecretary ? null : <DayPult me={me} index={0} />}
            work={
              <>
            <JustSent tasks={justSent} now={now} onOpen={openTask} openId={openId} />
            <Decisions
              items={decisions}
              limit={DECISIONS_SHOWN}
              openId={openId}
              cursorId={cursor}
              movesOf={movesOf}
              onMove={onMove}
              onOpen={openRow}
              menuOf={menuOf}
              onMenu={onRowMenu}
              compact={Boolean(openId)}
              now={now}
              drafts={drafts}
              extras={extras}
              // while the launch stands, an empty block would only repeat it: the same «nothing to say» as a failed queue
              failed={boardDown || launching}
              extrasNote={noteOf(extrasLoad, "Споры и заказы не загрузились", retryExtras)}
              extrasUnknown={extrasLoad.kind === "failed"}
              // an order lying untaken is no «nothing waits»: «Требует внимания» below says what does
              watching={watch.length > 0}
            />
            <Attention
              items={watch}
              openId={openId}
              // a push that will not reach: «Позвонить» with the number, or «Напомнить» saying the push will not come
              telOf={(item) => (item.reason === "no_push" ? reach.phoneOf(item.task.assignee_id) : null)}
              moveOf={(item) => {
                const move = rowMoves(item.task, null, { nudgedAt: item.task.nudged_at }, now)[0] ?? null;
                return move && item.reason === "no_push" && move.action === "nudge" ? { ...move, title: BLIND_NUDGE_HINT } : move;
              }}
              onMove={(move, task, target) => {
                if (move.held) return;
                acts.press(move.action, task, target ? { at: target } : undefined);
              }}
              onOpen={openRow}
              menuOf={(task) => acts.menu(task, { onOpenRow: () => openTask(task.id) })}
              onMenu={(task, event) => context.open(event, acts.menu(task, { onOpenRow: () => openTask(task.id) }))}
              now={now}
            />
            <Overdue
              items={late}
              openId={openId}
              cursorId={cursor}
              movesOf={movesOf}
              onMove={onMove}
              onOpen={openRow}
              menuOf={menuOf}
              onMenu={onRowMenu}
              now={now}
              drafts={drafts}
            />
              </>
            }
            people={
            <PeopleNow
              rows={teamRows}
              loading={peopleLoad.kind === "loading"}
              chosenId={personId}
              // the phone's tap: the same circle again puts the card away
              onOpen={(id) => (id === personId ? closePerson() : openPerson(id))}
              onMenu={onPersonMenu}
              note={noteOf(teamLoad, "Команда не загрузилась", () => {
                void people.refetch();
                void loads.refetch();
              })}
              failed={peopleLoad.kind === "failed"}
              card={
                opened ? (
                  <PersonHome
                    person={opened}
                    row={teamRows.find((row) => row.id === opened.id) ?? null}
                    tasks={byPerson.get(opened.id) ?? []}
                    now={now}
                    onGive={givable(opened) ? () => give(opened) : null}
                    onOpenTask={openTask}
                    menuOf={taskMenu}
                    onMenu={(task, event) => {
                      event.preventDefault();
                      context.open(event, taskMenu(task));
                    }}
                    onClose={closePerson}
                  />
                ) : null
              }
            />
            }
            feed={
            <DayFeed
              events={feed.data ?? []}
              loading={feedLoad.kind === "loading"}
              failed={feedLoad.kind === "failed"}
              note={noteOf(feedLoad, "Лента не загрузилась", () => void feed.refetch())}
              now={now}
              taskOf={taskOfTitle}
              onOpenTask={openTask}
              onAnnounce={() => useComposeStore.getState().request("Всем: ")}
              index={0}
            />
            }
          />
        </div>
      </div>

      {acts.node}
      {context.node}
      {personMoves.node}

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
            editToken={editFor === openId ? 1 : 0}
            onEditing={() => setEditFor(null)}
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
