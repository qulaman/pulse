import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";

import { REASON_ORDER, reasonOf, type DeskReason } from "./desk";
import { compareTasks, groupTasks, nearestDeadline, type Bucket, type Groupable } from "./grouping";
import { isOverdue, pluralRu, SHORT_STATUS, type TaskStatus } from "./status-text";
import type { Tone } from "./tone";

/**
 * «Задачи» and «Мои дела» as one screen shape (D-83): a status screen on top, three tabs
 * under it, and a column of cards that open in place. Everything the screen says — which
 * tab a task lives in, the sections of a tab, the numbers on the status screen, the steps
 * of a task — is decided here, in pure functions, so both roles read the same rules and
 * the rules are tested rather than eyeballed on a phone.
 */

/** The shape these rules need; a full TaskWithPeople satisfies it. */
export type ListTask = Groupable & {
  title: string;
  body: string | null;
  assignee_id: string;
  accepted_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  updated_at: string;
  scheduled_send_at: string | null;
  /** D-128: a reassigned task knows who took over; its end is «передана», not «отозвана» */
  passed_to?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

/** The director's three piles, disjoint: my move, their move, history. */
export type DirectorTab = "yours" | "working" | "closed";

/** The employee's three piles, disjoint: to accept, in hand, history. */
export type EmployeeTab = "new" | "working" | "closed";

const CLOSED: readonly TaskStatus[] = ["done", "revoked"];

/**
 * Where a director's task lives. A task that waits for the director (приёмка, вопрос,
 * отказ, просрочка — `reasonOf`) is «Ждут вас» whatever its status; done and revoked are
 * history; the rest is in the team's hands.
 */
export function directorTabOf(task: { status: TaskStatus }, reason: DeskReason | null): DirectorTab {
  if (reason) return "yours";
  return CLOSED.includes(task.status) ? "closed" : "working";
}

/** Where an employee's task lives: not accepted yet, in hand (handed in included), or over. */
export function employeeTabOf(task: { status: TaskStatus }): EmployeeTab {
  if (task.status === "sent") return "new";
  if (task.status === "done" || task.status === "revoked" || task.status === "declined") return "closed";
  return "working";
}

/** The director's reason for one task: the question and a request for time live on the board row, not the task. */
export function reasonFor(
  task: { status: TaskStatus; deadline: string | null },
  question: string | null | undefined,
  now: Date = new Date(),
  request = false,
): DeskReason | null {
  return reasonOf({ ...task, question: question ?? null, request }, now);
}

/** Title, description or the person's name contain the needle — case-insensitive. */
export function matchesQuery(task: { title: string; body: string | null; assignee: { full_name: string } | null }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.body ?? "").toLowerCase().includes(needle) ||
    (task.assignee?.full_name ?? "").toLowerCase().includes(needle)
  );
}

/* -------------------------------------------------------------------------- */
/* Sections of a tab                                                           */
/* -------------------------------------------------------------------------- */

export type Section<T> = { key: string; title: string; tone: Tone; tasks: T[] };

export const REASON_TITLE: Record<DeskReason, string> = {
  review: "На приёмке",
  time: "Просят срок",
  question: "Вопросы",
  declined: "Отказы",
  overdue: "Просрочено",
};

export const REASON_TONE: Record<DeskReason, Tone> = {
  review: "warn",
  time: "warn",
  question: "warn",
  declined: "danger",
  overdue: "danger",
};

/** «Ждут вас»: one section per reason, in the queue's order, the nearest deadline first. */
export function yoursSections<T extends Groupable>(items: readonly { task: T; reason: DeskReason }[]): Section<T>[] {
  return REASON_ORDER.map((reason) => ({
    key: reason,
    title: REASON_TITLE[reason],
    tone: REASON_TONE[reason],
    tasks: items.filter((item) => item.reason === reason).map((item) => item.task).sort(compareTasks),
  })).filter((section) => section.tasks.length > 0);
}

