import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";

import { attentionOf, isStaleUnaccepted, type AttentionVerdict } from "./attention";
import { REASON_ORDER, reasonOf, type DeskReason } from "./reasons";
import { compareTasks, groupTasks, mostUrgent, nearestDeadline, type Bucket, type Groupable } from "./grouping";
import { awaitsMyMove } from "./my-move";
import { isOverdue, pluralRu, SHORT_STATUS, type TaskStatus } from "./status-text";
import type { BarTone, Tone } from "./tone";

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

/**
 * The director's tabs by name, the phone's and the desk's alike. The middle one is everything in
 * the team's hands — taken and not taken yet — so it is «У команды», not «В работе», which an order
 * nobody has accepted is not (the owner, 2026-11-25).
 */
export const DIRECTOR_TAB_LABEL: Record<DirectorTab, string> = { yours: "Ждут вас", working: "У команды", closed: "Закрытые" };

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
  review: "На проверке",
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

// «сегодня» is a time, not a state: grey like the other time piles — never the brand colour (D-194)
const BUCKET_TONE: Partial<Record<Bucket, Tone>> = { overdue: "danger", urgent: "warn" };

/**
 * «В работе»: the deadline piles — «просрочено» → «срочно» → «сегодня» → … → «без срока». The
 * employee's handed-in work stands at the foot under its own words; the director's
 * «отправлю позже» is not with anyone yet, so it closes the list. The director's orders nobody has
 * taken yet stand first under «Не приняты» (`unacceptedFirst`): the tab is the team's hands, and an
 * order not taken is not in work yet — the pile says so instead of a «сегодня» that hides it; amber
 * once one has waited past ACCEPT_GRACE_MS.
 */
export function workingSections<T extends Groupable & { scheduled_send_at?: string | null }>(
  tasks: readonly T[],
  now: Date = new Date(),
  { reviewTitle = "На проверке у директора", unacceptedFirst = false }: { reviewTitle?: string; unacceptedFirst?: boolean } = {},
): Section<T>[] {
  const scheduled = tasks.filter((task) => task.status === "scheduled");
  const unaccepted = unacceptedFirst ? tasks.filter((task) => task.status === "sent") : [];
  const rest = tasks.filter((task) => task.status !== "scheduled" && !(unacceptedFirst && task.status === "sent"));
  const sections: Section<T>[] = [];
  if (unaccepted.length > 0) {
    sections.push({
      key: "unaccepted",
      title: "Не приняты",
      tone: unaccepted.some((task) => isStaleUnaccepted(task, now)) ? "warn" : "muted",
      tasks: [...unaccepted].sort(compareTasks),
    });
  }
  sections.push(...groupTasks([...rest], "deadline", now).map((group) => ({
    key: group.key,
    title: group.key === "review" ? reviewTitle : group.title,
    tone: BUCKET_TONE[group.key as Bucket] ?? "muted",
    tasks: group.tasks,
  })));
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

/** One state of the stacked bar; `wait` — not answered yet, drawn hollow (lib/tasks/tone.ts). */
export type Segment = { key: string; label: string; count: number; tone: BarTone };

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
  /**
   * The director's verdict (lib/tasks/attention.ts): what needs him besides «Ждут вас» — an order
   * nobody has taken for half an hour, pushes that do not reach, a deadline within the hour. The
   * screen offers the move for `focus` (the loudest task). Absent on the employee's screen.
   */
  attention?: AttentionVerdict;
  focus?: string | null;
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
 * something is late); else what needs him all the same — an order nobody has taken for half an
 * hour, pushes that do not reach its holder, a deadline within the hour (`attentionOf`, the one
 * verdict of every screen); else how much the team carries; else a calm «всё закрыто». «Всё идёт
 * по плану» is said only when the verdict is ok and something is actually taken. `noPush` — whose
 * pushes do not reach them (`noPushIds`). Each fact once: the bar's legend only when it splits
 * the work into two states or more, «открыто» only when it is not the big number already.
 */
