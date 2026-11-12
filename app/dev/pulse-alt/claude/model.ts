/**
 * The board's reasoning for the «Разговор» prototype: lanes, counts, the mood, the crew, the
 * receipt line and a tiny phrase reader for typed text. Pure functions over the shared
 * fixtures — no React, no clock other than the fixture NOW.
 */

import {
  DRAFT,
  DRAFT_EXTRA,
  EVENTS,
  NOW,
  PEOPLE,
  QUERY,
  at,
  dayLabel,
  hhmm,
  minutesAgo,
  personById,
  type Draft,
  type Lane,
  type Person,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

// ---- words -------------------------------------------------------------------------------------

/** Russian plural: 1 задача, 2 задачи, 5 задач. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const FEMALE = new Set(["p-aigul", "p-dinara", "p-asel", "p-irina", "p-gulnara", "s-zhanna"]);

/** Past-tense verb in the person's gender: «увидел» / «увидела». */
export function verb(personId: string | null | undefined, male: string): string {
  return personId && FEMALE.has(personId) ? `${male}а` : male;
}

/** A word in the person's gender when adding «а» is not enough: «отказался» / «отказалась». */
export function gendered(personId: string | null | undefined, male: string, female: string): string {
  return personId && FEMALE.has(personId) ? female : male;
}

/** «40 мин», «2 ч 10 мин», «1 ч». */
export function spanLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}

/** Dative short name for «Задача для Марата» → we use «для» + genitive-ish; kept simple: «Марату». */
export function dative(person: Person | undefined): string {
  if (!person) return "";
  const name = person.short;
  if (name.endsWith(".")) return name; // «Ерлан Б.» stays as is
  if (FEMALE.has(person.id)) {
    if (name.endsWith("а")) return `${name.slice(0, -1)}е`;
    if (name.endsWith("я")) return `${name.slice(0, -1)}е`;
    return name; // Айгуль, Асель — indeclinable
  }
  if (name.endsWith("й")) return `${name.slice(0, -1)}ю`;
  return `${name}у`;
}

// ---- lanes and counts ------------------------------------------------------------------------

export type Lanes = Record<Lane, Task[]>;

export function lanesOf(tasks: readonly Task[]): Lanes {
  const lanes: Lanes = { overdue: [], declined: [], question: [], review: [], work: [], held: [] };
  for (const task of tasks) lanes[task.lane].push(task);
  return lanes;
}

/** A task belongs to «Сообщения» while it holds an open question, a time request or unread words. */
export const hasMessage = (task: Task): boolean => Boolean(task.question || task.timeRequest || task.unread);

export type Counts = {
  tasks: number;
  messages: number;
  attention: number;
  waiting: number;
  overdue: number;
  declined: number;
  review: number;
  work: number;
  held: number;
};

export function countsOf(tasks: readonly Task[]): Counts {
  const lanes = lanesOf(tasks);
  const messages = tasks.filter(hasMessage).length;
  const attention = lanes.overdue.length + lanes.declined.length + lanes.review.length;
  return {
    tasks: attention + lanes.work.length,
    messages,
    attention,
    // the tab badge: everything that waits for the director's move
    waiting: attention + messages,
    overdue: lanes.overdue.length,
    declined: lanes.declined.length,
    review: lanes.review.length,
    work: lanes.work.length,
    held: lanes.held.length,
  };
}

export type Mood = "alert" | "calm" | "happy";

/** Watchful while something is late or refused; calm while only answers wait; glad when nothing does. */
export function moodOf(tasks: readonly Task[]): Mood {
  const c = countsOf(tasks);
  if (c.overdue > 0 || c.declined > 0) return "alert";
  if (c.waiting > 0) return "calm";
  return "happy";
}

export const MOOD_LINE: Record<Mood, string> = {
  alert: "Есть что посмотреть.",
  calm: "Всё идёт своим ходом.",
  happy: "Всё разобрано. Можно выдохнуть.",
};

/** The attention deck: overdue → declined → review, in this order (questions live in «Сообщения»). */
export function deckOf(tasks: readonly Task[]): Task[] {
  const lanes = lanesOf(tasks);
  return [...lanes.overdue, ...lanes.declined, ...lanes.review];
}

// ---- receipts (principle 8) ------------------------------------------------------------------

export type ReceiptStep = { label: string; time: string | null; done: boolean };

/** «отправлено 08:05 · увидела 08:12 · приняла 08:20», or «не открывал с 10:05» — never «не получил». */
export function receiptOf(task: Task): { steps: ReceiptStep[]; quiet: string | null } {
  const r = task.receipt;
  const who = task.assigneeId;
  if (task.status === "scheduled") {
    return { steps: [], quiet: "уйдёт утром в 8:00 — пока никто не видит" };
  }
  const steps: ReceiptStep[] = [
    { label: "отправлено", time: r.sentAt ? hhmm(r.sentAt) : null, done: Boolean(r.sentAt) },
    { label: verb(who, "увидел"), time: r.seenAt ? hhmm(r.seenAt) : null, done: Boolean(r.seenAt) },
    { label: verb(who, "принял"), time: r.acceptedAt ? hhmm(r.acceptedAt) : null, done: Boolean(r.acceptedAt) },
  ];
  const quiet = r.sentAt && !r.seenAt ? `${verb(who, "не открывал")} с ${hhmm(r.sentAt)}` : null;
  return { steps, quiet };
}