const BUCKET_TONE: Partial<Record<Bucket, Tone>> = { overdue: "danger", urgent: "warn", today: "accent" };

/**
 * «В работе»: the deadline piles — просрочено → срочно → сегодня → … → без срока. The
 * employee's handed-in work stands at the foot under its own words; the director's
 * «отправлю позже» is not with anyone yet, so it closes the list.
 */
export function workingSections<T extends Groupable>(
  tasks: readonly T[],
  now: Date = new Date(),
  { reviewTitle = "На проверке у директора" }: { reviewTitle?: string } = {},
): Section<T>[] {
  const scheduled = tasks.filter((task) => task.status === "scheduled");
  const rest = tasks.filter((task) => task.status !== "scheduled");
  const sections: Section<T>[] = groupTasks([...rest], "deadline", now).map((group) => ({
    key: group.key,
    title: group.key === "review" ? reviewTitle : group.title,
    tone: BUCKET_TONE[group.key as Bucket] ?? "muted",
    tasks: group.tasks,
  }));
  if (scheduled.length > 0) {
    sections.push({ key: "scheduled", title: "Отправлю позже", tone: "muted", tasks: [...scheduled].sort(compareTasks) });
  }
  return sections;
}

/** When a closed task was closed: the stamp, or its last change for rows closed before it existed. */
export function closedAtOf(task: { closed_at: string | null; updated_at: string }): string {
  return task.closed_at ?? task.updated_at;
}

/** History by the day it closed, newest first: сегодня → вчера → на этой неделе → раньше. */
export function closedSections<T extends Groupable & { closed_at: string | null; updated_at: string }>(
  tasks: readonly T[],
  now: Date = new Date(),
): Section<T>[] {
  const today = aqtobeDay(now);
  const piles: Record<string, T[]> = { today: [], yesterday: [], week: [], earlier: [] };
  const sorted = [...tasks].sort((a, b) => (closedAtOf(a) > closedAtOf(b) ? -1 : closedAtOf(a) < closedAtOf(b) ? 1 : 0));
  for (const task of sorted) {
    const days = today - aqtobeDay(new Date(closedAtOf(task)));
    piles[days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? "week" : "earlier"].push(task);
  }
  const titles: Record<string, string> = { today: "Сегодня", yesterday: "Вчера", week: "На этой неделе", earlier: "Раньше" };
  return Object.keys(titles)
    .filter((key) => piles[key].length > 0)
    .map((key) => ({ key: `closed-${key}`, title: titles[key], tone: "muted" as Tone, tasks: piles[key] }));
}

/** Tasks accepted as done within the last `days` Aqtobe days (1 — today only): the warm numbers of the screen. */
export function closedTodayCount(
  tasks: readonly { status: TaskStatus; closed_at: string | null; updated_at: string }[],
  now: Date = new Date(),
  days = 1,
): number {
  const today = aqtobeDay(now);
  return tasks.filter((task) => task.status === "done" && today - aqtobeDay(new Date(closedAtOf(task))) < days).length;
}

/* -------------------------------------------------------------------------- */
/* The status screen                                                           */
/* -------------------------------------------------------------------------- */

export type Segment = { key: string; label: string; count: number; tone: Tone };

export type Nearest = { id: string; title: string; who: string; at: string };

export type StatusScreen = {
  /** The upper line, in `tone`: what the screen is about right now. */
  eyebrow: string;
  tone: Tone;
  /** The big number; null draws a calm check instead. */
  value: number | null;
  /** The words next to the number. */
  label: string;
  /** One quiet line under them. */
  detail: string;
  /** The stacked bar and its legend: only states that exist, loudest first. */
  segments: Segment[];
  /** Everything open — the right edge of the upper line. */
  open: number;
  nearest: Nearest | null;
  closedToday: number;
  /** Accepted in the last seven days, today included — the calm screen's second number. */
  closedWeek: number;
};