export function directorScreen<T extends ListTask>(
  tasks: readonly T[],
  reasons: ReadonlyMap<string, DeskReason>,
  now: Date = new Date(),
  { noPush }: { noPush?: ReadonlySet<string> } = {},
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
  // the bar fills only what is moving: taken work green, the director's move amber, late red; what
  // nobody has answered yet is a hollow segment — a bar of untaken orders reads empty, never full
  const segments: Segment[] = [
    { key: "overdue", label: pluralRu(overdue, ["просрочена", "просрочены", "просрочено"]), count: overdue, tone: "danger" as BarTone },
    { key: "waiting", label: pluralRu(waiting, ["ждёт решения", "ждут решения", "ждут решения"]), count: waiting, tone: "warn" as BarTone },
    { key: "working", label: "в работе", count: working, tone: "ok" as BarTone },
    { key: "unseen", label: pluralRu(unseen, ["не принята", "не приняты", "не приняты"]), count: unseen, tone: "wait" as BarTone },
    { key: "scheduled", label: pluralRu(scheduled, ["отложена", "отложены", "отложено"]), count: scheduled, tone: "muted" as BarTone },
  ].filter((segment) => segment.count > 0);
  const closedToday = closedTodayCount(tasks, now);
  const closedWeek = closedTodayCount(tasks, now, 7);
  const nearest = nearestOf(tasks, now, (task) => shortName(task.assignee?.full_name));
  const attention = attentionOf(tasks, { now, reasons, noPush });
  const base = { segments, open, nearest, closedToday, closedWeek, attention };
  // the untaken ones that need him, said after the queue's own words
  const untaken = attention.counts.unaccepted + attention.counts.no_push;

  if (yours > 0) {
    const parts: string[] = [];
    if (byReason.review) parts.push(`${byReason.review} на проверке`);
    if (byReason.time) parts.push(plural(byReason.time, ["просьба о сроке", "просьбы о сроке", "просьб о сроке"]));
    if (byReason.question) parts.push(plural(byReason.question, ["вопрос", "вопроса", "вопросов"]));
    if (byReason.declined) parts.push(plural(byReason.declined, ["отказ", "отказа", "отказов"]));
    if (byReason.overdue) parts.push(plural(byReason.overdue, ["просрочка", "просрочки", "просрочек"]));
    // «давно» only past the grace; a push that does not reach is said as that, from the first minute
    const stale = attention.counts.unaccepted;
    const unreachable = attention.counts.no_push;
    if (stale) parts.push(`${stale} ${pluralRu(stale, ["не принята", "не приняты", "не приняты"])} давно`);
    if (unreachable) parts.push(`${unreachable} ${pluralRu(unreachable, ["не принята", "не приняты", "не приняты"])} — уведомления не доходят`);
    // one task for one reason: the big «1» has said how many — the words say only what
    const single = parts.length === 1 && yours === 1;
    return {
      ...base,
      eyebrow: "Ваш ход",
      tone: overdue > 0 ? "danger" : "warn",
      value: yours,
      label: pluralRu(yours, ["задача ждёт вас", "задачи ждут вас", "задач ждут вас"]),
      detail: single ? parts[0].replace(/^\d+\s/, "") : parts.join(" · "),
      // «Ждут вас» opens its first card by itself: no second door to it on the screen
      focus: null,
    };
  }
  if (!attention.ok) {
    const count = attention.items.length;
    const allUntaken = untaken === count;
    return {
      ...base,
      eyebrow: "Требует внимания",
      tone: attention.tone,
      value: count,
      label: allUntaken
        ? pluralRu(count, ["задача не принята", "задачи не приняты", "задач не приняты"])
        : attention.counts.soon === count
          ? pluralRu(count, ["задача — срок близко", "задачи — срок близко", "задач — срок близко"])
          : pluralRu(count, ["задача требует внимания", "задачи требуют внимания", "задач требуют внимания"]),
      detail: attention.words ?? "",
      focus: attention.items[0].id,
    };
  }
  if (open > 0 && open === scheduled) {
    // only orders held for later: nobody has them yet, so nobody owes an answer
    return {
      ...base,
      eyebrow: "Отправлю позже",
      tone: "muted",
      value: open,
      label: pluralRu(open, ["задача ждёт отправки", "задачи ждут отправки", "задач ждут отправки"]),
      detail: "решений от вас не ждут",
      focus: null,
    };
  }
  if (open > 0) {
    // nothing taken yet is not «по плану» yet: the team has not answered — grey, not green
    const taken = working > 0;
    return {
      ...base,
      eyebrow: taken ? "Всё идёт по плану" : "Ждём ответа",
      tone: taken ? "ok" : "muted",
      value: open,
      label: pluralRu(open, ["задача у команды", "задачи у команды", "задач у команды"]),
      // the legend names the untaken ones when the work splits; alone, they are the big number
      detail: !taken && unseen === open ? `${pluralRu(unseen, ["ещё не принята", "ещё не приняты", "ещё не приняты"])} · решений не ждут` : "решений от вас не ждут",
      focus: null,
    };
  }
  return {
    ...base,
    eyebrow: "Всё закрыто",
    tone: "ok",
    value: null,
    label: "Открытых задач нет",
    // the legend says what got closed; the list's own empty card says how to give a task — once
    detail: "",
    focus: null,
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
    { key: "overdue", label: pluralRu(late, ["просрочена", "просрочены", "просрочено"]), count: late, tone: "danger" as BarTone },
    { key: "new", label: pluralRu(fresh, ["новая", "новые", "новых"]), count: fresh, tone: "warn" as BarTone },
    { key: "rework", label: "на доработке", count: rework, tone: "warn" as BarTone },
    { key: "working", label: "в работе", count: working, tone: "ok" as BarTone },
    { key: "review", label: "на проверке", count: review, tone: "wait" as BarTone },
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
    if (fresh > 0) parts.push(plural(fresh, ["новая", "новые", "новых"]));
    if (rework > 0) parts.push(`${rework} на доработке`);
    if (late > 0) parts.push(plural(late, ["просрочена", "просрочены", "просрочено"]));
    return {
      ...base,
      variant: "compact",
      eyebrow: late > 0 ? "Срок прошёл" : fresh > 0 ? "Новые задачи" : "На доработке",
      // a new order is the holder's move: amber like a return, never the brand colour (D-194)
      tone: late > 0 ? "danger" : "warn",
      value: waiting,
      label: pluralRu(waiting, ["задача ждёт вас", "задачи ждут вас", "задач ждут вас"]),
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
      label: pluralRu(inWork, ["задача в работе", "задачи в работе", "задач в работе"]),
      detail: review > 0 ? `из них ${review} на проверке у директора` : "",
    };
  }
  if (review > 0) {
    return {
      ...base,
      variant: "lean",
      eyebrow: "На проверке",
      tone: "muted",
      value: null,
      label: `${plural(review, ["задача", "задачи", "задач"])} на проверке`,
      detail: "директор посмотрит и закроет",
    };
  }
  // the legend under the empty bar says what got closed today and this week
  // the one empty phrase of the product (DESIGN §5): «Дел нет. Придёт задача — я позову»
  return { ...base, variant: "lean", eyebrow: "Дел нет", tone: "ok", value: null, label: "Придёт задача — я позову", detail: "" };
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
 * The life of a task in four stages — the wall's ladder (lib/tv/words.ts): Поручено → В работе →
 * На проверке → Готово — with the time each one began. The ring stands on the stage the task is at
 * NOW: a task nobody has taken is at «Поручено», never at «В работе» — the director read a lit «В
 * работе» next to «не принята» as taken already. A station names a stage, never a button's verb
 * (D-173). The holder reads their own new task's stage as «Ждёт вас». A detour replaces the stage
 * it happened at: a return for rework is «Доработка» in place of «В работе», a refusal and a recall
 * stand where the task was. `declinedAt` — when a recalled task had been refused first (from its
 * thread): the refusal stays on the way to the recall instead of vanishing behind it (D-142).
 * The current stage is amber once an untaken order has waited past ACCEPT_GRACE_MS, red when late.
 */
export function stepsOf(
  task: ListTask,
  now: Date = new Date(),
  { declinedAt = null, forAssignee = false }: { declinedAt?: string | null; forAssignee?: boolean } = {},
): Step[] {
  const overdue = isOverdue(task, now);
  const late = (state: StepState): StepState => (overdue && (state === "current" || state === "warn") ? "bad" : state);
  const handedAt = task.scheduled_send_at ?? task.created_at;
  const handed = step("handed", "Поручено", handedAt, "done");
  const review = (state: StepState, at: string | null = null) => step("review", "На проверке", at, state);
  const closed = (state: StepState, at: string | null = null) => step("closed", "Готово", at, state);

  switch (task.status) {
    case "scheduled":
      return [step("handed", "Уйдёт", task.scheduled_send_at, "current"), step("work", "В работе", null, "todo"), review("todo"), closed("todo")];
    case "sent":
      return [
        forAssignee
          ? step("handed", "Ждёт вас", handedAt, late("current"))
          : step("handed", "Поручено", handedAt, late(isStaleUnaccepted(task, now) ? "warn" : "current")),
        step("work", "В работе", null, "todo"),
        review("todo"),
        closed("todo"),
      ];
    case "accepted":
    case "in_progress":
      return [handed, step("work", "В работе", task.accepted_at, late("current")), review("todo"), closed("todo")];
    case "rework":
      return [handed, step("work", "Доработка", null, late("warn")), review("todo"), closed("todo")];
    case "pending_review":
      return [handed, step("work", "В работе", task.accepted_at, "done"), review("current", task.completed_at), closed("todo")];
    case "done":
      return [handed, step("work", "В работе", task.accepted_at, "done"), review("done", task.completed_at), closed("done", closedAtOf(task))];
    case "declined":
      return [handed, step("work", "Отказ", closedAtOf(task), "bad"), review("todo"), closed("todo")];
    case "revoked":
      return [
        handed,
        declinedAt && !task.accepted_at
          ? step("work", "Отказ", declinedAt, "bad")
          : step("work", "В работе", task.accepted_at, task.accepted_at ? "done" : "todo"),
        declinedAt && task.accepted_at ? step("review", "Отказ", declinedAt, "bad") : review(task.completed_at ? "done" : "todo", task.completed_at),
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
  review: "на проверке",
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
  // far from the deadline is calm, not a state: grey, never the brand colour (D-194)
  return { text: `осталось ${spanRu(left)}`, tone: left < DAY_MS ? "warn" : "muted", used };
}