/** What the lane says on top of a card. */
export function laneNote(task: Task): { label: string; tone: "clay" | "olive" | "slate" | "ink" } {
  switch (task.lane) {
    case "overdue":
      return { label: task.deadline ? `Просрочка · ${spanLabel(minutesAgo(task.deadline))}` : "Просрочка", tone: "clay" };
    case "declined":
      return { label: `Отказ · ${task.decline ? hhmm(task.decline.at) : ""}`, tone: "clay" };
    case "review":
      return { label: task.report?.partial ? "На приёмке · сделано не всё" : "На приёмке", tone: "olive" };
    case "question":
      return { label: task.timeRequest ? "Просит другой срок" : task.question ? "Вопрос" : "Новое сообщение", tone: "slate" };
    case "held":
      return { label: "Утром в 8:00", tone: "ink" };
    default:
      return { label: task.status === "rework" ? "На доработке" : "В работе", tone: "slate" };
  }
}

// ---- the crew --------------------------------------------------------------------------------

export type Stage = "overdue" | "declined" | "question" | "review" | "work" | "unseen" | "held";

export type CrewMember = {
  person: Person;
  tasks: Task[];
  stage: Stage;
  /** it is the director's move: a ring */
  move: boolean;
  badge: "question" | "declined" | null;
};

const STAGE_RANK: Stage[] = ["overdue", "declined", "question", "review", "work", "unseen", "held"];

function stageOf(task: Task): Stage {
  if (task.lane === "held") return "held";
  if (task.lane === "work" && task.status === "sent" && !task.receipt.seenAt) return "unseen";
  return task.lane as Stage;
}

/** People with work (most urgent first), the free ones and the away ones — the secretary sits at her desk. */
export function crewOf(tasks: readonly Task[]): { busy: CrewMember[]; free: Person[]; away: Person[] } {
  const busy: CrewMember[] = [];
  const free: Person[] = [];
  const away: Person[] = [];
  for (const person of PEOPLE) {
    if (person.role === "secretary") continue;
    const mine = tasks.filter((t) => t.assigneeId === person.id);
    if (person.awayUntil) {
      away.push(person);
      continue;
    }
    if (mine.length === 0) {
      free.push(person);
      continue;
    }
    const stages = mine.map(stageOf).sort((a, b) => STAGE_RANK.indexOf(a) - STAGE_RANK.indexOf(b));
    const stage = stages[0] ?? "work";
    const move = mine.some((t) => ["overdue", "declined", "question", "review"].includes(t.lane));
    const badge = mine.some((t) => t.lane === "declined") ? "declined" : mine.some(hasMessage) ? "question" : null;
    busy.push({ person, tasks: mine, stage, move, badge });
  }
  busy.sort((a, b) => STAGE_RANK.indexOf(a.stage) - STAGE_RANK.indexOf(b.stage));
  return { busy, free, away };
}

// ---- calendar --------------------------------------------------------------------------------

export const todayEvents = () => EVENTS.filter((e) => dayLabel(e.startsAt) === "сегодня");
export const tomorrowEvents = () => EVENTS.filter((e) => dayLabel(e.startsAt) === "завтра");

/** Minutes until the next meeting today, or null. */
export function nextMeeting(now: Date = NOW) {
  const upcoming = EVENTS.filter((e) => new Date(e.startsAt).getTime() > now.getTime()).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const next = upcoming[0];
  if (!next) return null;
  return { event: next, inMin: Math.round((new Date(next.startsAt).getTime() - now.getTime()) / 60_000) };
}

// ---- a phrase in hand ------------------------------------------------------------------------

export type Said = { text: string; voiceSec: number | null };

export type Reply =
  | { kind: "confirm"; drafts: Draft[]; summary: string }
  | { kind: "answer"; lines: string[]; personId: string | null }
  | { kind: "unparsed"; line: string };

export const KIND_LABEL: Record<Draft["kind"], string> = {
  task: "Задача",
  announcement: "Объявление",
  points: "Очки",
  event: "Встреча",
  recurrence: "Повтор",
  note: "Заметка",
  reminder: "Напоминание",
};

/** «Понял так: 2 задачи, объявление, +5 очков, встреча, повтор.» */
export function summaryOf(drafts: readonly Draft[]): string {
  const parts: string[] = [];
  const tasks = drafts.filter((d) => d.kind === "task").length;
  if (tasks) parts.push(tasks === 1 ? "задача" : `${tasks} ${plural(tasks, ["задача", "задачи", "задач"])}`);
  for (const d of drafts) {
    if (d.kind === "announcement") parts.push("объявление");
    if (d.kind === "points") parts.push(`${d.amount > 0 ? "+" : ""}${d.amount} ${plural(d.amount, ["очко", "очка", "очков"])}`);
    if (d.kind === "event") parts.push("встреча");
    if (d.kind === "recurrence") parts.push("повтор");
    if (d.kind === "note") parts.push("заметка");
    if (d.kind === "reminder") parts.push("напоминание");
  }
  return parts.length ? `Понял так: ${parts.join(", ")}.` : "Понял так: ничего.";
}

