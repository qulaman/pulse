import type { TvEvent, TvKind } from "./feed";
import type { TvPaceRow } from "./scenes";

/**
 * Праздники стены (D-182) — чистыми функциями: когда стена благодарит человека плашкой и когда
 * празднует день «моментом» во всю стену. Только хорошее и только по имени (D-45); гостю — копия
 * события для гостя: имя без фамилии, без очков и без заголовков поручений (D-33).
 *
 *  - **Плашка признания** — принятая работа, очки, награда: внизу поверх любой сцены, 7 с. Не чаще
 *    раза в две минуты, в очереди не больше трёх (старшие лишние выпадают), старше 10 минут — уже
 *    не новость. Не ночью, не поверх надписи и не пока ведущий ведёт доску по пунктам.
 *  - **Момент** — рекорд дня (принято больше лучшего дня за 8 недель) и «обычный день сделан»
 *    (принято столько, сколько обычно за весь день): во всю стену, 8 с, каждый раз в день. Не
 *    поверх доски, человека, дела, надписи, ночи и гостя.
 */

export const CHEER_KINDS = ["task_done", "points", "merch"] as const satisfies readonly TvKind[];
export type CheerKind = (typeof CHEER_KINDS)[number];

/** How long a plaque stays on the wall. */
export const CHEER_MS = 7_000;
/** Plaques come no more often than this (from one start to the next). */
export const CHEER_GAP_MS = 2 * 60_000;
/** At most this many wait their turn; the older ones beyond it drop out. */
export const CHEER_QUEUE = 3;
/** Older news is no news: it is never shown. */
export const CHEER_MAX_AGE_MS = 10 * 60_000;
/** How long a moment takes the wall. */
export const MOMENT_MS = 8_000;
/** A clock a little ahead on the server must not turn a fresh event into a future one. */
const SKEW_MS = 60_000;

export type Cheer = {
  id: string;
  kind: CheerKind;
  /** Full name; for a guest — the first name only (it comes so from the base). */
  name: string;
  /** Points of the event; never for a guest. */
  amount: number | null;
  /** The line under the name: what for. */
  detail: string;
  at: number;
};

function isCheerKind(kind: TvKind): kind is CheerKind {
  return (CHEER_KINDS as readonly string[]).includes(kind);
}

function clean(text: string | null | undefined): string | null {
  const flat = text?.replace(/\s+/g, " ").trim();
  return flat ? flat : null;
}

/** One plaque from one event of the wall's feed; null — nothing to thank anyone for. */
export function cheerOf(event: TvEvent, guest: boolean): Cheer | null {
  if (!isCheerKind(event.kind)) return null;
  const payload = guest ? event.payload_guest : event.payload;
  const name = clean(payload.name);
  if (!name) return null;
  const at = Date.parse(event.created_at);
  if (Number.isNaN(at)) return null;
  const amount = !guest && typeof payload.amount === "number" && payload.amount > 0 ? payload.amount : null;
  const title = clean(payload.title);
  const detail =
    event.kind === "task_done"
      ? title
        ? `Принято: ${title}`
        : "Работа принята"
      : event.kind === "points"
        ? (title ?? "Получает очки")
        : title
          ? `Забирает награду: ${title}`
          : "Забирает награду";
  return { id: event.id, kind: event.kind, name, amount, detail, at };
}

/**
 * The plaques waiting their turn, oldest first: fresh (≤ 10 min), not shown before. Beyond three the
 * older ones drop out — `dropped` goes into the shown set, so they do not come back as the queue
 * shrinks.
 */
export function cheerQueue(
  events: readonly TvEvent[],
  seen: ReadonlySet<string>,
  now: number,
  guest: boolean,
): { queue: Cheer[]; dropped: string[] } {
  const fresh: Cheer[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    const cheer = cheerOf(event, guest);
    if (!cheer) continue;
    const age = now - cheer.at;
    if (age > CHEER_MAX_AGE_MS || age < -SKEW_MS) continue;
    fresh.push(cheer);
  }
  fresh.sort((a, b) => a.at - b.at);
  const cut = Math.max(0, fresh.length - CHEER_QUEUE);
  return { queue: fresh.slice(cut), dropped: fresh.slice(0, cut).map((cheer) => cheer.id) };
}

/** The plaque to put up now, or null: something blocks the wall, or the last one was too recent. */
export function cheerNext(queue: readonly Cheer[], lastShownAt: number | null, now: number, blocked: boolean): Cheer | null {
  if (blocked || queue.length === 0) return null;
  if (lastShownAt !== null && now - lastShownAt < CHEER_GAP_MS) return null;
  return queue[0]!;
}

/** What may block a plaque: the night, a notice over the wall, a meeting walking the board point by point. */
export function cheerBlocked(input: { night: boolean; banner: boolean; boardPoint: boolean; moment: boolean }): boolean {
  return input.night || input.banner || input.boardPoint || input.moment;
}

export type MomentKind = "record" | "usual";

/**
 * The moment due today, if any: the record of the day first (it says more), then «обычный день
 * сделан». A company without history (zeros) has neither.
 */
export function momentDue(pace: TvPaceRow | null | undefined, shown: ReadonlySet<MomentKind>): MomentKind | null {
  if (!pace || pace.done <= 0) return null;
  if (pace.best_day > 0 && pace.done > pace.best_day && !shown.has("record")) return "record";
  if (pace.usual_day > 0 && pace.done >= pace.usual_day && !shown.has("usual")) return "usual";
  return null;
}

/** The moments a shown one settles: a record also makes the usual day — it is not played after it. */
export function momentSettles(kind: MomentKind, pace: TvPaceRow): MomentKind[] {
  return kind === "record" && pace.usual_day > 0 && pace.done >= pace.usual_day ? ["record", "usual"] : [kind];
}

/** What may block a moment: anything someone put up on the wall, the night, a guest in the office. */
export function momentBlocked(input: {
  night: boolean;
  guest: boolean;
  banner: boolean;
  focus: boolean;
  board: boolean;
  cheer: boolean;
}): boolean {
  return input.night || input.guest || input.banner || input.focus || input.board || input.cheer;
}

/** The words of a moment: the heading and the line under it. */
export function momentWords(kind: MomentKind): { title: string; line: string } {
  return kind === "record"
    ? { title: "Рекорд дня", line: "лучший день за два месяца" }
    : { title: "Обычный день сделан", line: "столько, сколько обычно за весь день" };
}

/** The company day by Aqtobe, «2026-11-18»: a moment is once a day. */
export function wallDay(now: Date): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