function firstName(full: string | null | undefined): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

function nearestOf<T extends ListTask>(tasks: readonly T[], now: Date, who: (task: T) => string): Nearest | null {
  const at = nearestDeadline([...tasks], now);
  if (!at) return null;
  const task = tasks.find((t) => t.deadline === at && !["done", "revoked", "declined"].includes(t.status));
  return task ? { id: task.id, title: task.title, who: who(task), at } : null;
}

const plural = (count: number, forms: [string, string, string]) => `${count} ${pluralRu(count, forms)}`;

/**
 * The director's status screen. Loudest first: what waits for the director (in red while
 * something is late), else how much the team carries, else a calm «всё закрыто».
 */
export function directorScreen<T extends ListTask>(
  tasks: readonly T[],
  reasons: ReadonlyMap<string, DeskReason>,
  now: Date = new Date(),
): StatusScreen {
  let overdue = 0;
  let waiting = 0;
  let unseen = 0;
  let working = 0;
  let scheduled = 0;
  const byReason: Record<DeskReason, number> = { review: 0, time: 0, question: 0, declined: 0, overdue: 0 };
  for (const task of tasks) {
    const reason = reasons.get(task.id) ?? null;
    if (reason) byReason[reason] += 1;
    if (reason === "overdue") overdue += 1;
    else if (reason) waiting += 1;
    else if (task.status === "scheduled") scheduled += 1;
    else if (task.status === "sent") unseen += 1;
    else if (task.status === "accepted" || task.status === "in_progress" || task.status === "rework") working += 1;
  }
  const yours = overdue + waiting;
  const open = yours + unseen + working + scheduled;
  const segments: Segment[] = [
    { key: "overdue", label: pluralRu(overdue, ["просрочена", "просрочены", "просрочено"]), count: overdue, tone: "danger" as Tone },
    { key: "waiting", label: "ждут решения", count: waiting, tone: "warn" as Tone },
    { key: "unseen", label: pluralRu(unseen, ["не принята", "не приняты", "не приняты"]), count: unseen, tone: "accent" as Tone },
    { key: "working", label: "в работе", count: working, tone: "ok" as Tone },
    { key: "scheduled", label: pluralRu(scheduled, ["отложена", "отложены", "отложено"]), count: scheduled, tone: "muted" as Tone },
  ].filter((segment) => segment.count > 0);
  const closedToday = closedTodayCount(tasks, now);
  const closedWeek = closedTodayCount(tasks, now, 7);
  const nearest = nearestOf(tasks, now, (task) => firstName(task.assignee?.full_name));

  if (yours > 0) {
    const parts: string[] = [];
    if (byReason.review) parts.push(`${byReason.review} на приёмке`);
    if (byReason.time) parts.push(plural(byReason.time, ["просьба о сроке", "просьбы о сроке", "просьб о сроке"]));
    if (byReason.question) parts.push(plural(byReason.question, ["вопрос", "вопроса", "вопросов"]));
    if (byReason.declined) parts.push(plural(byReason.declined, ["отказ", "отказа", "отказов"]));
    if (byReason.overdue) parts.push(plural(byReason.overdue, ["просрочка", "просрочки", "просрочек"]));
    return {
      eyebrow: "Ваш ход",
      tone: overdue > 0 ? "danger" : "warn",
      value: yours,
      label: pluralRu(yours, ["задача ждёт вас", "задачи ждут вас", "задач ждут вас"]),
      detail: parts.join(" · "),
      segments,
      open,
      nearest,
      closedToday,
      closedWeek,
    };
  }
  if (open > 0) {
    return {
      eyebrow: "Всё идёт по плану",
      tone: "ok",
      value: open,
      label: pluralRu(open, ["задача у команды", "задачи у команды", "задач у команды"]),
      detail: unseen > 0 ? `${plural(unseen, ["ещё не принята", "ещё не приняты", "ещё не приняты"])} · решений не ждут` : "решений от вас не ждут",
      segments,
      open,
      nearest,
      closedToday,
      closedWeek,
    };
  }
  return {
    eyebrow: "Всё закрыто",
    tone: "ok",
    value: null,
    label: "Открытых задач нет",
    detail: closedToday > 0 ? `Сегодня закрыто: ${closedToday}` : "Новую задачу — голосом с Пульса",
    segments,
    open,
    nearest,
    closedToday,
    closedWeek,
  };
}

