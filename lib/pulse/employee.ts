import type { MascotState } from "@/components/brand/Mascot";
import { humanAqtobe } from "@/lib/ai/time";
import type { ReportDue } from "@/lib/daily-report/due";
import { greeting, quoteTitle } from "./briefing";
import { hasUnread, isOnBoard, whoOf, type BoardTask, type Lanes, type Phrase } from "./board";
import type { EtherPost } from "./ether";
import { alarmOf, DEADLINE_SOON_MS } from "./mood";
import { awaitsMyMove } from "@/lib/tasks/my-move";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The employee's side of the same board (D-62): what the face on Лента says and counts.
 * Pure, like the director's wording — the person is the assignee, the other voice in
 * the thread is the director's.
 */

/** What the person has to act on first — new orders to accept, orders sent back. */
export function isTodo(task: Pick<BoardTask, "status">): boolean {
  return task.status === "sent" || task.status === "rework";
}

/** «Дела»: everything the person has on their hands — to accept, to redo, in work. */
export function isOpenFor(task: Pick<BoardTask, "status">): boolean {
  return task.status === "sent" || task.status === "rework" || task.status === "accepted" || task.status === "in_progress";
}

/**
 * The number on Лента's «Дела» ball (D-173): the person's orders waiting for their move — new,
 * rework, in work past the deadline — by the same rule as the «Дела» tab badge (`awaitsMyMove`),
 * so the two always show the same number. Orders only: the report the evening asks for lights the
 * ball, it does not add to the count.
 */
export function tasksBallCount(tasks: readonly Pick<BoardTask, "status" | "deadline">[], now: Date): number {
  return tasks.filter((task) => awaitsMyMove(task, now)).length;
}

const WORDS_MAX = 80;
function short(words: string): string {
  const clean = words.trim();
  return clean.length > WORDS_MAX ? `${clean.slice(0, WORDS_MAX - 1).trimEnd()}…` : clean;
}

/** The greeting and where things stand for the person: new orders, rework, the rest in work. */
export function employeeOpening(lanes: Lanes, now: Date, name: string, { reportPending = false }: { reportPending?: boolean } = {}): Phrase {
  const all = [...lanes.overdue, ...lanes.declined, ...lanes.question, ...lanes.review, ...lanes.work];
  const fresh = all.filter((task) => task.status === "sent").length;
  const rework = all.filter((task) => task.status === "rework").length;
  const inWork = all.filter((task) => task.status === "accepted" || task.status === "in_progress").length;
  const overdue = lanes.overdue.length;
  const hello = greeting(now, name);
  const parts: string[] = [];
  // the first item carries the noun — «1 задача просрочена», not «1 просрочена»; the next ones lean
  // on it: «1 новая задача, 1 на доработке, 1 просрочена» (D-173)
  const noun = (n: number) => (parts.length === 0 ? `${pluralRu(n, ["задача", "задачи", "задач"])} ` : "");
  if (fresh > 0) parts.push(`${fresh} ${pluralRu(fresh, ["новая задача", "новые задачи", "новых задач"])}`);
  if (rework > 0) parts.push(`${rework} ${noun(rework)}на доработке`);
  if (overdue > 0) parts.push(`${overdue} ${noun(overdue)}${pluralRu(overdue, ["просрочена", "просрочены", "просрочено"])}`);
  if (parts.length === 0) {
    // everything handed in is not «дел нет»: the cards wait on review, and «Дела» shows them
    const onReview = all.filter((task) => task.status === "pending_review").length;
    if (inWork === 0 && onReview > 0) return { text: `${hello} Всё сдано, на проверке у директора — ${onReview}.`, tone: "ok" };
    // with the day's report still to hand in, «всё сделано» would argue with the next line (D-167)
    if (inWork === 0) return { text: reportPending ? `${hello} Дел нет.` : `${hello} Дел нет, всё сделано.`, tone: "ok" };
    return { text: `${hello} ${inWork} ${pluralRu(inWork, ["задача", "задачи", "задач"])} в работе, нового нет.`, tone: "ok" };
  }
  return { text: `${hello} ${parts.join(", ")}.`, tone: overdue > 0 ? "danger" : "warn" };
}

/**
 * One phrase for one change, from the person's side: the director gave, took back,
 * accepted, sent back or wrote something. The person's own steps are not news to them.
 */
