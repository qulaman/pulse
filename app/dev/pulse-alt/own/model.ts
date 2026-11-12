/**
 * The board, read as «whose move». Pure functions over the shared fixtures: lanes, counts, the
 * mood, every person's altitude (free → at work → waiting for the director), the words under
 * each circle and the receipt steps (principle 8). No React here.
 */
import {
  EVENTS,
  NOW,
  PEOPLE,
  hhmm,
  dayLabel,
  minutesAgo,
  personById,
  type CalendarEvent,
  type Lane,
  type Mood,
  type Person,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

// ---- words -------------------------------------------------------------------------------------

/** People the screen speaks of in the feminine (verbs agree: «сдала», «не открывала»). */
const FEMININE = new Set(["p-aigul", "p-dinara", "p-asel", "p-irina", "p-gulnara", "s-zhanna"]);

export const isFem = (id: string) => FEMININE.has(id);

/** «сдал» / «сдала» by the person. */
export function verb(id: string, masc: string, fem: string): string {
  return isFem(id) ? fem : masc;
}

/** Russian plural: plural(5, ["задача", "задачи", "задач"]). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** «Марату», «Айгуль» — the dative for «задача кому». Names that do not decline stay as they are. */
export function dative(p: Person): string {
  const map: Record<string, string> = {
    "p-marat": "Марату",
    "p-aigul": "Айгуль",
    "p-erlanb": "Ерлану Б.",
    "p-erland": "Ерлану Д.",
    "p-dinara": "Динаре",
    "p-asel": "Асель",
    "p-baur": "Бауыржану",
    "p-oleg": "Олегу",
    "p-irina": "Ирине",
    "p-gulnara": "Гульнаре",
    "p-nurlan": "Нурлану",
    "s-zhanna": "Жанне",
  };
  return map[p.id] ?? p.short;
}

export function firstName(p: Person): string {
  return p.short.split(" ")[0] ?? p.short;
}

// ---- lanes and counts ----------------------------------------------------------------------------

export const ATTENTION: Lane[] = ["overdue", "declined", "review", "question"];
const PRIORITY: Record<Lane, number> = { overdue: 0, declined: 1, review: 2, question: 3, work: 4, held: 5 };

export type Tone = "amber" | "lav" | "mint" | "blue" | "slate" | "glass" | "lime";

export const LANE_TONE: Record<Lane, Tone> = {
  overdue: "amber",
  declined: "lav",
  review: "mint",
  question: "blue",
  work: "slate",
  held: "glass",
};

export const LANE_TITLE: Record<Lane, string> = {
  overdue: "Просрочка",
  declined: "Отказ",
  review: "Приёмка",
  question: "Сообщение",
  work: "В работе",
  held: "Утром",
};

export type Counts = Record<Lane, number> & { attention: number; tasks: number };

export function countsOf(tasks: Task[]): Counts {
  const c = { overdue: 0, declined: 0, question: 0, review: 0, work: 0, held: 0 } as Record<Lane, number>;
  for (const t of tasks) c[t.lane] += 1;
  return {
    ...c,
    attention: c.overdue + c.declined + c.review + c.question,
    // the «Задачи» section counts every open task in hand, the calm ones included (as today)
    tasks: c.overdue + c.declined + c.review + c.work,
  };
}

export function moodOf(c: Counts): Mood {
  if (c.overdue > 0 || c.declined > 0) return "alert";
  return c.attention > 0 ? "calm" : "happy";
}

/** «2 приёмки, 4 сообщения, отказ и просрочка» — the waiting moves as one phrase. */
export function movesPhrase(c: Counts): string {
  const parts: string[] = [];
  if (c.review) parts.push(c.review === 1 ? "приёмка" : `${c.review} ${plural(c.review, ["приёмка", "приёмки", "приёмок"])}`);
  if (c.question) parts.push(c.question === 1 ? "сообщение" : `${c.question} ${plural(c.question, ["сообщение", "сообщения", "сообщений"])}`);
  if (c.declined) parts.push(c.declined === 1 ? "отказ" : `${c.declined} ${plural(c.declined, ["отказ", "отказа", "отказов"])}`);
  if (c.overdue) parts.push(c.overdue === 1 ? "просрочка" : `${c.overdue} ${plural(c.overdue, ["просрочка", "просрочки", "просрочек"])}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

/** The deck order: overdue → declined → review (questions live in «Сообщения»). */
export function deckTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.lane === "overdue" || t.lane === "declined" || t.lane === "review")
    .sort((a, b) => PRIORITY[a.lane] - PRIORITY[b.lane] || (a.deadline ?? "").localeCompare(b.deadline ?? ""));
}

export const messageTasks = (tasks: Task[]) => tasks.filter((t) => t.lane === "question");
export const calmTasks = (tasks: Task[]) => tasks.filter((t) => t.lane === "work");
export const heldTasks = (tasks: Task[]) => tasks.filter((t) => t.lane === "held");

// ---- the message a lane carries ------------------------------------------------------------------

export type Said = { kind: "question" | "time" | "unread" | "decline" | "report" | "overdue" | "none"; text: string };

export function saidOf(t: Task): Said {
  if (t.lane === "declined" && t.decline) return { kind: "decline", text: t.decline.reason };
  if (t.lane === "review" && t.report) return { kind: "report", text: t.report.text };
  if (t.lane === "overdue") return { kind: "overdue", text: overdueBy(t) };
  if (t.question) return { kind: "question", text: t.question.text };
  if (t.timeRequest) return { kind: "time", text: t.timeRequest.why };
  if (t.unread) return { kind: "unread", text: t.unread.text };
  return { kind: "none", text: "" };
}

export function overdueBy(t: Task, now: Date = NOW): string {
  if (!t.deadline) return "";
  const m = minutesAgo(t.deadline, now);
  if (m < 60) return `просрочено на ${m} ${plural(m, ["минуту", "минуты", "минут"])}`;
  const h = Math.floor(m / 60);
  return `просрочено на ${h} ${plural(h, ["час", "часа", "часов"])}`;
}

// ---- time words --------------------------------------------------------------------------------------

/** «до 17:00» today, «завтра к 18:00», «чт, 12 нояб к 18:00». */
export function dueShort(iso: string | null, now: Date = NOW): string {
  if (!iso) return "без срока";
  const d = dayLabel(iso, now);
  if (d === "сегодня") return `до ${hhmm(iso)}`;
  return `${d} к ${hhmm(iso)}`;
}

/** For a label under a disc: «до 17:00», «завтра 12:00», «чт 18:00». */
export function dueTiny(iso: string | null, now: Date = NOW): string {
  if (!iso) return "без срока";
  const d = dayLabel(iso, now);
  if (d === "сегодня") return `до ${hhmm(iso)}`;
  if (d === "завтра") return `завтра ${hhmm(iso)}`;
  return `${d.split(",")[0]} ${hhmm(iso)}`;
}

export function minutesUntil(iso: string, now: Date = NOW): number {
  return -minutesAgo(iso, now);
}

// ---- receipts (principle 8) ----------------------------------------------------------------------

export type Step = { label: string; at: string | null; state: "done" | "wait" | "none" };

/** «отправлено 08:05 · увидела 08:12 · приняла 08:20» — or «не открывала с 10:05», never «не получил». */
export function receiptSteps(t: Task): Step[] {
  const id = t.assigneeId;
  if (t.lane === "held" || !t.receipt.sentAt) return [{ label: "уйдёт утром в 08:00", at: null, state: "wait" }];
  const steps: Step[] = [{ label: "отправлено", at: hhmm(t.receipt.sentAt), state: "done" }];
  if (t.receipt.seenAt) steps.push({ label: verb(id, "увидел", "увидела"), at: hhmm(t.receipt.seenAt), state: "done" });
  else steps.push({ label: `не ${verb(id, "открывал", "открывала")} с ${hhmm(t.receipt.sentAt)}`, at: null, state: "wait" });
  if (t.receipt.seenAt) {
    if (t.receipt.acceptedAt) steps.push({ label: verb(id, "принял", "приняла"), at: hhmm(t.receipt.acceptedAt), state: "done" });
    else if (t.lane !== "declined") steps.push({ label: "ещё не принял", at: null, state: "wait" });
  }
  return steps;
}

// ---- people by altitude ----------------------------------------------------------------------------

/** Altitude, top to bottom: free → at work → waiting for the director (heavy, on the horizon). */
export type Altitude = "free" | "away" | "work" | "unseen" | "held" | "heavy";

export type Crew = {
  id: string;
  person: Person;
  altitude: Altitude;
  tasks: Task[];
  attention: Task[];
  worst: Lane | null;
  /** one or two words under the circle: «просрочка», «сдал», «вопрос», «до 17:00» */
  reason: string;
  tone: Tone;
  /** how many moves wait for the director (the badge) */
  moves: number;
};

function reasonOf(p: Person, worst: Task): { reason: string; tone: Tone } {
  switch (worst.lane) {
    case "overdue":
      return { reason: "просрочка", tone: "amber" };
    case "declined":
      return { reason: "не может", tone: "lav" };
    case "review":
      return { reason: worst.report?.partial ? verb(p.id, "сдал не всё", "сдала не всё") : verb(p.id, "сдал", "сдала"), tone: "mint" };
    case "question":
      if (worst.question) return { reason: "вопрос", tone: "blue" };
      if (worst.timeRequest) return { reason: "просит срок", tone: "blue" };
      return { reason: verb(p.id, "написал", "написала"), tone: "blue" };
    default:
      return { reason: "", tone: "slate" };
  }
}

export function crewOf(tasks: Task[], people: Person[] = PEOPLE): Crew[] {
  return people
    .filter((p) => p.role === "employee")
    .map((p): Crew => {
      const mine = tasks.filter((t) => t.assigneeId === p.id);
      const attention = mine
        .filter((t) => ATTENTION.includes(t.lane))
        .sort((a, b) => PRIORITY[a.lane] - PRIORITY[b.lane]);
      const worst = attention[0] ?? null;
      if (worst) {
        const r = reasonOf(p, worst);
        return { id: p.id, person: p, altitude: "heavy", tasks: mine, attention, worst: worst.lane, reason: r.reason, tone: r.tone, moves: attention.length };
      }
      const work = mine.filter((t) => t.lane === "work");
      if (work.length) {
        const unseen = work.every((t) => !t.receipt.seenAt && t.receipt.sentAt);
        const first = [...work].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))[0]!;
        return {
          id: p.id,
          person: p,
          altitude: unseen ? "unseen" : "work",
          tasks: mine,
          attention,
          worst: null,
          reason: unseen ? `не ${verb(p.id, "открывал", "открывала")} с ${hhmm(first.receipt.sentAt!)}` : dueTiny(first.deadline),
          tone: "slate",
          moves: 0,
        };
      }
      if (mine.some((t) => t.lane === "held")) {
        return { id: p.id, person: p, altitude: "held", tasks: mine, attention, worst: null, reason: "утром в 08:00", tone: "glass", moves: 0 };
      }
      if (p.awayUntil) {
        return { id: p.id, person: p, altitude: "away", tasks: mine, attention, worst: null, reason: `${p.awayWhy ?? "нет"} до ${dayLabel(p.awayUntil).replace(/^\S+, /, "")}`, tone: "slate", moves: 0 };
      }
      return { id: p.id, person: p, altitude: "free", tasks: mine, attention, worst: null, reason: "без задач", tone: "slate", moves: 0 };
    });
}

/** Heavy people in the order the director meets them: overdue → declined → review → messages. */
export function heavyOrder(crew: Crew[]): Crew[] {
  return crew
    .filter((c) => c.altitude === "heavy")
    .sort((a, b) => PRIORITY[a.worst!] - PRIORITY[b.worst!] || b.moves - a.moves);
}

// ---- the calendar ----------------------------------------------------------------------------------

export function todayEvents(events: CalendarEvent[] = EVENTS, now: Date = NOW): CalendarEvent[] {
  return events.filter((e) => dayLabel(e.startsAt, now) === "сегодня").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function nextEvent(events: CalendarEvent[] = EVENTS, now: Date = NOW): CalendarEvent | null {
  return [...events].filter((e) => new Date(e.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
}

export { personById };
