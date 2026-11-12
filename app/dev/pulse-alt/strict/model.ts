/**
 * The «strict» entry's own model: pure helpers over the shared fixtures — lanes, counts, the
 * barometer, the team sheet, receipts in the product's words, Russian cases for names, and the
 * deterministic «parse» a prototype needs (no network, no model).
 */

import {
  DRAFT,
  EVENTS,
  PEOPLE,
  QUERY,
  UNPARSED,
  at,
  dayLabel,
  hhmm,
  minutesAgo,
  personById,
  whenLabel,
  type CalendarEvent,
  type Draft,
  type Lane,
  type Mood,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

// ---- people -------------------------------------------------------------------------------------

const FEMALE = new Set(["p-aigul", "p-dinara", "p-asel", "p-irina", "p-gulnara", "s-zhanna"]);

/** The verb in the person's gender: g(id, "увидел", "увидела"). */
export function g(id: string, male: string, female: string): string {
  return FEMALE.has(id) ? female : male;
}

export const nameOf = (id: string | null | undefined): string => personById(id)?.short ?? "—";

/** «Отправил Марату», «задача Айгуль». */
const DATIVE: Record<string, string> = {
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
export const dative = (id: string | null | undefined): string => (id ? (DATIVE[id] ?? nameOf(id)) : "—");

/** «у Марата», «у Айгуль». */
const GENITIVE: Record<string, string> = {
  "p-marat": "Марата",
  "p-aigul": "Айгуль",
  "p-erlanb": "Ерлана Б.",
  "p-erland": "Ерлана Д.",
  "p-dinara": "Динары",
  "p-asel": "Асель",
  "p-baur": "Бауыржана",
  "p-oleg": "Олега",
  "p-irina": "Ирины",
  "p-gulnara": "Гульнары",
  "p-nurlan": "Нурлана",
  "s-zhanna": "Жанны",
};
export const genitive = (id: string): string => GENITIVE[id] ?? nameOf(id);

export const EMPLOYEES = PEOPLE.filter((p) => p.role === "employee");
export const SECRETARY_PERSON = PEOPLE.find((p) => p.role === "secretary")!;

export function isAway(id: string, now: Date): boolean {
  const p = personById(id);
  return Boolean(p?.awayUntil && new Date(p.awayUntil).getTime() > now.getTime());
}

// ---- words --------------------------------------------------------------------------------------

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** «40 мин», «1 ч 20 мин», «2 дн». */
export function span(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} мин`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} ч ${r} мин` : `${h} ч`;
  }
  return `${Math.floor(m / 1440)} дн`;
}

/** «сегодня 18:00», «завтра 12:00», «пт, 14 нояб 18:00» — the short form for fields. */
export function when(iso: string | null, now: Date): string {
  if (!iso) return "без срока";
  return `${dayLabel(iso, now)} ${hhmm(iso)}`;
}

/** «сегодня 18:00», «завтра 12:00», «сб 14.11, 18:00» — fits a narrow form field. */
export function whenShort(iso: string | null, now: Date): string {
  if (!iso) return "без срока";
  const d = dayLabel(iso, now);
  if (d === "сегодня" || d === "завтра") return `${d} ${hhmm(iso)}`;
  const w = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  const wd = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][w.getUTCDay()];
  return `${wd} ${String(w.getUTCDate()).padStart(2, "0")}.${String(w.getUTCMonth() + 1).padStart(2, "0")}, ${hhmm(iso)}`;
}

export const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// ---- the board ----------------------------------------------------------------------------------

/** The lanes that wait for the director's move on the task deck (the question lane goes to Messages). */
export const DECK_LANES: Lane[] = ["overdue", "declined", "review"];

export const LANE_WORD: Record<Lane, string> = {
  overdue: "Просрочка",
  declined: "Отказ",
  question: "Вопрос",
  review: "Приёмка",
  work: "В работе",
  held: "Утром",
};

export type MessageKind = "question" | "time" | "unread";

export function messageKind(t: Task): MessageKind | null {
  if (t.lane !== "question") return null;
  if (t.question) return "question";
  if (t.timeRequest) return "time";
  if (t.unread) return "unread";
  return null;
}