export function describeForEmployee(prev: BoardTask | undefined, next: BoardTask | undefined, meId: string): Phrase | null {
  if (!next) return null;
  const title = quoteTitle(next.title);
  if (!prev) {
    if (next.status === "sent") return { text: `Новая задача: ${title}`, tone: "warn" };
    return null;
  }
  if (next.status !== prev.status) {
    switch (next.status) {
      case "sent":
        return prev.status === "declined" ? { text: `Директор настаивает: ${title}`, tone: "warn" } : null;
      case "rework":
        return { text: `Директор вернул ${title} на доработку`, tone: "warn" };
      case "done":
        return { text: `Директор принял ${title}`, tone: "ok" };
      case "revoked":
        return { text: `Директор отозвал ${title}`, tone: "muted" };
      default:
        return null;
    }
  }
  if (next.deadline !== prev.deadline && next.deadline) return { text: `Срок ${title} перенесён`, tone: "muted" };
  if (hasUnread(next, meId) && next.last_message!.id !== prev.last_message?.id) {
    const last = next.last_message!;
    const words = last.type === "photo" ? "фото" : last.type === "voice" ? "голосовое" : (last.content ?? "");
    return { text: `Директор пишет по ${title}: «${short(words)}»`, tone: "warn", message: true };
  }
  return null;
}

