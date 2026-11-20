import type { TvLine } from "./feed";

/**
 * A moment on the wall (D-185): fresh praise, an award or an announcement takes the whole screen
 * for a short while, then the wall goes back to what it showed. Pure: the moment is whatever the
 * feed holds that is young enough — no timer, no memory of what was shown. A kiosk that reloads
 * inside the window replays the rest of it, which is harmless.
 *
 * Only the good and the shared (D-45): the director's praise with points, a reward from the shop,
 * an announcement to everyone. A task closed by the director stays a ticker line — there are
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
/** A kiosk clock a little ahead of the base must still show an event stamped «in the future». */
const SKEW_MS = 5_000;

const KINDS: ReadonlySet<string> = new Set<TvMomentKind>(["points", "merch", "announcement"]);

export function momentOf(lines: readonly TvLine[], now: Date, guest: boolean): TvMoment | null {
  if (guest) return null;
  let best: TvLine | null = null;
  for (const line of lines) {
    if (!KINDS.has(line.kind)) continue;
    const age = now.getTime() - line.at.getTime();
    if (age < -SKEW_MS || age >= MOMENT_MS) continue;
    if (!best || line.at.getTime() > best.at.getTime()) best = line;
  }
  if (!best) return null;
  return {
    id: best.id,
    kind: best.kind as TvMomentKind,
    name: best.name,
    amount: best.kind === "points" ? best.amount : null,
    detail: best.detail,
    at: best.at,
  };
}
