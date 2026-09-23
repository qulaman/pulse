import type { SecretaryAction } from "@/lib/settings";
import { firstNameOf, normalize } from "@/lib/text/normalize";

import type { Errand } from "./queries";

/**
 * What the secretary's own face is doing (D-87, D-97): the job of the request in hand, drawn
 * — a coffee machine, a teapot, the «не беспокоить» sign, the door opened for a guest. The
 * director may pick the scene of a button in the settings; otherwise it is read off the
 * catalogue code of the default buttons, and a button added later (its code is its label in
 * latin letters) is recognised by the words of its label. Anything else is a note being
 * taken — no company is named here (V-02).
 */
export const DESK_SCENES = [
  "coffee",
  "tea",
  "water",
  "dnd",
  "security",
  "guest",
  "meeting",
  "doctor",
  "come",
  "taxi",
  "print",
  "lunch",
  "courier",
  "other",
] as const;

export type DeskScene = (typeof DESK_SCENES)[number];

/** The picker of the catalogue editor: what each scene shows, in the director's words. */
export const SCENE_NAME: Record<DeskScene, string> = {
  coffee: "Варит кофе",
  tea: "Заваривает чай",
  water: "Наливает воду",
  dnd: "Не беспокоить",
  security: "Вызывает охрану",
  guest: "Приглашает гостя",
  meeting: "Готовит переговорную",
  doctor: "Звонит врачу",
  come: "Идёт к директору",
  taxi: "Вызывает машину",
  print: "Печатает",
  lunch: "Несёт обед",
  courier: "Несёт посылку",
  other: "Записывает",
};

/**
 * rest — nobody asks: at the desk; asked — a request nobody has taken yet: the headset rings
 * and the face hops until somebody says «Принял»; doing — the job itself; done — the short
 * finish after «Готово» (the cup carried out, the door closed, the sign put away).
 */
export type DeskPhase = "rest" | "asked" | "doing" | "done";

const BY_CODE: Partial<Record<string, DeskScene>> = {
  coffee: "coffee",
  tea: "tea",
  dnd: "dnd",
  security: "security",
  guest: "guest",
  doctor: "doctor",
  come: "come",
};

/** Word starts, checked on the normalised label: «Кофе с молоком», «Чайку», «Гостя в кабинет». */
const BY_WORD: [RegExp, DeskScene][] = [
  // an alarm first: «охрана» must never be read as anything calmer
  [/(^| )(охран|секьюрит|тревог|sos)/, "security"],
  [/(^| )(коф|латте|капуч|эспрессо|американо)/, "coffee"],
  [/(^| )ча[йюяе]/, "tea"],
  // the driver before the water: «водитель» starts like «вода»
  [/(^| )(такси|водител|машин|авто)/, "taxi"],
  [/(^| )(вод(а|ы|у|ой|е)?( |$)|минерал|графин)/, "water"],
  [/беспоко|(^| )никого|тишин/, "dnd"],
  [/(^| )(гост|посетит|визитер)/, "guest"],
  [/(^| )(переговор|совещан)/, "meeting"],
  [/(^| )(врач|доктор|медик|скор)/, "doctor"],
  [/(^| )(печат|распечат|принтер|скан|ксерок)/, "print"],
  [/(^| )(обед|ед[ау]( |$)|перекус|ланч|доставк)/, "lunch"],
  [/(^| )(курьер|посылк|бандерол)/, "courier"],
  [/(^| )(зайд|подойд|ко мне)/, "come"],
];

export function sceneOf(errand: Pick<Errand, "kind" | "label">, catalogue: readonly SecretaryAction[] = []): DeskScene {
  const chosen = catalogue.find((action) => action.code === errand.kind)?.scene;
  if (chosen) return chosen;
  const byCode = BY_CODE[errand.kind];
  if (byCode) return byCode;
  const label = normalize(errand.label);
  for (const [pattern, scene] of BY_WORD) if (pattern.test(label)) return scene;
  return "other";
}

/** The scene a catalogue row will play — what the settings preview shows. */
export function sceneOfAction(action: Pick<SecretaryAction, "code" | "label" | "scene">): DeskScene {
  return action.scene ?? sceneOf({ kind: action.code, label: action.label });
}

export type DeskFocus = { scene: DeskScene | null; phase: DeskPhase; errand: Errand | null; queue: number };

const newestFirst = (a: Errand, b: Errand) => b.created_at.localeCompare(a.created_at);
const oldestFirst = (a: Errand, b: Errand) => a.created_at.localeCompare(b.created_at);