/**
 * The employee's status screen: what to accept first, then what is late, then how much
 * is in hand. Handed-in work is counted but never the headline — it is not their move.
 */
export function employeeScreen<T extends ListTask>(tasks: readonly T[], now: Date = new Date()): StatusScreen {
  let fresh = 0;
  let overdue = 0;
  let working = 0;
  let rework = 0;
  let review = 0;
  for (const task of tasks) {
    if (isOverdue(task, now)) overdue += 1;
    else if (task.status === "sent") fresh += 1;
    else if (task.status === "rework") rework += 1;
    else if (task.status === "accepted" || task.status === "in_progress") working += 1;
    else if (task.status === "pending_review") review += 1;
  }
  // an overdue task that is still new is new first: it waits for «Принял»
  const newTotal = tasks.filter((task) => task.status === "sent").length;
  const open = overdue + fresh + working + rework + review;
  const segments: Segment[] = [
    { key: "overdue", label: pluralRu(overdue, ["просрочено", "просрочены", "просрочено"]), count: overdue, tone: "danger" as Tone },
    { key: "new", label: pluralRu(fresh, ["новое", "новых", "новых"]), count: fresh, tone: "accent" as Tone },
    { key: "rework", label: "на доработке", count: rework, tone: "warn" as Tone },
    { key: "working", label: "в работе", count: working, tone: "ok" as Tone },
    { key: "review", label: "на проверке", count: review, tone: "muted" as Tone },
  ].filter((segment) => segment.count > 0);
  const closedToday = closedTodayCount(tasks, now);
  const closedWeek = closedTodayCount(tasks, now, 7);
  const nearest = nearestOf(tasks, now, () => "");
  const soon = nearest ? `ближайший срок ${humanAqtobe(new Date(nearest.at), now)}` : "сроков нет";

  if (newTotal > 0) {
    return {
      eyebrow: "Новые поручения",
      tone: "accent",
      value: newTotal,
      label: pluralRu(newTotal, ["новое поручение", "новых поручения", "новых поручений"]),
      detail: overdue > 0 ? `примите в работу · ${plural(overdue, ["просрочено", "просрочены", "просрочено"])}` : "примите в работу",
      segments,
      open,
      nearest,
      closedToday,
      closedWeek,
    };
  }
  if (overdue > 0) {
    return {
      eyebrow: "Срок прошёл",
      tone: "danger",
      value: overdue,
      label: pluralRu(overdue, ["дело просрочено", "дела просрочены", "дел просрочено"]),
      detail: soon,
      segments,
      open,
      nearest,
      closedToday,
      closedWeek,
    };
  }
  const inHand = working + rework;
  if (inHand > 0) {
    return {
      eyebrow: "В работе",
      tone: rework > 0 ? "warn" : "ok",
      value: inHand,
      label: pluralRu(inHand, ["дело в работе", "дела в работе", "дел в работе"]),
      detail: review > 0 ? `${soon} · ${review} на проверке` : soon,
      segments,
      open,
      nearest,
      closedToday,
      closedWeek,
    };
  }
  return {
    eyebrow: review > 0 ? "Ждёт проверки" : "Всё сделано",
    tone: "ok",
    value: null,
    label: review > 0 ? `${plural(review, ["дело", "дела", "дел"])} на проверке` : "Открытых дел нет",
    detail: closedToday > 0 ? `Сегодня закрыто: ${closedToday}` : review > 0 ? "директор посмотрит и закроет" : "Новое покажу здесь",
    segments,
    open,
    nearest,
    closedToday,
    closedWeek,
  };
}

