import type { TvLine } from "./feed";

/**
 * A moment on the wall (D-185): fresh praise, an award or an announcement takes the whole screen
 * for a short while, then the wall goes back to what it showed. Pure: the moment is computed from
 * the feed and the clock — no timer, no memory of what was shown, so a kiosk that reloads finds the
 * same moment on the wall.
 *
 * Moments queue up instead of cutting each other off: two praises a minute apart are both seen,
 * each for its full time, the second right after the first. The schedule depends on the events
 * alone, never on the clock — so a moment on the wall is never cut short by an older one dropping
 * out — and a moment whose turn would come more than a few minutes late is skipped: by then it
 * is not news.
 *
 * Only the good and the shared (D-45): the director's praise with points, a reward from the shop,
 * an announcement to everyone. A task closed by the director stays a line of the band — there are
 * dozens a day, a wall that jumps for each one is noise. With a guest in the office the wall has
 * no moments: their words are the company's own business (D-33).
 */

export type TvMomentKind = "points" | "merch" | "announcement";

export type TvMoment = {
  id: string;
  kind: TvMomentKind;
  /** Who: the praised person, the buyer, or the author of the announcement. */
  name: string;
  /** Points of the praise; null for an award and an announcement. */
  amount: number | null;
  /** The reason of the praise, the reward's title, the announcement's text. */
  detail: string | null;
  at: Date;
};

/** How long a moment holds the wall. */
export const MOMENT_MS = 25_000;
/** The longest a moment may wait for its turn: a later start is not news any more, its turn is skipped. */
export const QUEUE_MS = 4 * 60_000;
/** A kiosk clock a little behind the base must still show an event stamped «in the future». */
const SKEW_MS = 5_000;

const KINDS: ReadonlySet<string> = new Set<TvMomentKind>(["points", "merch", "announcement"]);

export function momentOf(lines: readonly TvLine[], now: Date, guest: boolean): TvMoment | null {
  if (guest) return null;
  const t = now.getTime();
  const queue = lines
    .filter((line) => KINDS.has(line.kind))
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  // each moment starts when it happened or when the one before it is over, whichever is later;
  // one that would wait longer than QUEUE_MS gives up its turn and holds nobody back
  let free = Number.NEGATIVE_INFINITY;
  for (const line of queue) {
    const at = line.at.getTime();
    const start = Math.max(at, free);
    if (start - at > QUEUE_MS) continue;
    const end = start + MOMENT_MS;
    if (t >= start - SKEW_MS && t < end) return momentFrom(line);
    free = end;
  }
  return null;
}

function momentFrom(line: TvLine): TvMoment {
  return {
    id: line.id,
    kind: line.kind as TvMomentKind,
    name: line.name,
    amount: line.kind === "points" ? line.amount : null,
    detail: line.detail,
    at: line.at,
  };
}