/** Who a phrase names: the first person whose name stem occurs in it. */
function personIn(text: string): Person | undefined {
  const low = text.toLowerCase();
  return PEOPLE.find((p) => {
    const stem = p.short.replace(/ .*/, "").toLowerCase().slice(0, 4);
    return stem.length >= 3 && low.includes(stem);
  });
}

function capital(s: string): string {
  const t = s.trim().replace(/^[,.:;\s—-]+/, "");
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

let draftSeq = 100;
const nextId = () => `y${++draftSeq}`;

/**
 * The prototype's reader for a typed line: a question gets an answer from the board, «всем: …»
 * an announcement, «+5 …» points, «заметка …» a note, «напомни …» a reminder, the rest a task.
 * The real parse is the LLM; this only keeps the prototype honest about what each kind looks like.
 */
export function readPhrase(raw: string, pinId: string | null): Reply {
  const text = raw.trim();
  const low = text.toLowerCase();
  if (text.length < 3 || /^(ну|эм|короче)\b/.test(low)) return { kind: "unparsed", line: "Не разобрал: не нашёл здесь ни задачи, ни объявления." };
  if (/\?$/.test(text) || /^(что|кто|где|как|сколько|когда)\b/.test(low)) {
    const who = personIn(text);
    if (who?.id === "p-marat" || !who) return { kind: "answer", lines: QUERY.lines, personId: "p-marat" };
    return { kind: "answer", lines: [`У ${who.short} сейчас всё по плану — новых сообщений нет.`], personId: who.id };
  }
  if (/^всем[:,\s]/.test(low)) {
    const body = capital(text.replace(/^всем[:,\s]*/i, ""));
    const drafts: Draft[] = [{ id: nextId(), kind: "announcement", text: body, audience: "Всем", reach: 18 }];
    return { kind: "confirm", drafts, summary: summaryOf(drafts) };
  }
  const points = /^(\+|плюс)\s*(\d+)/i.exec(text);
  if (points) {
    const who = personIn(text) ?? personById(pinId);
    const amount = Number(points[2]);
    const drafts: Draft[] = [
      { id: nextId(), kind: "points", personId: who?.id ?? "p-erlanb", amount, reason: capital(text.replace(points[0], "").replace(/очк\S*/i, "")) || "за работу" },
    ];
    return { kind: "confirm", drafts, summary: summaryOf(drafts) };
  }
  if (/^заметка/.test(low)) {
    const drafts: Draft[] = [{ ...DRAFT_EXTRA[0]!, id: nextId(), text: capital(text.replace(/^заметка[:,\s]*/i, "")) } as Draft];
    return { kind: "confirm", drafts, summary: summaryOf(drafts) };
  }
  if (/^напомни/.test(low)) {
    const drafts: Draft[] = [{ ...DRAFT_EXTRA[1]!, id: nextId(), text: capital(text.replace(/^напомни(ть)?[:,\s]*(мне)?/i, "")) } as Draft];
    return { kind: "confirm", drafts, summary: summaryOf(drafts) };
  }
  const who = personById(pinId) ?? personIn(text);
  let title = text;
  if (who && !pinId) title = text.replace(new RegExp(`^${who.short.replace(/ .*/, "").slice(0, 4)}\\S*[,\\s]*`, "i"), "");
  const deadline = /завтра/i.test(low) ? at(1, 18) : /сегодня/i.test(low) ? at(0, 18) : /пятниц/i.test(low) ? at(4, 18) : null;
  title = capital(title.replace(/\s*(к|до)?\s*(завтра|сегодня|пятниц[уеы])\S*/gi, ""));
  const drafts: Draft[] = [{ id: nextId(), kind: "task", title: title || capital(text), assigneeId: who?.id ?? null, deadline }];
  return { kind: "confirm", drafts, summary: summaryOf(drafts) };
}

/** The voice phrase of the fixture morning. */
export function voiceReply(): Extract<Reply, { kind: "confirm" }> {
  return { kind: "confirm", drafts: DRAFT.map((d) => ({ ...d })), summary: summaryOf(DRAFT) };
}

/** A task without an assignee cannot go yet. */
export const sendable = (d: Draft): boolean => !(d.kind === "task" && !d.assigneeId);

/** Who a draft lands on (for the landing pop on the crew). */
export function recipientsOf(drafts: readonly Draft[]): string[] {
  const ids = new Set<string>();
  for (const d of drafts) {
    if (d.kind === "task" && d.assigneeId) ids.add(d.assigneeId);
    if (d.kind === "recurrence") ids.add(d.assigneeId);
    if (d.kind === "points") ids.add(d.personId);
  }
  return [...ids];
}

/** A deterministic pseudo-random in [0, 1) — the same on the server and the client. */
export function seeded(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