/* -------------------------------------------------------------------------- */
/* People: the strip of the director's list                                    */
/* -------------------------------------------------------------------------- */

export type PersonLoad = { id: string; name: string; open: number; yours: number; overdue: number };

/**
 * Everyone who holds something open of the director's, the ones with the director's move
 * first, then late work, then the busiest. Closed work does not put a person on the strip.
 */
export function peopleLoad<T extends ListTask>(tasks: readonly T[], reasons: ReadonlyMap<string, DeskReason>): PersonLoad[] {
  const map = new Map<string, PersonLoad>();
  for (const task of tasks) {
    const reason = reasons.get(task.id) ?? null;
    if (directorTabOf(task, reason) === "closed") continue;
    const row = map.get(task.assignee_id) ?? { id: task.assignee_id, name: task.assignee?.full_name ?? "Без имени", open: 0, yours: 0, overdue: 0 };
    row.open += 1;
    if (reason) row.yours += 1;
    if (reason === "overdue") row.overdue += 1;
    map.set(task.assignee_id, row);
  }
  return [...map.values()].sort(
    (a, b) => b.yours - a.yours || b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, "ru"),
  );
}

/* -------------------------------------------------------------------------- */
/* Steps of one task                                                           */
/* -------------------------------------------------------------------------- */

export type StepState = "done" | "current" | "todo" | "warn" | "bad";

export type Step = { key: string; label: string; at: string | null; state: StepState };

/**
 * The life of a task in four steps — выдана → в работе → сдана → принята — with the time
 * of each one that happened. The step the task is stuck on is «current»; a detour (a
 * return for rework, a refusal, a recall) replaces the step it happened at.
 */
export function stepsOf(task: ListTask, now: Date = new Date()): Step[] {
  const handed: Step =
    task.status === "scheduled"
      ? { key: "handed", label: "Уйдёт", at: task.scheduled_send_at, state: "current" }
      : { key: "handed", label: "Выдана", at: task.created_at, state: "done" };
  const overdue = isOverdue(task, now);
  const late = (state: StepState): StepState => (overdue && state === "current" ? "bad" : state);

  switch (task.status) {
    case "scheduled":
      return [handed, step("work", "В работе", null, "todo"), step("handed_in", "Сдана", null, "todo"), step("closed", "Принята", null, "todo")];
    case "sent":
      return [handed, step("work", "Принять", null, late("current")), step("handed_in", "Сдана", null, "todo"), step("closed", "Принята", null, "todo")];
    case "accepted":
    case "in_progress":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдать", null, late("current")), step("closed", "Принята", null, "todo")];
    case "rework":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Доработка", null, late("warn")), step("closed", "Принята", null, "todo")];
    case "pending_review":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдана", task.completed_at, "done"), step("closed", "Проверка", null, "current")];
    case "done":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдана", task.completed_at, "done"), step("closed", "Принята", closedAtOf(task), "done")];
    case "declined":
      return [handed, step("work", "Отказ", closedAtOf(task), "bad"), step("handed_in", "Сдана", null, "todo"), step("closed", "Принята", null, "todo")];
    case "revoked":
      return [
        handed,
        step("work", "В работе", task.accepted_at, task.accepted_at ? "done" : "todo"),
        step("handed_in", "Сдана", task.completed_at, task.completed_at ? "done" : "todo"),
        // a handover is not a failure: the work went on with another person (D-128)
        task.passed_to ? step("closed", "Передана", closedAtOf(task), "done") : step("closed", "Отозвана", closedAtOf(task), "bad"),
      ];
    default:
      return [handed];
  }
}