export function describeForEmployeeAll(prev: readonly BoardTask[], next: readonly BoardTask[], meId: string): Phrase[] {
  const before = new Map(prev.map((task) => [task.id, task]));
  const phrases: Phrase[] = [];
  for (const task of next) {
    const phrase = describeForEmployee(before.get(task.id), task, meId);
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

/** The director as the person sees them in a thread — for the messages card. */
export function otherSideOf(task: Pick<BoardTask, "author">): string {
  return whoOf({ assignee: task.author }) === "Без исполнителя" ? "Директор" : whoOf({ assignee: task.author });
}

/* -------------------------------------------------------------------------- */
/* The face that carries the work (D-110)                                      */
/* -------------------------------------------------------------------------- */

/**
 * What the employee's face holds at rest, heaviest first (D-110). The director's «Капля»
 * hands the work out; the employee's carries it:
 *   todo      an order to accept or to redo — it calls, the card over its head
 *   deadline  a deadline within the hour or past — it panics over the hot card of its stack
 *   unread    a word of the director not read yet — nervous, an envelope bobs by the head
 *   report    the evening has come and the day's report is not in (D-167) — it calls, like an order
 *   working   orders in work, nothing burning — it holds the stack and does not sleep
 *   review    everything handed over — an hourglass, a glance up at the director now and then
 *   free      nothing in the hands — the only time it sleeps and dreams
 */
export type EmployeeRest = "todo" | "deadline" | "unread" | "report" | "working" | "review" | "free";

export type EmployeeLoad = {
  rest: EmployeeRest;
  /** orders in work: the height of the stack in the face's hands */
  carry: number;
  /** one of them is due within the hour or overdue: the top card of the stack burns */
  hot: boolean;
};

function inHands(task: Pick<BoardTask, "status">): boolean {
  return task.status === "accepted" || task.status === "in_progress";
}

function burning(task: Pick<BoardTask, "deadline">, now: Date): boolean {
  return Boolean(task.deadline) && new Date(task.deadline!).getTime() - now.getTime() <= DEADLINE_SOON_MS;
}

/**
 * The load of the person's board. Closed rows may linger in the cache until the screen says
 * goodbye to them — only the statuses count. The deadline alarm is `alarmOf`'s (D-68), but the
 * unread one is the director's word alone: the person's own open question is not news to them.
 * `worry: false` — the company switched the telegraph off (`settings.mascot_telegraph`, D-133):
 * no calling, panic or nerves, the face shows only what is in its hands.
 * `reportAsking` — the day's report is due and not in after `ask_from` (`ReportDue.asking`, D-167):
 * lighter than the director's word, heavier than the stack in the hands.
 */
export function employeeLoad(tasks: readonly BoardTask[], now: Date, meId: string, worry = true, reportAsking = false): EmployeeLoad {
  const carried = tasks.filter(inHands);
  const hot = carried.some((task) => burning(task, now));
  const onBoard = tasks.filter((task) => isOnBoard(task.status));
  const rest: EmployeeRest = worry && onBoard.some(isTodo)
    ? "todo"
    : worry && alarmOf(onBoard, now, meId) === "deadline"
      ? "deadline"
      : worry && onBoard.some((task) => hasUnread(task, meId))
        ? "unread"
        : worry && reportAsking
          ? "report"
          : carried.length > 0
          ? "working"
          : onBoard.some((task) => task.status === "pending_review")
            ? "review"
            : "free";
  return { rest, carry: carried.length, hot };
}

/** What the face shows for the load. Free and asleep at rest; free and awake — glad of it. */
const REST_FACE: Record<EmployeeRest, MascotState> = {
  todo: "calling",
  deadline: "panicking",
  unread: "nervous",
  report: "calling",
  working: "working",
  review: "awaiting",
  free: "sleeping",
};

export function employeeFace(rest: EmployeeRest, awake: boolean): MascotState {
  return awake && rest === "free" ? "happy" : REST_FACE[rest];
}

/**
 * Where a tap on the resting face leads (D-110, D-167): to the thing in hand — «Дела» when there
 * is anything to do there (an order to accept, a burning one, the day's report, the stack in
 * work), «Сообщения» for the director's unread word — so the person gets there in one tap
 * instead of face → ball → card. null — nothing in hand (all handed over, or free): the balls.
 */
export function reasonOf(rest: EmployeeRest): "tasks" | "messages" | null {
  switch (rest) {
    case "todo":
    case "deadline":
    case "report":
    case "working":
      return "tasks";
    case "unread":
      return "messages";
    default:
      return null;
  }
}

/** What waits for the person's answer, as the screen counts it (D-167). */
export type EmployeeWaiting = {
  /** Tasks with the director's word not read yet. */
  unread: readonly { title: string }[];
  /** Announcements without the person's «Ознакомился». */
  unacked: number;
  /** Meetings the person is invited to and has not answered «Буду / Не смогу». */
  invites: readonly { title: string; startsAt: string }[];
};

/** «в 11:30» today, «завтра в 11:30», «пт в 11:30», «14.08 в 11:30» — when, said briefly. */
function whenSaid(startsAt: string, now: Date): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  const [day, time] = humanAqtobe(date, now).split(" ");
  const clock = time?.startsWith("0") ? time.slice(1) : time;
  return day === "сегодня" ? `в ${clock}` : `${day} в ${clock}`;
}

function listRu(parts: readonly string[]): string {
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

/**
 * One short line of what waits for the person's answer (D-167): «Ждут ответа: сообщение директора
 * по «Пропуска», новое объявление и приглашение на «Планёрка» в 11:30.» One thing of a kind is
 * named, several are counted; next to things of another kind nothing is named. null — nothing waits.
 */
export function employeeWaiting(waiting: EmployeeWaiting, now: Date): Phrase | null {
  const { unread, unacked, invites } = waiting;
  // a title is said only when one kind of thing waits: next to others it made the line too long for
  // the band over an open card, and a title in quotes inside another title read «…«Береке»»
  const kinds = (unread.length > 0 ? 1 : 0) + (unacked > 0 ? 1 : 0) + (invites.length > 0 ? 1 : 0);
  const named = kinds === 1;
  const parts: string[] = [];
  if (unread.length === 1) parts.push(named ? `сообщение директора по ${quoteTitle(unread[0].title)}` : "сообщение директора");
  else if (unread.length > 1) parts.push(`${unread.length} ${pluralRu(unread.length, ["сообщение", "сообщения", "сообщений"])} директора`);
  if (unacked === 1) parts.push("новое объявление");
  else if (unacked > 1) parts.push(`${unacked} ${pluralRu(unacked, ["новое объявление", "новых объявления", "новых объявлений"])}`);
  if (invites.length === 1) {
    const when = whenSaid(invites[0].startsAt, now);
    parts.push(`приглашение на ${named ? quoteTitle(invites[0].title) : "встречу"}${when ? ` ${when}` : ""}`);
  } else if (invites.length > 1) {
    parts.push(`${invites.length} ${pluralRu(invites.length, ["приглашение", "приглашения", "приглашений"])} на встречи`);
  }
  if (parts.length === 0) return null;
  const things = unread.length + Math.max(0, unacked) + invites.length;
  // «вас», not «ответа»: an announcement waits for «Ознакомился», a word of the director for reading
  const text = `${things === 1 ? "Ждёт" : "Ждут"} вас: ${listRu(parts)}.`;
  return { text, tone: "warn" };
}

/**
 * The evening line about the day's report (D-167): said once `ask_from` has come and the report
 * is not in; on a day with tasks — that one button in «Дела» hands it in. null — nothing to say.
 */
export function reportPhrase(due: Pick<ReportDue, "asking" | "oneTap"> | null | undefined): Phrase | null {
  if (!due?.asking) return null;
  return due.oneTap
    ? { text: "Отчёт за день ещё не сдан — в «Делах» он сдаётся одной кнопкой.", tone: "warn" }
    : { text: "Отчёт за день ещё не сдан.", tone: "warn" };
}

/**
 * What has just happened to the person's work (D-110), read off two consecutive lists — the
 * face plays it over whatever it holds. Unlike the thought above the head, the person's own
 * taps count: «Принял» is a nod, «Сдать» throws the card up to the director. An optimistic
 * update lands in the same list, so a tap here and a tap on the task screen play alike.
 */
export type EmployeeEvent =
  | "approved"
  | "rework"
  | "revoked"
  | "gone"
  | "insisted"
  | "arrived"
  | "handed"
  | "declined"
  | "asked"
  | "accepted"
  | "moved"
  | "message"
  | "announced"
  | "read"
  | "acked";

/** Several changes in one go: the face plays the weightiest (the order of this list). */
export const EVENT_WEIGHT: readonly EmployeeEvent[] = [
  "approved",
  "rework",
  "revoked",
  "gone",
  "insisted",
  "arrived",
  "handed",
  "declined",
  "asked",
  "accepted",
  "moved",
  "message",
  "announced",
  "read",
  "acked",
];

function statusEvent(prev: BoardTask, next: BoardTask): EmployeeEvent | null {
  switch (next.status) {
    case "done":
      return "approved";
    case "rework":
      return "rework";
    case "revoked":
      return "revoked";
    case "declined":
      return "declined";
    case "pending_review":
      return "handed";
    case "sent":
      // back from «Не могу» — the director insists; anything else is a rolled-back tap
      return prev.status === "declined" ? "insisted" : null;
    case "accepted":
      // rework → accepted is the first half of «Сдать», not a second «Принял»
      return prev.status === "sent" ? "accepted" : null;
    default:
      return null;
  }
}

/** A later deadline, or none at all, is a relief; an earlier one is only said, not played. */
function eased(prev: BoardTask, next: BoardTask): boolean {
  if (next.deadline === prev.deadline || !prev.deadline) return false;
  return !next.deadline || new Date(next.deadline).getTime() > new Date(prev.deadline).getTime();
}

function taskEvent(prev: BoardTask | undefined, next: BoardTask, meId: string): EmployeeEvent | null {
  if (!prev) return next.status === "sent" ? "arrived" : null;
  if (next.status !== prev.status) return statusEvent(prev, next);
  if (!prev.question && next.question) return "asked";
  if (eased(prev, next)) return "moved";
  if (hasUnread(next, meId) && next.last_message!.id !== prev.last_message?.id) return "message";
  if (hasUnread(prev, meId) && !hasUnread(next, meId)) return "read";
  return null;
}

export function employeeEvents(prev: readonly BoardTask[], next: readonly BoardTask[], meId: string): EmployeeEvent[] {
  const before = new Map(prev.map((task) => [task.id, task]));
  const after = new Set(next.map((task) => task.id));
  const events: EmployeeEvent[] = [];
  for (const task of next) {
    const event = taskEvent(before.get(task.id), task, meId);
    if (event) events.push(event);
  }
  // An order still in the person's hands that is simply no longer there was deleted («⋯ →
  // Удалить», tasks/020): to the person it is the same as a revoke — the work is gone. A closed
  // row leaving the list is the board pruning its goodbye, not news.
  for (const task of prev) {
    if (!after.has(task.id) && isOpenFor(task)) events.push("gone");
  }
  return events;
}

/** Эфир from the person's side: a word to everyone has come, or they have just said «Ознакомился». */
export function etherEvents(prev: readonly EtherPost[], next: readonly EtherPost[], meId: string): EmployeeEvent[] {
  const before = new Map(prev.map((post) => [post.id, post]));
  const events: EmployeeEvent[] = [];
  for (const post of next) {
    const was = before.get(post.id);
    if (!was) {
      if (post.author_id !== meId) events.push("announced");
      continue;
    }
    const mine = (item: EtherPost) => item.acks.some((ack) => ack.user_id === meId);
    if (!mine(was) && mine(post)) events.push("acked");
  }
  return events;
}

export function weightiest(events: readonly EmployeeEvent[]): EmployeeEvent | null {
  let best: EmployeeEvent | null = null;
  for (const event of events) {
    if (best === null || EVENT_WEIGHT.indexOf(event) < EVENT_WEIGHT.indexOf(best)) best = event;
  }
  return best;
}

/**
 * «N подряд в срок» (D-110, game feel behind `points_enabled`): the person's latest accepted
 * orders that had a deadline, newest first, counted until the first one handed over late.
 * The database keeps the same count in `profiles.streak_count` (`task_streak_of`, D-133) for the
 * screens that show other people; Лента counts its own at the moment of the medal.
 * An order without a deadline neither counts nor breaks the run; «в срок» is the handover
 * (`completed_at`), not the director's acceptance — the wait for the director is not theirs.
 */
export function onTimeStreak(tasks: readonly Pick<BoardTask, "status" | "deadline" | "completed_at" | "closed_at">[]): number {
  const closed = tasks
    .filter((task) => task.status === "done" && task.deadline && task.completed_at && task.closed_at)
    .sort((a, b) => (a.closed_at! < b.closed_at! ? 1 : a.closed_at! > b.closed_at! ? -1 : 0));
  let streak = 0;
  for (const task of closed) {
    if (new Date(task.completed_at!).getTime() > new Date(task.deadline!).getTime()) break;
    streak += 1;
  }
  return streak;
}
