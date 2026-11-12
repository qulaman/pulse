/**
 * Shared fixtures for the Pulse redesign contest (/dev/pulse-alt/*). Every contestant draws
 * the SAME director's morning from this file, so the three screens can be compared state by
 * state. Pure data and tiny formatters — no React, no Supabase, no app hooks.
 *
 * Clock: the screen lives at NOW = today 10:40 Asia/Aqtobe (UTC+5, no DST); OFFHOURS_NOW is
 * today 21:30, outside the 08:00–21:00 delivery window (D-38).
 */

// ---- time ------------------------------------------------------------------------------------

const AQTOBE_MS = 5 * 3_600_000;

/** Aqtobe wall time `dayShift` days from today, as an ISO string. */
export function at(dayShift: number, hh: number, mm = 0): string {
  const wall = new Date(Date.now() + AQTOBE_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + dayShift, hh - 5, mm)).toISOString();
}

/** The next given weekday (0 = Sunday … 6 = Saturday) after today, Aqtobe wall time — «к пятнице», «в понедельник». */
export function nextWeekday(dow: number, hh: number, mm = 0): string {
  const today = new Date(Date.now() + AQTOBE_MS).getUTCDay();
  return at(((dow - today + 6) % 7) + 1, hh, mm);
}

export const NOW = new Date(at(0, 10, 40));
export const OFFHOURS_NOW = new Date(at(0, 21, 30));
export const DELIVERY_WINDOW = { from: "08:00", to: "21:00" };

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "февр", "марта", "апр", "мая", "июня", "июля", "авг", "сент", "окт", "нояб", "дек"];

function wallOf(iso: string): Date {
  return new Date(new Date(iso).getTime() + AQTOBE_MS);
}

/** «10:05» in Aqtobe. */
export function hhmm(iso: string): string {
  const w = wallOf(iso);
  return `${String(w.getUTCHours()).padStart(2, "0")}:${String(w.getUTCMinutes()).padStart(2, "0")}`;
}