export type Board = {
  deck: Task[];
  messages: Task[];
  work: Task[];
  held: Task[];
  count: Record<"overdue" | "declined" | "review" | "messages", number>;
  questions: number;
  waiting: number;
  mood: Mood;
};

export function computeBoard(tasks: Task[]): Board {
  const deck = DECK_LANES.flatMap((lane) => tasks.filter((t) => t.lane === lane));
  const messages = tasks.filter((t) => messageKind(t) !== null);
  const work = tasks.filter((t) => t.lane === "work");
  const held = tasks.filter((t) => t.lane === "held");
  const count = {
    overdue: tasks.filter((t) => t.lane === "overdue").length,
    declined: tasks.filter((t) => t.lane === "declined").length,
    review: tasks.filter((t) => t.lane === "review").length,
    messages: messages.length,
  };
  const questions = messages.filter((t) => messageKind(t) !== "unread").length;
  const waiting = deck.length + messages.length;
  // never angry (D-70): watchful while something is late or refused, calm while moves wait, glad at zero
  const mood: Mood = count.overdue + count.declined > 0 ? "alert" : waiting > 0 ? "calm" : "happy";
  return { deck, messages, work, held, count, questions, waiting, mood };
}

export const MOOD_WORD: Record<Mood, string> = { alert: "Начеку", calm: "Спокойно", happy: "Хорошо" };