/**
 * The one request the face acts out. A request nobody has taken comes first — the oldest,
 * since it has waited longest, and the rest wait as «+N» on the bubble; then the job in hand;
 * then «не беспокоить», whoever took it, because it is a state of the director's door rather
 * than a job, and it outlasts coffee and guests.
 *
 * `meId` is the secretary whose screen it is — only their own jobs are acted out. `null` is
 * the director's desk (D-97): whoever of the secretaries took the job, the desk shows it.
 */
export function deskFocus(errands: readonly Errand[], meId: string | null, catalogue: readonly SecretaryAction[] = []): DeskFocus {
  const scene = (e: Errand) => sceneOf(e, catalogue);
  // «вызови охрану» outranks everything: nobody took it — it calls; taken — it is the job (D-99)
  const alarm = errands.filter((e) => (e.status === "sent" || e.status === "accepted") && scene(e) === "security").sort(oldestFirst)[0];
  if (alarm?.status === "sent") return { scene: "security", phase: "asked", errand: alarm, queue: errands.filter((e) => e.status === "sent").length - 1 };
  if (alarm && (meId === null || alarm.claimed_by === meId)) return { scene: "security", phase: "doing", errand: alarm, queue: 0 };
  const sent = errands.filter((e) => e.status === "sent").sort(oldestFirst);
  if (sent[0]) return { scene: scene(sent[0]), phase: "asked", errand: sent[0], queue: sent.length - 1 };

  const taken = errands.filter((e) => e.status === "accepted" && (meId === null || e.claimed_by === meId)).sort(newestFirst);
  const job = taken.find((e) => scene(e) !== "dnd");
  if (job) return { scene: scene(job), phase: "doing", errand: job, queue: 0 };

  const guarded = errands.filter((e) => e.status === "accepted" && scene(e) === "dnd").sort(newestFirst);
  if (guarded[0]) return { scene: "dnd", phase: "doing", errand: guarded[0], queue: 0 };

  return { scene: null, phase: "rest", errand: null, queue: 0 };
}

/**
 * A job that has just been closed between two reads of the list — the face plays the finish
 * for it once. Only «Готово» counts: a declined or cancelled request is no reason. `null` —
 * anybody's (the director's desk).
 */
export function justDone(prev: readonly Errand[], next: readonly Errand[], meId: string | null): Errand | null {
  const before = new Map(prev.map((row) => [row.id, row.status]));
  return (
    next.find((row) => row.status === "done" && (meId === null || row.claimed_by === meId) && before.get(row.id) === "accepted") ?? null
  );
}

/** A thank-you from the director that has just arrived for one of this secretary's jobs (D-97). */
export function justThanked(prev: readonly Errand[], next: readonly Errand[], meId: string): Errand | null {
  const before = new Map(prev.map((row) => [row.id, row.thanked_at]));
  return next.find((row) => row.claimed_by === meId && row.thanked_at && before.has(row.id) && !before.get(row.id)) ?? null;
}

/**
 * How hard the face calls for a request nobody has taken: 0 — just arrived; 1 — a minute and
 * more, the director is waiting; 2 — the repeat push has gone out (D-79 §6) or its time has
 * come — the face runs on the spot.
 */
export type Urgency = 0 | 1 | 2;

export function urgencyOf(errand: Pick<Errand, "created_at" | "escalated_at" | "status"> | null, now: Date, escalateAfterMin: number): Urgency {
  if (!errand || errand.status !== "sent") return 0;
  const waited = now.getTime() - new Date(errand.created_at).getTime();
  if (errand.escalated_at || waited >= escalateAfterMin * 60_000) return 2;
  return waited >= 60_000 ? 1 : 0;
}

/** Aqtobe is UTC+5 all year: the wall clock of the office, whatever the phone says. */
const AQTOBE_OFFSET_MS = 5 * 60 * 60_000;