/** «сегодня» / «завтра» / «вчера» / «пт, 14 нояб» relative to `now`. */
export function dayLabel(iso: string, now: Date = NOW): string {
  const a = wallOf(iso);
  const b = new Date(now.getTime() + AQTOBE_MS);
  const days = Math.round(
    (Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / 86_400_000,
  );
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  return `${WEEKDAYS[a.getUTCDay()]}, ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
}

/** «сегодня в 18:00», «завтра в 12:00», «пт, 14 нояб в 18:00». */
export function whenLabel(iso: string, now: Date = NOW): string {
  return `${dayLabel(iso, now)} в ${hhmm(iso)}`;
}

/** Whole minutes from `iso` to `now` (positive = in the past). */
export function minutesAgo(iso: string, now: Date = NOW): number {
  return Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
}

// ---- company & people ------------------------------------------------------------------------

/** The client's brand lives in its settings; the UI never names a client otherwise. */
export const COMPANY = { name: "Демо", initials: "Д", pointsEnabled: true, teamSize: 18 };

export const DIRECTOR = { id: "dir", fullName: "Тимур Сапаров", firstName: "Тимур" };

export type Role = "employee" | "secretary";

export type Person = {
  id: string;
  fullName: string;
  /** what the screen calls them — first name, plus the surname's initial for namesakes (D-146) */
  short: string;
  initials: string;
  role: Role;
  position: string;
  /** away (vacation, sick leave) until this moment */
  awayUntil?: string;
  awayWhy?: string;
};

export const PEOPLE: Person[] = [
  { id: "p-marat", fullName: "Марат Ахметов", short: "Марат", initials: "МА", role: "employee", position: "Прораб" },
  { id: "p-aigul", fullName: "Айгуль Нурланова", short: "Айгуль", initials: "АН", role: "employee", position: "Бухгалтер" },
  { id: "p-erlanb", fullName: "Ерлан Беков", short: "Ерлан Б.", initials: "ЕБ", role: "employee", position: "Снабжение" },
  { id: "p-erland", fullName: "Ерлан Досов", short: "Ерлан Д.", initials: "ЕД", role: "employee", position: "Водитель" },
  { id: "p-dinara", fullName: "Динара Касымова", short: "Динара", initials: "ДК", role: "employee", position: "Юрист" },
  { id: "p-asel", fullName: "Асель Жумабаева", short: "Асель", initials: "АЖ", role: "employee", position: "Маркетинг" },
  { id: "p-baur", fullName: "Бауыржан Оспанов", short: "Бауыржан", initials: "БО", role: "employee", position: "Склад" },
  { id: "p-oleg", fullName: "Олег Ким", short: "Олег", initials: "ОК", role: "employee", position: "IT" },
  { id: "p-irina", fullName: "Ирина Лебедева", short: "Ирина", initials: "ИЛ", role: "employee", position: "HR" },
  { id: "p-gulnara", fullName: "Гульнара Сейтова", short: "Гульнара", initials: "ГС", role: "employee", position: "Кадры" },
  { id: "p-nurlan", fullName: "Нурлан Абенов", short: "Нурлан", initials: "НА", role: "employee", position: "Прораб", awayUntil: at(8, 9), awayWhy: "в отпуске" },
  { id: "s-zhanna", fullName: "Жанна Исаева", short: "Жанна", initials: "ЖИ", role: "secretary", position: "Секретарь" },
];

export const personById = (id: string | null | undefined): Person | undefined => PEOPLE.find((p) => p.id === id);

// ---- tasks ------------------------------------------------------------------------------------

/** `scheduled → sent → accepted → pending_review → done | rework | declined | revoked` (CLAUDE.md). */
export type TaskStatus = "scheduled" | "sent" | "accepted" | "pending_review" | "rework" | "declined";

/**
 * Where a task stands on the director's board (lib/pulse/board.ts): the first four lanes wait
 * for him, «work» is the calm rest; `held` = scheduled for the morning (no lane of its own).
 */
export type Lane = "overdue" | "declined" | "question" | "review" | "work" | "held";

export type Message = {
  id: string;
  from: "director" | "employee" | "system";
  text: string;
  at: string;
  /** a voice message — the director's original voice is always kept (principle 5) */
  voiceSec?: number;
};

export type Task = {
  id: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
  lane: Lane;
  deadline: string | null;
  createdAt: string;
  /** delivery receipt (principle 8): sent → seen → accepted */
  receipt: { sentAt: string | null; seenAt: string | null; acceptedAt: string | null };
  /** the director's own voice behind the task, seconds */
  voiceSec?: number;
  /** the employee's open question — answered with one tap (lib/tasks/answers.ts) */
  question?: { text: string; at: string; kind: "yesno" | "urgent" | "when" | "open" };
  /** the employee asks for another deadline: «Согласовать / Другой срок / Оставить прежний» */
  timeRequest?: { proposed: string; why: string; at: string };
  /** «Не могу» with its reason; the director answers «Настоять / Переназначить / Отменить» */
  decline?: { reason: string; at: string; suggestion?: string };
  /** handed in for приёмка; `partial` = «сделано не всё» (D-128) */
  report?: { text: string; at: string; partial?: boolean; photos?: number };
  /** new words from the employee the director has not read */
  unread?: { text: string; at: string };
  thread: Message[];
};

export const TASKS: Task[] = [
  {
    id: "t-act",
    title: "Сдать акт сверки с «Темир-Сервис»",
    assigneeId: "p-aigul",
    status: "accepted",
    lane: "overdue",
    deadline: at(0, 10, 0),
    createdAt: at(-1, 17, 40),
    receipt: { sentAt: at(0, 8, 5), seenAt: at(0, 8, 12), acceptedAt: at(0, 8, 20) },
    voiceSec: 9,
    thread: [
      { id: "m1", from: "director", text: "Айгуль, акт сверки с Темир-Сервисом нужен сегодня к десяти.", at: at(-1, 17, 40), voiceSec: 9 },
      { id: "m2", from: "system", text: "Айгуль приняла задачу", at: at(0, 8, 20) },
    ],
  },
  {
    id: "t-docs",
    title: "Забрать документы из акимата",
    assigneeId: "p-erland",
    status: "declined",
    lane: "declined",
    deadline: at(0, 15, 0),
    createdAt: at(0, 9, 20),
    receipt: { sentAt: at(0, 9, 20), seenAt: at(0, 9, 31), acceptedAt: null },
    decline: { reason: "Машина в ремонте до среды", at: at(0, 9, 50), suggestion: "Может, Ерлан Б. на своей?" },
    thread: [
      { id: "m1", from: "director", text: "Ерлан, забери документы из акимата до трёх.", at: at(0, 9, 20), voiceSec: 5 },
      { id: "m2", from: "employee", text: "Не могу: машина в ремонте до среды. Может, Ерлан Б. на своей?", at: at(0, 9, 50) },
    ],
  },
  {
    id: "t-estimate",
    title: "Подготовить смету по складу №2",
    assigneeId: "p-marat",
    status: "accepted",
    lane: "question",
    deadline: at(1, 18, 0),
    createdAt: at(0, 9, 2),
    receipt: { sentAt: at(0, 9, 2), seenAt: at(0, 9, 4), acceptedAt: at(0, 9, 6) },
    voiceSec: 14,
    question: { text: "Сделать сегодня до обеда?", at: at(0, 10, 31), kind: "yesno" },
    thread: [
      { id: "m1", from: "director", text: "Марат, подготовь смету по складу номер два, с материалами и работой, до завтра.", at: at(0, 9, 2), voiceSec: 14 },
      { id: "m2", from: "system", text: "Марат принял задачу", at: at(0, 9, 6) },
      { id: "m3", from: "employee", text: "Сделать сегодня до обеда?", at: at(0, 10, 31) },
    ],
  },
  {
    id: "t-lease",
    title: "Обновить договор аренды склада",
    assigneeId: "p-dinara",
    status: "accepted",
    lane: "question",
    deadline: at(2, 18, 0),
    createdAt: at(-1, 15, 0),
    receipt: { sentAt: at(-1, 15, 0), seenAt: at(-1, 15, 3), acceptedAt: at(-1, 15, 10) },
    question: { text: "Какой срок аренды ставить — год или три?", at: at(0, 10, 12), kind: "open" },
    thread: [
      { id: "m1", from: "director", text: "Динара, обнови договор аренды склада, условия те же.", at: at(-1, 15, 0) },
      { id: "m2", from: "employee", text: "Какой срок аренды ставить — год или три?", at: at(0, 10, 12) },
    ],
  },
  {
    id: "t-sales",
    title: "Отчёт по продажам за октябрь",
    assigneeId: "p-asel",
    status: "accepted",
    lane: "question",
    deadline: at(0, 18, 0),
    createdAt: at(-2, 11, 0),
    receipt: { sentAt: at(-2, 11, 0), seenAt: at(-2, 11, 20), acceptedAt: at(-2, 11, 21) },
    timeRequest: { proposed: at(1, 12, 0), why: "Жду цифры от Айгуль, к вечеру не успеваю", at: at(0, 10, 18) },
    thread: [
      { id: "m1", from: "director", text: "Асель, отчёт по продажам за октябрь к четвергу.", at: at(-2, 11, 0) },
      { id: "m2", from: "employee", text: "Прошу перенести на завтра 12:00 — жду цифры от Айгуль, к вечеру не успеваю.", at: at(0, 10, 18) },
    ],
  },
  {
    id: "t-pass",
    title: "Пропуска для проверяющих",
    assigneeId: "p-marat",
    status: "accepted",
    lane: "question",
    deadline: at(0, 13, 0),
    createdAt: at(0, 8, 30),
    receipt: { sentAt: at(0, 8, 30), seenAt: at(0, 8, 31), acceptedAt: at(0, 8, 33) },
    unread: { text: "Пропуска готовы, лежат у Жанны", at: at(0, 10, 36) },
    thread: [
      { id: "m1", from: "director", text: "Марат, оформи пропуска на троих проверяющих к часу.", at: at(0, 8, 30), voiceSec: 6 },
      { id: "m2", from: "employee", text: "Пропуска готовы, лежат у Жанны", at: at(0, 10, 36) },
    ],
  },
  {
    id: "t-cement",
    title: "Заказать 40 мешков цемента",
    assigneeId: "p-erlanb",
    status: "pending_review",
    lane: "review",
    deadline: at(0, 12, 0),
    createdAt: at(0, 8, 40),
    receipt: { sentAt: at(0, 8, 40), seenAt: at(0, 8, 41), acceptedAt: at(0, 8, 42) },
    report: { text: "Заказал, привезут завтра к 9:00. Счёт во вложении.", at: at(0, 10, 25), photos: 1 },
    thread: [
      { id: "m1", from: "director", text: "Ерлан Б., закажи сорок мешков цемента на объект.", at: at(0, 8, 40), voiceSec: 4 },
      { id: "m2", from: "employee", text: "Заказал, привезут завтра к 9:00. Счёт во вложении.", at: at(0, 10, 25) },
    ],
  },
  {
    id: "t-stock",
    title: "Инвентаризация склада",
    assigneeId: "p-baur",
    status: "pending_review",
    lane: "review",
    deadline: at(0, 10, 30),
    createdAt: at(-3, 9, 0),
    receipt: { sentAt: at(-3, 9, 0), seenAt: at(-3, 9, 15), acceptedAt: at(-3, 9, 16) },
    report: { text: "Стеллажи A и B посчитаны, C и D — завтра.", at: at(0, 10, 9), partial: true, photos: 3 },
    thread: [
      { id: "m1", from: "director", text: "Бауыржан, проведи инвентаризацию склада.", at: at(-3, 9, 0) },
      { id: "m2", from: "employee", text: "Сделано не всё: стеллажи A и B посчитаны, C и D — завтра.", at: at(0, 10, 9) },
    ],
  },
  {
    id: "t-vpn",
    title: "Настроить VPN для бухгалтерии",
    assigneeId: "p-oleg",
    status: "accepted",
    lane: "work",
    deadline: at(0, 17, 0),
    createdAt: at(0, 9, 10),
    receipt: { sentAt: at(0, 9, 10), seenAt: at(0, 9, 12), acceptedAt: at(0, 9, 13) },
    thread: [],
  },
  {
    id: "t-cv",
    title: "Собрать резюме на позицию кладовщика",
    assigneeId: "p-irina",
    status: "sent",
    lane: "work",
    deadline: at(1, 18, 0),
    createdAt: at(0, 10, 5),
    // sent, never opened: the director is told «не открывал с 10:05», not «не получил»
    receipt: { sentAt: at(0, 10, 5), seenAt: null, acceptedAt: null },
    thread: [],
  },
  {
    id: "t-banner",
    title: "Переделать баннер для выставки",
    assigneeId: "p-asel",
    status: "rework",
    lane: "work",
    deadline: at(3, 18, 0),
    createdAt: at(-1, 12, 0),
    receipt: { sentAt: at(-1, 12, 0), seenAt: at(-1, 12, 2), acceptedAt: at(-1, 12, 3) },
    thread: [{ id: "m1", from: "director", text: "Логотип крупнее, телефон убрать.", at: at(0, 9, 40) }],
  },
  {
    id: "t-samples",
    title: "Отвезти образцы плитки на выставку",
    assigneeId: "p-erlanb",
    status: "accepted",
    lane: "work",
    deadline: at(2, 11, 0),
    createdAt: at(0, 8, 50),
    receipt: { sentAt: at(0, 8, 50), seenAt: at(0, 8, 51), acceptedAt: at(0, 8, 53) },
    thread: [],
  },
  {
    id: "t-bank",
    title: "Позвонить в банк по кредитной линии",
    assigneeId: "p-aigul",
    status: "scheduled",
    lane: "held",
    deadline: at(1, 12, 0),
    createdAt: at(-1, 22, 10),
    // said late last night: goes out at 08:00 tomorrow, nobody sees it yet (D-38, D-139)
    receipt: { sentAt: null, seenAt: null, acceptedAt: null },
    thread: [],
  },
];

/**
 * The director's keys per lane (lib/tasks/desk.ts KEY_LABEL). The first one is what a swipe up
 * / the main tap does; «Все действия» (long press or «⋯») lists every move the task allows.
 * «Принять», «Настоять», «Отозвать», «Удалить» wait 5 s for «Отменить» (D-139).
 */
export const LANE_KEYS: Record<Lane, string[]> = {
  overdue: ["Срок", "Напомнить", "Отозвать"],
  declined: ["Настоять", "Переназначить", "Отменить"],
  question: ["Ответить"],
  review: ["Принять", "Доработать"],
  work: ["Напомнить", "Срок", "Передать"],
  held: ["Отправить сейчас", "Удалить"],
};
export const TIME_REQUEST_KEYS = ["Согласовать", "Другой срок", "Оставить прежний"];
export const ALL_ACTIONS = ["Открыть", "Ответить", "Срок", "Напомнить", "Передать", "Отозвать", "Удалить", "Выдать снова"];
export const UNDOABLE = new Set(["Принять", "Настоять", "Отозвать", "Удалить"]);

/** One-tap answers to a question by its kind (lib/tasks/answers.ts). */
export const QUICK_ANSWERS: Record<"yesno" | "urgent" | "when" | "open", string[]> = {
  yesno: ["Да", "Нет", "Позже", "Действуй сам"],
  urgent: ["Срочно", "Не срочно", "Действуй сам"],
  when: ["Как в задаче", "Сегодня 18:00", "Завтра 12:00"],
  open: ["Ответить словами", "Действуй сам", "Позже отвечу"],
};

/** Reactions to a closed task, only while points are on (D-133). */
export const REACTIONS = ["👍", "🔥", "Спасибо ♥"];

// ---- the rest of the board --------------------------------------------------------------------

export type EtherPost = { id: string; text: string; at: string; read: number; of: number; voiceSec?: number; reactions?: { emoji: string; count: number }[] };

export const ETHER: EtherPost[] = [
  { id: "e1", text: "Завтра в 9:00 общая планёрка в переговорной. Быть всем.", at: at(0, 8, 30), read: 14, of: 18, voiceSec: 7, reactions: [{ emoji: "👍", count: 9 }] },
  { id: "e2", text: "Поздравляем Динару с днём рождения! 🎉", at: at(-1, 9, 0), read: 18, of: 18, reactions: [{ emoji: "🎉", count: 15 }, { emoji: "❤️", count: 6 }] },
  { id: "e3", text: "С понедельника парковка у главного входа закрыта на ремонт. Ставим машины во дворе.", at: at(-2, 16, 20), read: 11, of: 18 },
];

export type EventAnswer = "yes" | "no" | "none";

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  place: string;
  people: { id: string; answer: EventAnswer }[];
  /** reminder the tick has written */
  remindMin?: number;
};

export const EVENTS: CalendarEvent[] = [
  {
    id: "ev1",
    title: "Планёрка с прорабами",
    startsAt: at(0, 11, 0),
    endsAt: at(0, 11, 30),
    place: "Переговорная",
    remindMin: 15,
    people: [
      { id: "p-marat", answer: "yes" },
      { id: "p-nurlan", answer: "no" },
      { id: "p-baur", answer: "yes" },
      { id: "p-erlanb", answer: "none" },
    ],
  },
  { id: "ev2", title: "Встреча в банке по кредитной линии", startsAt: at(0, 14, 0), endsAt: at(0, 15, 0), place: "Отделение на Абая", people: [{ id: "p-aigul", answer: "yes" }] },
  { id: "ev3", title: "Звонок поставщику цемента", startsAt: at(0, 16, 30), endsAt: at(0, 16, 45), place: "Телефон", people: [{ id: "p-erlanb", answer: "yes" }] },
  { id: "ev4", title: "Общая планёрка", startsAt: at(1, 9, 0), endsAt: at(1, 9, 30), place: "Переговорная", people: PEOPLE.filter((p) => p.role === "employee").map((p) => ({ id: p.id, answer: "none" as EventAnswer })) },
];

export type RatingRow = { personId: string; points: number; place: number; delta: number };

/** The week's rating — only while points are on (D-48, D-133). */
export const RATING: RatingRow[] = [
  { personId: "p-erlanb", points: 48, place: 1, delta: 1 },
  { personId: "p-aigul", points: 41, place: 2, delta: -1 },
  { personId: "p-marat", points: 37, place: 3, delta: 0 },
  { personId: "p-oleg", points: 30, place: 4, delta: 2 },
  { personId: "p-dinara", points: 26, place: 5, delta: 0 },
];

/** A disputed minus waits for the director (the rating ball counts only these). */
export const DISPUTES = [
  { id: "d1", personId: "p-asel", amount: -10, reason: "Отчёт не сдан в срок", plea: "Сдала в 18:05 — пропал интернет, скрин в чате", at: at(0, 9, 15), keys: ["Снять штраф", "Оставить"] },
];

// ---- the secretary's desk (D-85, D-97, D-99) --------------------------------------------------

export type SecretaryAction = { code: string; label: string; icon: string };

/** The catalogue (lib/settings.ts DEFAULT_SECRETARY_ACTIONS): hold 2 s — sends; a short tap — a note and a time. */
export const SECRETARY_ACTIONS: SecretaryAction[] = [
  { code: "coffee", label: "Кофе", icon: "☕" },
  { code: "tea", label: "Чай", icon: "🍵" },
  { code: "dnd", label: "Не беспокоить", icon: "🔕" },
  { code: "guest", label: "Пригласи гостя", icon: "🤝" },
  { code: "security", label: "Охрана", icon: "🚨" },
  { code: "doctor", label: "Врач", icon: "🩺" },
  { code: "come", label: "Зайди ко мне", icon: "🚪" },
];

export type ErrandStatus = "waiting" | "asked" | "seen" | "doing" | "done";

export type Errand = { id: string; code: string; label: string; note?: string; status: ErrandStatus; at: string; etaMin?: number; by?: string };

export const SECRETARY = {
  personId: "s-zhanna",
  /** null = at the desk; an ISO = everybody away until then — an empty chair and «до 14:00» */
  awayUntil: null as string | null,
  errands: [
    { id: "er1", code: "coffee", label: "Кофе", status: "doing", at: at(0, 10, 33), etaMin: 3, by: "s-zhanna" },
    { id: "er2", code: "come", label: "Зайди ко мне", note: "Олег", status: "seen", at: at(0, 10, 38), by: "s-zhanna" },
  ] as Errand[],
};

/** The director is in a meeting: «Не беспокоить до 12:00?» is offered once (D-99). */
export const MEETING_NOW = { id: "mt", title: "Совещание с инвестором", endsAt: at(0, 12, 0) };

/** «К вам посетитель» (D-96): «Пусть заходит» (+ чай/кофе гостю) / «Подождёт» / «Не приму». */
export const VISITOR = { id: "v1", name: "Сергей Ли", from: "«КазСтройСнаб»", about: "по поставке арматуры", since: at(0, 10, 34), hospitality: ["Чай", "Кофе"] };

/** The secretary's words for the director (D-116): «Понятно» clears them. */
export const SECRETARY_MESSAGE = { id: "sm1", text: "Звонили из налоговой, просили перезвонить до 16:00. Номер у меня.", at: at(0, 10, 29) };

// ---- what the assistant says ------------------------------------------------------------------

/** The board's barometer (lib/pulse/mood.ts): never angry — watchful, calm or glad (D-68, D-70). */
export type Mood = "alert" | "calm" | "happy";
export const MOOD: Mood = "alert";

/** The summary on waking (speech under the face) and the nearest meeting. */
export const GREETING = [
  "Доброе утро, Тимур. Ждут вас 8: две приёмки, три вопроса, отказ и просрочка.",
  "Планёрка с прорабами в 11:00 — через 20 минут.",
];

/** News as a thought over the head (D-65): a tap on a task's thought opens its thread. */
export const NEWS: { id: string; text: string; tone: "ok" | "warn" | "info"; taskId?: string }[] = [
  { id: "n1", text: "Ерлан Б. сдал «Заказать 40 мешков цемента»", tone: "ok", taskId: "t-cement" },
  { id: "n2", text: "Марат спрашивает: «Сделать сегодня до обеда?»", tone: "warn", taskId: "t-estimate" },
  { id: "n3", text: "Объявление о планёрке прочитали 14 из 18", tone: "info" },
  { id: "n4", text: "Жанна несёт кофе · 3 мин", tone: "info" },
];

// ---- a phrase in hand: the voice pipeline and the confirmation (D-60) -------------------------

/** What the face plays while a phrase travels (lib/voice/stages.ts). */
export const STAGES = [
  { id: "recording", label: "Слушаю" },
  { id: "uploading", label: "Сохраняю запись" },
  { id: "transcribing", label: "Распознаю" },
  { id: "parsing", label: "Разбираю" },
] as const;

export const HEARD =
  "Марату к пятнице подготовить график работ по объекту на Абая. Айгерим оплатить счёт за цемент сегодня. Всем: в пятницу короткий день до шестнадцати. Плюс пять очков Ерлану за быстрый заказ. Планёрку в понедельник в десять со всеми прорабами. И каждый понедельник Олегу проверять резервные копии.";

export type Draft =
  | { id: string; kind: "task"; title: string; assigneeId: string | null; candidates?: string[]; heardName?: string; deadline: string | null; voiceSec?: number; repeat?: string }
  | { id: string; kind: "announcement"; text: string; audience: string; reach: number }
  | { id: string; kind: "points"; personId: string; amount: number; reason: string }
  | { id: string; kind: "event"; title: string; startsAt: string; place: string | null; peopleIds: string[] }
  | { id: string; kind: "recurrence"; title: string; assigneeId: string; rule: string; firstAt: string }
  | { id: string; kind: "note"; text: string }
  | { id: string; kind: "reminder"; text: string; at: string };

/** «Понял так: 2 задачи, объявление, +5 очков, встреча, повтор». The second task has no assignee yet: «Кому?». */
export const DRAFT: Draft[] = [
  { id: "d1", kind: "task", title: "Подготовить график работ по объекту на Абая", assigneeId: "p-marat", deadline: nextWeekday(5, 18, 0), voiceSec: 6 },
  { id: "d2", kind: "task", title: "Оплатить счёт за цемент", assigneeId: null, heardName: "Айгерим", candidates: ["p-aigul", "p-irina"], deadline: at(0, 18, 0), voiceSec: 4 },
  { id: "d3", kind: "announcement", text: "В пятницу короткий день — до 16:00", audience: "Всем", reach: 18 },
  { id: "d4", kind: "points", personId: "p-erlanb", amount: 5, reason: "за быстрый заказ цемента" },
  { id: "d5", kind: "event", title: "Планёрка с прорабами", startsAt: nextWeekday(1, 10, 0), place: "Переговорная", peopleIds: ["p-marat", "p-nurlan", "p-baur"] },
  { id: "d6", kind: "recurrence", title: "Проверять резервные копии", assigneeId: "p-oleg", rule: "каждый понедельник в 9:00", firstAt: nextWeekday(1, 9, 0) },
];
export const DRAFT_SUMMARY = "Понял так: 2 задачи, объявление, +5 очков, встреча, повтор.";
/** On every draft card: tap the text — edit; «Кому?» — the people picker (candidates on top); the deadline; the repeat; «×». */
export const DRAFT_EDITS = ["Правка текста", "Кому?", "Срок", "Повтор", "Убрать"];

/** Other kinds the parser knows — a draft may hold them too. */
export const DRAFT_EXTRA: Draft[] = [
  { id: "x1", kind: "note", text: "Подумать о втором складе в Хромтау" },
  { id: "x2", kind: "reminder", text: "Позвонить Серику насчёт техники", at: at(0, 15, 0) },
];

/** Nothing parsed: «Исправить текст / Сделать задачей / Закрыть». */
export const UNPARSED = { heard: "Ну это самое… короче, потом скажу", line: "Не разобрал: не нашёл здесь ни задачи, ни объявления." };

/** A question about the board gets an answer from the board itself (D-51), no new task. */
export const QUERY = {
  said: "Что сейчас у Марата?",
  lines: [
    "У Марата две задачи.",
    "«Смета по складу №2» — ждёт вашего ответа: «Сделать сегодня до обеда?»",
    "«Пропуска для проверяющих» — написал: «Пропуска готовы, лежат у Жанны».",
  ],
};

/** Ways a phrase fails (lib/voice/stages.ts ERROR_ACT) — the voice is never lost (principle 5). */
export const ERRORS = {
  tooShort: "Слишком коротко. Удержи и скажи ещё раз.",
  noMic: "Нет доступа к микрофону. Разреши его в настройках браузера.",
  stt: "Не расслышал. Запись сохранена — попробую ещё раз сам.",
  kept: "Нет связи. Фраза осталась на телефоне и уйдёт сама, когда появится сеть.",
};

// ---- service lines, only after a tap (D-139) --------------------------------------------------

export const SERVICE = {
  push: { text: "Уведомления выключены — не узнаете, когда сдадут задачу.", action: "Включить" },
  install: { text: "Поставьте Pulse на экран «Домой» — так работают уведомления.", action: "Как?" },
  draft: { text: "Черновик: 2 сущности, не отправлен.", action: "Открыть ›" },
  noTeam: { text: "В команде пока никого. Добавь первого сотрудника.", action: "Добавить ›" },
  keptPhrase: { text: "1 фраза ждёт сети", action: "Показать" },
};

/** The director's tab bar; the badge on «Пульс» = everything that waits for his move. */
export const TABS = [
  { id: "pulse", label: "Пульс", badge: 8 },
  { id: "sent", label: "Задачи" },
  { id: "calendar", label: "Календарь" },
  { id: "notes", label: "Заметки" },
  { id: "screen", label: "Экран" },
  { id: "profile", label: "Профиль" },
];

// ---- states every contestant draws (?state=<id>) ----------------------------------------------

export const STATES = [
  { id: "idle", title: "Покой: лицо, команда кружками, секретарь" },
  { id: "awake", title: "Проснулся: сводка и разделы" },
  { id: "news", title: "Новость мыслью над головой" },
  { id: "recording", title: "Запись голоса" },
  { id: "parsing", title: "Распознаю и разбираю" },
  { id: "confirm", title: "Подтверждение: 6 карточек" },
  { id: "picker", title: "«Кому?» — выбор человека" },
  { id: "offhours", title: "Вне окна доставки: «отправлю утром»" },
  { id: "unparsed", title: "Не разобрал" },
  { id: "answer", title: "Вопрос к данным и ответ" },
  { id: "kept", title: "Нет сети: фраза на телефоне" },
  { id: "text", title: "Ввод строкой" },
  { id: "tasks", title: "Задачи: стопка карточек" },
  { id: "messages", title: "Сообщения" },
  { id: "thread", title: "Переписка задачи" },
  { id: "actions", title: "«Все действия» задачи" },
  { id: "ether", title: "Эфир" },
  { id: "calendar", title: "Календарь" },
  { id: "rating", title: "Рейтинг и спор" },
  { id: "person", title: "Человек выбран: его задачи, дать задачу" },
  { id: "secretary", title: "Секретарь: просьбы" },
  { id: "visitor", title: "Посетитель и сообщение секретаря" },
  { id: "empty", title: "Новая компания: никого, уведомления выключены" },
] as const;

export type StateId = (typeof STATES)[number]["id"];
