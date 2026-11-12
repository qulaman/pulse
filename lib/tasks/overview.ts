import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";

import { REASON_ORDER, reasonOf, type DeskReason } from "./desk";
import { compareTasks, groupTasks, mostUrgent, nearestDeadline, type Bucket, type Groupable } from "./grouping";
import { awaitsMyMove } from "./my-move";
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

/** The employee's three piles, disjoint: to take up (new and returned), in hand, history. */
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

/**
 * Where an employee's task lives: to take up, in hand (handed in included), or over. A return for
 * rework sits with the new ones (D-173): both wait for the person's move — the «to-do» of Лента
 * (`isTodo`) — and the first card of the pile opens by itself.
 */
export function employeeTabOf(task: { status: TaskStatus }): EmployeeTab {
  if (task.status === "sent" || task.status === "rework") return "new";
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

/** `late` — its deadline has passed: the row says «Просрочено» (the employee's screen, D-173). */
export type Nearest = { id: string; title: string; who: string; at: string; late?: boolean };

export type StatusScreen = {
  /**
   * The employee's screen (D-173): «compact» — orders wait for the person's move, the screen is one
   * line (the number and, when one is late, that order) so the cards and «Принял» are in sight;
   * «lean» — the full screen without the numbers the tabs already say. Absent — the director's.
   */
  variant?: "compact" | "lean";
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
    { key: "waiting", label: pluralRu(waiting, ["ждёт решения", "ждут решения", "ждут решения"]), count: waiting, tone: "warn" as Tone },
    { key: "unseen", label: pluralRu(unseen, ["не принята", "не приняты", "не приняты"]), count: unseen, tone: "accent" as Tone },
    { key: "working", label: "в работе", count: working, tone: "ok" as Tone },
    { key: "scheduled", label: pluralRu(scheduled, ["отложена", "отложены", "отложено"]), count: scheduled, tone: "muted" as Tone },
  ].filter((segment) => segment.count > 0);
  const closedToday = closedTodayCount(tasks, now);
  const closedWeek = closedTodayCount(tasks, now, 7);
  const nearest = nearestOf(tasks, now, (task) => shortName(task.assignee?.full_name));

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
 * The employee's status screen (D-173). While orders wait for the person's move — a new one, a
 * return for rework, work past its deadline (`awaitsMyMove`, the rule of the «Дела» badge and the
 * Лента ball) — it is one line: how many wait and, when one is late, that order by name; the cards
 * under it say the rest, so «Принял» stays in sight. Otherwise the lean screen: how much is in work
 * — the «В работе» tab's own number, handed-in work counted in it — and the nearest deadline that is
 * still the person's to meet. Each fact once: no «открыто», no legend beside the tabs.
 */
export function employeeScreen<T extends ListTask>(tasks: readonly T[], now: Date = new Date()): StatusScreen {
  let fresh = 0;
  let rework = 0;
  let late = 0;
  let working = 0;
  let review = 0;
  for (const task of tasks) {
    if (task.status === "sent") fresh += 1;
    else if (task.status === "rework") rework += 1;
    else if (task.status === "pending_review") review += 1;
    else if (task.status === "accepted" || task.status === "in_progress") {
      if (awaitsMyMove(task, now)) late += 1;
      else working += 1;
    }
  }
  const waiting = fresh + rework + late;
  const open = waiting + working + review;
  const segments: Segment[] = [
    { key: "overdue", label: pluralRu(late, ["просрочено", "просрочены", "просрочено"]), count: late, tone: "danger" as Tone },
    { key: "new", label: pluralRu(fresh, ["новое", "новых", "новых"]), count: fresh, tone: "accent" as Tone },
    { key: "rework", label: "на доработке", count: rework, tone: "warn" as Tone },
    { key: "working", label: "в работе", count: working, tone: "ok" as Tone },
    { key: "review", label: "на проверке", count: review, tone: "muted" as Tone },
  ].filter((segment) => segment.count > 0);
  const closedToday = closedTodayCount(tasks, now);
  const closedWeek = closedTodayCount(tasks, now, 7);
  const urgent = mostUrgent(tasks, now);
  const nearest: Nearest | null = urgent
    ? { id: urgent.task.id, title: urgent.task.title, who: "", at: urgent.task.deadline as string, late: urgent.late }
    : null;
  const base = { segments, open, nearest, closedToday, closedWeek };

  if (waiting > 0) {
    const parts: string[] = [];
    if (fresh > 0) parts.push(plural(fresh, ["новое", "новых", "новых"]));
    if (rework > 0) parts.push(`${rework} на доработке`);
    if (late > 0) parts.push(plural(late, ["просрочено", "просрочены", "просрочено"]));
    return {
      ...base,
      variant: "compact",
      eyebrow: late > 0 ? "Срок прошёл" : fresh > 0 ? "Новые поручения" : "На доработке",
      tone: late > 0 ? "danger" : fresh > 0 ? "accent" : "warn",
      value: waiting,
      label: pluralRu(waiting, ["дело ждёт вас", "дела ждут вас", "дел ждут вас"]),
      detail: parts.join(" · "),
    };
  }
  const inWork = working + review;
  if (working > 0) {
    return {
      ...base,
      variant: "lean",
      eyebrow: "Всё по плану",
      tone: "ok",
      value: inWork,
      label: pluralRu(inWork, ["дело в работе", "дела в работе", "дел в работе"]),
      detail: review > 0 ? `из них ${review} на проверке у директора` : "",
    };
  }
  if (review > 0) {
    return {
      ...base,
      variant: "lean",
      eyebrow: "Ждёт проверки",
      tone: "ok",
      value: null,
      label: `${plural(review, ["дело", "дела", "дел"])} на проверке`,
      detail: "директор посмотрит и закроет",
    };
  }
  // the legend under the empty bar says what got closed today and this week
  return { ...base, variant: "lean", eyebrow: "Всё сделано", tone: "ok", value: null, label: "Открытых дел нет", detail: "" };
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
 * The life of a task in four steps — выдана → в работе → сдана → закрыта — with the time
 * of each one that happened. A station always names a stage, never a button's verb (D-173): the
 * employee's «Принял» stood under a green «Принять», and «Принята» read as their own acceptance
 * rather than the director's. The step the task is stuck on is «current»; a detour (a
 * return for rework, a refusal, a recall) replaces the step it happened at. `declinedAt` — when
 * a recalled task had been refused first (from its thread): the refusal stays on the way to the
 * recall instead of vanishing behind it (D-142). `forAssignee` — the steps as the person who holds
 * the task reads them: a new one's current station is «Ждёт вас», not «В работе», which on the
 * current ring read as taken already (D-173); the director and the desk keep «В работе».
 */
export function stepsOf(
  task: ListTask,
  now: Date = new Date(),
  { declinedAt = null, forAssignee = false }: { declinedAt?: string | null; forAssignee?: boolean } = {},
): Step[] {
  const handed: Step =
    task.status === "scheduled"
      ? { key: "handed", label: "Уйдёт", at: task.scheduled_send_at, state: "current" }
      : { key: "handed", label: "Выдана", at: task.created_at, state: "done" };
  const overdue = isOverdue(task, now);
  const late = (state: StepState): StepState => (overdue && state === "current" ? "bad" : state);

  switch (task.status) {
    case "scheduled":
      return [handed, step("work", "В работе", null, "todo"), step("handed_in", "Сдана", null, "todo"), step("closed", "Закрыта", null, "todo")];
    case "sent":
      return [
        handed,
        step("work", forAssignee ? "Ждёт вас" : "В работе", null, late("current")),
        step("handed_in", "Сдана", null, "todo"),
        step("closed", "Закрыта", null, "todo"),
      ];
    case "accepted":
    case "in_progress":
      // the station still ahead is named by its stage as a process — «Сдача», like «Доработка» and
      // «Проверка» — not «Сдана», which on the current ring read as handed in already
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдача", null, late("current")), step("closed", "Закрыта", null, "todo")];
    case "rework":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Доработка", null, late("warn")), step("closed", "Закрыта", null, "todo")];
    case "pending_review":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдана", task.completed_at, "done"), step("closed", "Проверка", null, "current")];
    case "done":
      return [handed, step("work", "В работе", task.accepted_at, "done"), step("handed_in", "Сдана", task.completed_at, "done"), step("closed", "Закрыта", closedAtOf(task), "done")];
    case "declined":
      return [handed, step("work", "Отказ", closedAtOf(task), "bad"), step("handed_in", "Сдана", null, "todo"), step("closed", "Закрыта", null, "todo")];
    case "revoked":
      return [
        handed,
        declinedAt && !task.accepted_at
          ? step("work", "Отказ", declinedAt, "bad")
          : step("work", "В работе", task.accepted_at, task.accepted_at ? "done" : "todo"),
        declinedAt && task.accepted_at
          ? step("handed_in", "Отказ", declinedAt, "bad")
          : step("handed_in", "Сдана", task.completed_at, task.completed_at ? "done" : "todo"),
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
 * handed-in work is «на проверке», a new task asks for the tap; a returned one is «на доработке»
 * — short, it shares the line with the deadline pill; the director's own words under it say why
 * (D-173). Overdue beats the stage, except for the employee's two that wait for a move (they sit
 * with the new ones): their red deadline says it.
 */
export function statusWord(
  task: { status: TaskStatus; deadline: string | null; scheduled_send_at?: string | null; passed_to?: string | null },
  role: "director" | "employee",
  now: Date = new Date(),
): string {
  if (isOverdue(task, now) && !(role === "employee" && (task.status === "sent" || task.status === "rework"))) return "просрочена";
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