function step(key: string, label: string, at: string | null, state: StepState): Step {
  return { key, label, at, state };
}

/** The reason as the state word of a director's card: one task, so the singular. */
export const REASON_WORD: Record<DeskReason, string> = {
  review: "на приёмке",
  time: "просит срок",
  question: "вопрос",
  declined: "отказ",
  overdue: "просрочена",
};

/**
 * The state word of a card as its reader needs it. The director: a new task is «не
 * принята» (that is the fact to watch), a scheduled one says when it goes. The employee:
 * handed-in work is «на проверке», a new task asks for the tap. Overdue beats the stage.
 */
export function statusWord(
  task: { status: TaskStatus; deadline: string | null; scheduled_send_at?: string | null; passed_to?: string | null },
  role: "director" | "employee",
  now: Date = new Date(),
): string {
  if (isOverdue(task, now) && !(role === "employee" && task.status === "sent")) return "просрочена";
  if (task.status === "revoked" && task.passed_to) return "передана";
  if (role === "director") {
    if (task.status === "sent") return "не принята";
    if (task.status === "scheduled" && task.scheduled_send_at) return `уйдёт ${humanAqtobe(new Date(task.scheduled_send_at), now)}`;
  } else {
    if (task.status === "sent") return "новая · примите";
    if (task.status === "pending_review") return "на проверке";
  }
  return SHORT_STATUS[task.status];
}

/* -------------------------------------------------------------------------- */
/* Time left: the foot of the task's own screen                               */
/* -------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;

/** «40 мин», «3 ч 20 мин», «9 ч», «2 дня 4 ч», «12 дней» — how a person says a span. */
export function spanRu(ms: number): string {
  const total = Math.max(0, Math.round(ms / MINUTE));
  if (total < 60) return `${Math.max(1, total)} мин`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours < 24) return hours < 6 && minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const word = pluralRu(days, ["день", "дня", "дней"]);
  return days < 3 && rest > 0 ? `${days} ${word} ${rest} ч` : `${days} ${word}`;
}

export type TimeLeft = {
  text: string;
  tone: Tone;
  /** How much of the time from handing out to the deadline has gone, 0..1; null — no bar. */
  used: number | null;
};

/**
 * The one line under a task's own screen: how much time is left, or how late it is, or how
 * it ended. The bar is the share of the time already used — full and red once it is late.
 */
export function timeLeft(
  task: {
    status: TaskStatus;
    deadline: string | null;
    created_at: string;
    closed_at: string | null;
    updated_at: string;
    completed_at: string | null;
    priority?: string | null;
  },
  now: Date = new Date(),
): TimeLeft {
  if (task.status === "done") return { text: `принята ${humanAqtobe(new Date(closedAtOf(task)), now)}`, tone: "ok", used: null };
  if (task.status === "revoked") return { text: `отозвана ${humanAqtobe(new Date(closedAtOf(task)), now)}`, tone: "muted", used: null };
  if (task.status === "declined") return { text: "отказ — решение за директором", tone: "danger", used: null };
  if (task.status === "pending_review") {
    return { text: task.completed_at ? `сдана ${humanAqtobe(new Date(task.completed_at), now)} · ждёт проверки` : "ждёт проверки", tone: "warn", used: null };
  }
  // «срочно» without a time is the loudest «when» there is (docs/AI.md §10), not «без срока»
  if (!task.deadline) return task.priority === "high" ? { text: "срочно — время не названо", tone: "warn", used: null } : { text: "без срока", tone: "muted", used: null };
  const end = new Date(task.deadline).getTime();
  const start = new Date(task.created_at).getTime();
  const left = end - now.getTime();
  if (left <= 0) return { text: `просрочено на ${spanRu(-left)}`, tone: "danger", used: 1 };
  const used = end > start ? Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))) : 0;
  return { text: `осталось ${spanRu(left)}`, tone: left < DAY_MS ? "warn" : "accent", used };
}
