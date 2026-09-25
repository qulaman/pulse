import type { MascotState } from "@/components/brand/Mascot";
import { greeting, quoteTitle } from "./briefing";
import { hasUnread, isOnBoard, whoOf, type BoardTask, type Lanes, type Phrase } from "./board";
import type { EtherPost } from "./ether";
import { alarmOf, DEADLINE_SOON_MS } from "./mood";
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

const WORDS_MAX = 80;
function short(words: string): string {
  const clean = words.trim();
  return clean.length > WORDS_MAX ? `${clean.slice(0, WORDS_MAX - 1).trimEnd()}…` : clean;
}

/** The greeting and where things stand for the person: new orders, rework, the rest in work. */
export function employeeOpening(lanes: Lanes, now: Date, name: string): Phrase {
  const all = [...lanes.overdue, ...lanes.declined, ...lanes.question, ...lanes.review, ...lanes.work];
  const fresh = all.filter((task) => task.status === "sent").length;
  const rework = all.filter((task) => task.status === "rework").length;
  const inWork = all.filter((task) => task.status === "accepted" || task.status === "in_progress").length;
  const overdue = lanes.overdue.length;
  const hello = greeting(now, name);
  const parts: string[] = [];
  if (fresh > 0) parts.push(`${fresh} ${pluralRu(fresh, ["новая задача", "новые задачи", "новых задач"])}`);
  if (rework > 0) parts.push(`${rework} на доработке`);
  if (overdue > 0) parts.push(`${overdue} ${pluralRu(overdue, ["просрочена", "просрочены", "просрочено"])}`);
  if (parts.length === 0) {
    if (inWork === 0) return { text: `${hello} Дел нет, всё сделано.`, tone: "ok" };
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
 *   working   orders in work, nothing burning — it holds the stack and does not sleep
 *   review    everything handed over — an hourglass, a glance up at the director now and then
 *   free      nothing in the hands — the only time it sleeps and dreams
 */
export type EmployeeRest = "todo" | "deadline" | "unread" | "working" | "review" | "free";

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
 */
export function employeeLoad(tasks: readonly BoardTask[], now: Date, meId: string): EmployeeLoad {
  const carried = tasks.filter(inHands);
  const hot = carried.some((task) => burning(task, now));
  const onBoard = tasks.filter((task) => isOnBoard(task.status));
  const rest: EmployeeRest = onBoard.some(isTodo)
    ? "todo"
    : alarmOf(onBoard, now, meId) === "deadline"
      ? "deadline"
      : onBoard.some((task) => hasUnread(task, meId))
        ? "unread"
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
  working: "working",
  review: "awaiting",
  free: "sleeping",
};

export function employeeFace(rest: EmployeeRest, awake: boolean): MascotState {
  return awake && rest === "free" ? "happy" : REST_FACE[rest];
}

/**
 * Where a tap on the resting face leads (D-110): a face that is worried about something opens
 * the reason itself — the order to accept, the burning one, the unread word — so the person
 * gets there in one tap instead of face → ball → card. null — the balls, as before.
 */
export function reasonOf(rest: EmployeeRest): "tasks" | "messages" | null {
  return rest === "todo" || rest === "deadline" ? "tasks" : rest === "unread" ? "messages" : null;
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