function wallMinutes(date: Date): number {
  const wall = new Date(date.getTime() + AQTOBE_OFFSET_MS);
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

function dayOf(date: Date): string {
  return new Date(date.getTime() + AQTOBE_OFFSET_MS).toISOString().slice(0, 10);
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * The time of day on the secretary's desk (D-97): the window behind the desk and what the
 * face does at rest. Night is outside the company's delivery window (D-38) — the secretary
 * dozes at the desk; the first hour and a half of the window is the morning; from 18:00 it is
 * evening.
 */
export type Daypart = "morning" | "day" | "evening" | "night";

export function daypartOf(now: Date, window: { from: string; to: string }): Daypart {
  const at = wallMinutes(now);
  const from = parseHm(window.from);
  const to = parseHm(window.to);
  const open = from <= to ? at >= from && at < to : at >= from || at < to;
  if (!open) return "night";
  if (at >= from && at < from + 90) return "morning";
  if (at >= 18 * 60) return "evening";
  return "day";
}

/** The Aqtobe date of a moment — «today» of the secretary's tally and of the morning arrival. */
export function aqtobeDay(date: Date): string {
  return dayOf(date);
}

export type DayTally = { items: { kind: string; label: string; icon: string; count: number }[]; averageMin: number | null; total: number };

/**
 * What this secretary closed today (Aqtobe), by button: «☕4 🍵2 🤝1 · в среднем 2 мин».
 * The average is «попросил → готово», the time the director actually waited.
 */
export function todayTally(errands: readonly Errand[], meId: string, now: Date, catalogue: readonly SecretaryAction[] = []): DayTally {
  const today = dayOf(now);
  const done = errands.filter((e) => e.status === "done" && e.claimed_by === meId && e.done_at && dayOf(new Date(e.done_at)) === today);
  const byKind = new Map<string, { kind: string; label: string; icon: string; count: number }>();
  for (const row of done) {
    const icon = catalogue.find((action) => action.code === row.kind)?.icon ?? "";
    const item = byKind.get(row.kind) ?? { kind: row.kind, label: row.label, icon, count: 0 };
    item.count += 1;
    byKind.set(row.kind, item);
  }
  const spans = done.map((row) => (new Date(row.done_at!).getTime() - new Date(row.created_at).getTime()) / 60_000).filter((m) => m >= 0);
  return {
    items: [...byKind.values()].sort((a, b) => b.count - a.count),
    averageMin: spans.length ? Math.max(1, Math.round(spans.reduce((sum, m) => sum + m, 0) / spans.length)) : null,
    total: done.length,
  };
}

/** A job closed within two minutes of the ask — the game feel counts it (D-97, after the D-40 gate). */
export const QUICK_MS = 2 * 60_000;

export function isQuick(errand: Pick<Errand, "created_at" | "done_at">): boolean {
  if (!errand.done_at) return false;
  return new Date(errand.done_at).getTime() - new Date(errand.created_at).getTime() <= QUICK_MS;
}

/** How many of this secretary's latest jobs today were quick in a row, the newest first. */
export function quickStreak(errands: readonly Errand[], meId: string, now: Date): number {
  const today = dayOf(now);
  const done = errands
    .filter((e) => e.status === "done" && e.claimed_by === meId && e.done_at && dayOf(new Date(e.done_at)) === today)
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  let streak = 0;
  for (const row of done) {
    if (!isQuick(row)) break;
    streak += 1;
  }
  return streak;
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** What the face is doing, in the first person — no gender in a present-tense verb (DESIGN §4). */
const DOING: Record<DeskScene, string> = {
  coffee: "Варю кофе",
  tea: "Завариваю чай",
  water: "Наливаю воду",
  dnd: "К директору никого не пускаю",
  security: "Вызываю охрану",
  guest: "Приглашаю гостя в кабинет",
  meeting: "Готовлю переговорную",
  doctor: "Вызываю врача",
  come: "Иду к директору",
  taxi: "Вызываю машину",
  print: "Печатаю",
  lunch: "Несу обед",
  courier: "Несу посылку",
  other: "",
};

/** The line under the face on the secretary's home: the moment in a few words. */
export function deskLine(focus: DeskFocus): string {
  const { errand, phase, scene } = focus;
  if (phase === "rest" || !errand || !scene) return "Заявок нет — на месте";
  if (phase === "asked") return scene === "security" ? "Директор: вызови охрану!" : `Директор просит: ${lower(errand.label)}`;
  if (phase === "done") return `Готово · ${lower(errand.label)}`;
  return DOING[scene] || `В работе: ${lower(errand.label)}`;
}

/**
 * The small line under it while a request calls: how long it has waited and how many more
 * are behind it — «ждёт 4 мин · ещё 2». Empty for a request that has just come.
 */
export function askedDetails(focus: DeskFocus, now: Date): string {
  if (focus.phase !== "asked" || !focus.errand) return "";
  const minutes = Math.floor((now.getTime() - new Date(focus.errand.created_at).getTime()) / 60_000);
  return [minutes >= 1 ? `ждёт ${minutes} мин` : "", focus.queue > 0 ? `ещё ${focus.queue}` : ""].filter(Boolean).join(" · ");
}

// ---- the link between the two desks (D-99) ----------------------------------------------

/**
 * What the secretary may ask about a request before or while doing it — one tap, the director
 * answers with one tap too («Да» / «Нет» or a word). The last line of each list is general.
 */
export const QUESTIONS: Record<DeskScene, string[]> = {
  coffee: ["С сахаром?", "С молоком?", "Куда принести?"],
  tea: ["Чёрный или зелёный?", "С сахаром?", "Куда принести?"],
  water: ["С газом?", "Куда принести?"],
  dnd: ["Надолго?", "А если срочно?"],
  security: ["Что случилось?", "Куда вызывать?"],
  guest: ["Сколько человек?", "Предложить чай или кофе?"],
  meeting: ["На сколько человек?", "К какому времени?"],
  doctor: ["Что случилось?", "Вызвать скорую?"],
  come: ["Взять документы?", "Сейчас подойти?"],
  taxi: ["Куда ехать?", "На какое время?"],
  print: ["Сколько экземпляров?", "Цветную?"],
  lunch: ["Что заказать?", "К какому времени?"],
  courier: ["Куда отправить?", "Что передать?"],
  other: ["Когда нужно?", "Уточните, пожалуйста"],
};

/** Questions a «Да» or a «Нет» answers — the director gets those two chips for them. */
export function isYesNo(question: string): boolean {
  return !/^(что|куда|когда|сколько|на сколько|к какому|чёрный или|черный или|уточните|надолго)/i.test(question.trim());
}

/**
 * What the secretary may pass back with «Готово» — the result the director was waiting for:
 * «Врач будет в 15:00», «Такси: белая Camry». Chips first, a free word always possible.
 */
export const RESULTS: Record<DeskScene, string[]> = {
  coffee: ["На столе", "В переговорной"],
  tea: ["На столе", "В переговорной"],
  water: ["На столе", "В переговорной"],
  dnd: [],
  security: ["Охрана на месте", "Охрана идёт"],
  guest: ["Гость у вас", "Гость ждёт в приёмной"],
  meeting: ["Переговорная готова", "Переговорная занята"],
  doctor: ["Врач едет", "Врач на месте"],
  come: [],
  taxi: ["Машина у входа", "Машина будет через 10 мин"],
  print: ["Лежит у вас на столе", "Лежит в приёмной"],
  lunch: ["Обед на столе", "Привезут через 30 мин"],
  courier: ["Курьер забрал", "Курьер будет через час"],
  other: ["Сделано"],
};

/** Minutes left until what the secretary promised on «Принял» («через 5 мин»); null — no promise. */
export function etaLeftMin(errand: Pick<Errand, "eta_at" | "status"> | null, now: Date): number | null {
  if (!errand?.eta_at || errand.status !== "accepted") return null;
  return Math.round((new Date(errand.eta_at).getTime() - now.getTime()) / 60_000);
}

/** «через 4 мин» / «вот-вот» / «опаздывает на 2 мин» — the promise, told the way a person would. */
export function etaLine(left: number | null): string | null {
  if (left === null) return null;
  if (left > 0) return `будет через ${left} мин`;
  if (left >= -1) return "вот-вот";
  return `опаздывает на ${-left} мин`;
}

/** Stepped away — «не на месте до 14:00»: requests go to a secretary who is there (D-99). */
export function isAway(person: { away_until?: string | null }, now: Date): boolean {
  return Boolean(person.away_until) && new Date(person.away_until as string).getTime() > now.getTime();
}

/** «до 14:05» on the Aqtobe wall clock. */
export function untilLine(iso: string): string {
  const wall = new Date(new Date(iso).getTime() + AQTOBE_OFFSET_MS);
  return `до ${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Who is away, for the toast of a request that went (D-106): «Айгуль не на месте до 14:00»,
 * or, when every secretary has stepped away, the earliest return. Null while somebody is there.
 */
export function absenceLine(people: readonly { full_name: string; away_until?: string | null }[], now: Date): string | null {
  if (people.length === 0 || !people.every((person) => isAway(person, now))) return null;
  const back = people.map((person) => person.away_until as string).sort()[0];
  if (people.length === 1) return `${firstNameOf(people[0].full_name)} не на месте ${untilLine(back)}`;
  return `никого нет на месте ${untilLine(back)}`;
}