/** The greeting in words, built from the live counts. */
export function greeting(board: Board, now: Date, firstName: string): string {
  const h = Number(hhmm(now.toISOString()).slice(0, 2));
  const hello = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  if (board.waiting === 0) return `${hello}, ${firstName}. Решений не ждёт ничего — команда работает.`;
  const parts: string[] = [];
  const nums = ["", "одна", "две", "три", "четыре", "пять", "шесть"];
  if (board.count.review) parts.push(board.count.review === 1 ? "приёмка" : `${nums[board.count.review] ?? board.count.review} ${plural(board.count.review, ["приёмка", "приёмки", "приёмок"])}`);
  if (board.questions) parts.push(board.questions === 1 ? "вопрос" : `${["", "", "два", "три", "четыре"][board.questions] ?? board.questions} ${plural(board.questions, ["вопрос", "вопроса", "вопросов"])}`);
  if (board.count.declined) parts.push(board.count.declined === 1 ? "отказ" : `${board.count.declined} отказа`);
  if (board.count.overdue) parts.push(board.count.overdue === 1 ? "просрочка" : `${board.count.overdue} просрочки`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}` : (parts[0] ?? "");
  return `${hello}, ${firstName}. Ждут вас ${board.waiting}${list ? `: ${list}` : ""}.`;
}

// ---- receipts (principle 8) ---------------------------------------------------------------------

export type ReceiptStep = { word: string; at: string | null };

/** «Отправлено 08:05 · увидела 08:12 · приняла 08:20» as three steps; null = not yet. */
export function receiptSteps(t: Task): ReceiptStep[] {
  const id = t.assigneeId;
  return [
    { word: "Отправлено", at: t.receipt.sentAt },
    { word: g(id, "Увидел", "Увидела"), at: t.receipt.seenAt },
    { word: g(id, "Принял", "Приняла"), at: t.receipt.acceptedAt },
  ];
}

/** The one line a director reads: never «не получил». */
export function receiptLine(t: Task, now: Date): string {
  const id = t.assigneeId;
  if (t.status === "scheduled" || !t.receipt.sentAt) return "Уйдёт утром в 08:00 — пока никто не видит";
  if (!t.receipt.seenAt) return `${g(id, "Не открывал", "Не открывала")} с ${hhmm(t.receipt.sentAt)}`;
  if (!t.receipt.acceptedAt) return `${g(id, "Увидел", "Увидела")} в ${hhmm(t.receipt.seenAt)}, ещё не ${g(id, "принял", "приняла")}`;
  void now;
  return `${g(id, "Принял", "Приняла")} в ${hhmm(t.receipt.acceptedAt)}`;
}

// ---- the team sheet -----------------------------------------------------------------------------

export type Glyph = "solid" | "hatch" | "open" | "cross" | "dash";

export type TeamCell = {
  id: string;
  name: string;
  tasks: Task[];
  glyph: Glyph;
  /** what the cell says under the name */
  code: string;
  /** the director's move — lit in cyan on the board */
  move: boolean;
};

const LANE_RANK: Record<Lane, number> = { overdue: 0, declined: 1, question: 2, review: 3, work: 4, held: 5 };

function glyphOf(t: Task): Glyph {
  if (t.status === "scheduled") return "dash";
  if (t.status === "declined") return "cross";
  if (t.status === "pending_review") return "hatch";
  if (t.status === "sent") return "open";
  return "solid";
}

function codeOf(t: Task, now: Date): { code: string; move: boolean } {
  switch (t.lane) {
    case "overdue":
      return { code: "Просрочка", move: true };
    case "declined":
      return { code: "Отказ", move: true };
    case "review":
      return { code: t.report?.partial ? "Сдано не всё" : "Приёмка", move: true };
    case "question": {
      const k = messageKind(t);
      return { code: k === "time" ? "Перенос" : k === "unread" ? g(t.assigneeId, "Написал", "Написала") : "Вопрос", move: true };
    }
    case "held":
      return { code: "Утром в 08:00", move: false };
    default:
      if (t.status === "sent" && !t.receipt.seenAt) return { code: g(t.assigneeId, "Не открывал", "Не открывала"), move: false };
      if (t.status === "rework") return { code: "Доработка", move: false };
      return { code: t.deadline ? `до ${dayLabel(t.deadline, now) === "сегодня" ? hhmm(t.deadline) : dayLabel(t.deadline, now)}` : "в работе", move: false };
  }
}

export function teamSheet(tasks: Task[], now: Date) {
  const cells: TeamCell[] = [];
  const free: string[] = [];
  const away: string[] = [];
  for (const p of EMPLOYEES) {
    const mine = tasks.filter((t) => t.assigneeId === p.id).sort((a, b) => LANE_RANK[a.lane] - LANE_RANK[b.lane]);
    if (mine.length === 0) {
      if (isAway(p.id, now)) away.push(p.id);
      else free.push(p.id);
      continue;
    }
    const top = mine[0]!;
    const { code, move } = codeOf(top, now);
    cells.push({ id: p.id, name: p.short, tasks: mine, glyph: glyphOf(top), code, move });
  }
  // the director's moves first, then the calm ones — both in roster order
  cells.sort((a, b) => Number(b.move) - Number(a.move));
  return { cells, free, away };
}

// ---- the calendar -------------------------------------------------------------------------------

export function todayEvents(events: CalendarEvent[], now: Date) {
  return events.filter((e) => dayLabel(e.startsAt, now) === "сегодня").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function nextEvent(events: CalendarEvent[], now: Date) {
  return todayEvents(events, now).find((e) => new Date(e.startsAt).getTime() > now.getTime()) ?? null;
}

export const ANSWER_WORD = { yes: "Придёт", no: "Не придёт", none: "Не ответил" } as const;

// ---- drafts -------------------------------------------------------------------------------------

export function isSendable(d: Draft): boolean {
  return d.kind === "task" ? Boolean(d.assigneeId) : true;
}

export const KIND_WORD: Record<Draft["kind"], string> = {
  task: "Задача",
  announcement: "Объявление",
  points: "Очки",
  event: "Встреча",
  recurrence: "Повтор",
  note: "Заметка",
  reminder: "Напоминание",
};

/** «Понял так: 2 задачи, объявление, +5 очков, встреча, повтор.» from whatever the draft holds now. */
export function draftSummary(drafts: Draft[]): string {
  const n = (k: Draft["kind"]) => drafts.filter((d) => d.kind === k).length;
  const parts: string[] = [];
  const one = (k: Draft["kind"], forms: [string, string, string]) => {
    const c = n(k);
    if (c === 1) parts.push(forms[0]);
    else if (c > 1) parts.push(`${c} ${plural(c, forms)}`);
  };
  one("task", ["задача", "задачи", "задач"]);
  one("announcement", ["объявление", "объявления", "объявлений"]);
  const pts = drafts.reduce((s, d) => s + (d.kind === "points" ? d.amount : 0), 0);
  if (n("points")) parts.push(`${pts > 0 ? "+" : ""}${pts} ${plural(pts, ["очко", "очка", "очков"])}`);
  one("event", ["встреча", "встречи", "встреч"]);
  one("recurrence", ["повтор", "повтора", "повторов"]);
  one("note", ["заметка", "заметки", "заметок"]);
  one("reminder", ["напоминание", "напоминания", "напоминаний"]);
  return parts.length ? `Понял так: ${parts.join(", ")}.` : "В черновике пусто.";
}

/** «Марату, Айгуль; объявление в Эфир; +5 Ерлану Б.» — what the seal says landed. */
export function sentSummary(drafts: Draft[]): string {
  const names = [
    ...new Set(
      drafts.flatMap((d) => (d.kind === "task" && d.assigneeId ? [d.assigneeId] : d.kind === "recurrence" ? [d.assigneeId] : [])),
    ),
  ].map(dative);
  const parts: string[] = [];
  if (names.length) parts.push(names.join(", "));
  if (drafts.some((d) => d.kind === "announcement")) parts.push("объявление в Эфир");
  for (const d of drafts) if (d.kind === "points") parts.push(`+${d.amount} ${dative(d.personId)}`);
  if (drafts.some((d) => d.kind === "event")) parts.push("встреча в календарь");
  if (drafts.some((d) => d.kind === "note" || d.kind === "reminder")) parts.push("в Заметки");
  return parts.join(" · ");
}

// ---- the prototype's «parser» -------------------------------------------------------------------

/** What a pinned person would plausibly be told — by their position. */
const PINNED_TASK: Record<string, string> = {
  Прораб: "Проверить леса на объекте на Абая",
  Бухгалтер: "Подготовить платёжки на завтра",
  Снабжение: "Запросить цены на арматуру у трёх поставщиков",
  Водитель: "Отвезти документы в банк до обеда",
  Юрист: "Проверить договор с подрядчиком",
  Маркетинг: "Собрать отзывы клиентов за октябрь",
  Склад: "Принять поставку цемента",
  IT: "Починить принтер в приёмной",
  HR: "Назначить собеседования на четверг",
  Кадры: "Подготовить приказы на отпуск",
};

export function pinnedDraft(personId: string, voiceSec: number): Draft[] {
  const p = personById(personId);
  return [
    {
      id: `pin-${personId}`,
      kind: "task",
      title: PINNED_TASK[p?.position ?? ""] ?? "Зайти ко мне после обеда",
      assigneeId: personId,
      deadline: at(0, 18, 0),
      voiceSec,
    },
  ];
}

export const ETHER_DRAFT: Draft[] = [{ id: "eth", kind: "announcement", text: "Завтрашняя планёрка переносится на 10:00", audience: "Всем", reach: 18 }];

export type Parsed =
  | { kind: "drafts"; drafts: Draft[]; heard: string }
  | { kind: "unparsed"; heard: string }
  | { kind: "answer"; said: string; lines: string[]; taskIds: string[] };

function findPeople(text: string): string[] {
  const low = text.toLowerCase();
  return EMPLOYEES.filter((p) => low.includes(p.fullName.split(" ")[0]!.toLowerCase().slice(0, 4))).map((p) => p.id);
}

/** A deterministic answer from the board itself (D-51): what a person carries right now. */
export function answerAbout(personId: string, tasks: Task[], now: Date): { lines: string[]; taskIds: string[] } {
  const mine = tasks.filter((t) => t.assigneeId === personId).sort((a, b) => LANE_RANK[a.lane] - LANE_RANK[b.lane]);
  if (personId === "p-marat" && mine.some((t) => t.id === "t-estimate") && mine.some((t) => t.id === "t-pass")) {
    return { lines: [...QUERY.lines], taskIds: ["", "t-estimate", "t-pass"] };
  }
  if (mine.length === 0) return { lines: [`У ${genitive(personId)} сейчас нет задач.`], taskIds: [""] };
  const head = `У ${genitive(personId)} ${mine.length} ${plural(mine.length, ["задача", "задачи", "задач"])}.`;
  const lines = mine.map((t) => {
    const k = messageKind(t);
    if (t.lane === "overdue") return `«${t.title}» — срок прошёл ${span(minutesAgo(t.deadline!, now))} назад.`;
    if (t.lane === "declined") return `«${t.title}» — отказ: «${t.decline?.reason}».`;
    if (t.lane === "review") return `«${t.title}» — ${g(personId, "сдал", "сдала")}, ждёт приёмки.`;
    if (k === "question") return `«${t.title}» — ждёт вашего ответа: «${t.question?.text}»`;
    if (k === "time") return `«${t.title}» — просит перенести на ${whenLabel(t.timeRequest!.proposed, now)}.`;
    if (k === "unread") return `«${t.title}» — ${g(personId, "написал", "написала")}: «${t.unread?.text}».`;
    if (t.lane === "held") return `«${t.title}» — уйдёт утром в 08:00.`;
    return `«${t.title}» — ${receiptLine(t, now).toLowerCase()}, срок ${t.deadline ? whenLabel(t.deadline, now) : "не задан"}.`;
  });
  return { lines: [head, ...lines], taskIds: ["", ...mine.map((t) => t.id)] };
}

export function parseText(raw: string, pinnedId: string | null, tasks: Task[], now: Date): Parsed {
  const text = raw.trim().replace(/\s+/g, " ");
  const low = text.toLowerCase();
  const who = findPeople(text);
  if (/^(что|как|где|кто|сколько|какие)\b/.test(low) || low.endsWith("?")) {
    const id = who[0] ?? pinnedId;
    if (id) return { kind: "answer", said: capital(text), ...answerAbout(id, tasks, now) };
    return { kind: "unparsed", heard: text };
  }
  if (text.length < 6 || /^(ну|короче|это самое|эээ|так)\b/.test(low)) return { kind: "unparsed", heard: text || UNPARSED.heard };
  if (low.startsWith("всем")) {
    const body = capital(text.replace(/^всем[:,]?\s*/i, ""));
    return { kind: "drafts", heard: text, drafts: [{ id: `a-${Date.now()}`, kind: "announcement", text: body, audience: "Всем", reach: 18 }] };
  }
  if (low.includes("напомни")) {
    return { kind: "drafts", heard: text, drafts: [{ id: `r-${Date.now()}`, kind: "reminder", text: capital(text.replace(/^напомни( мне)?[:,]?\s*/i, "")), at: at(0, 15, 0) }] };
  }
  if (low.includes("заметк") || low.startsWith("подумать")) {
    return { kind: "drafts", heard: text, drafts: [{ id: `n-${Date.now()}`, kind: "note", text: capital(text.replace(/^заметка[:,]?\s*/i, "")) }] };
  }
  const assignee = pinnedId ?? (who.length === 1 ? who[0]! : null);
  const title = capital(text.replace(/^[А-ЯЁа-яё]+(у|е|ю)?[,:]\s*/u, ""));
  return {
    kind: "drafts",
    heard: text,
    drafts: [
      {
        id: `t-${Date.now()}`,
        kind: "task",
        title,
        assigneeId: assignee,
        candidates: assignee ? undefined : who.length > 1 ? who : ["p-aigul", "p-marat"],
        heardName: assignee ? undefined : who.length > 1 ? "Ерлан" : undefined,
        deadline: at(0, 18, 0),
      },
    ],
  };
}

export const INITIAL_DRAFT: Draft[] = DRAFT.map((d) => ({ ...d }));

export function eventPeople(e: CalendarEvent) {
  return e.people.map((p) => ({ ...p, name: nameOf(p.id) }));
}

export const TOMORROW_EVENTS = (now: Date) => EVENTS.filter((e) => dayLabel(e.startsAt, now) === "завтра");
