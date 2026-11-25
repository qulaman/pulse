/**
 * What the rating says, one story for the person who reads it (2.4) and nothing bad in public (D-45:
 * the negative is seen only on its owner's own screen — never in the rating, on the wall or in
 * Эфир). Pure, no React.
 *
 * `fn_rating` sums every row of the period, minuses included, and gives everybody the top five and
 * themselves (D-11). So the screen decides what each line may show:
 *   * one's own line — the number as it is, the fall too: one's own bad is one's own;
 *   * somebody else's — a number and a rise only above zero; at zero or below just the name;
 *   * «очков за период» — what the team earned: the positive sums only, as «заработано» on the wall;
 *   * one's own place — one honest line: the place with points, the minus with the balance beside it
 *     when the period went below zero, «пока нет» only when it is really nothing.
 */
import { formatNum } from "@/lib/desk/format";

import type { RatingRow } from "./queries";

export type RatingLineView = {
  /** The number on the right; null — nothing is drawn. */
  points: number | null;
  /** The arrow against the last period; null — none. */
  delta: number | null;
};

/** What one line of the rating may show to whoever reads it. */
export function ratingLineView(row: Pick<RatingRow, "points" | "delta_vs_prev" | "is_me">): RatingLineView {
  if (row.is_me) return { points: row.points, delta: row.delta_vs_prev !== 0 ? row.delta_vs_prev : null };
  if (row.points <= 0) return { points: null, delta: null };
  return { points: row.points, delta: row.delta_vs_prev > 0 ? row.delta_vs_prev : null };
}

export type RatingSummary = {
  /** What the team earned in the period: positive sums only. */
  earned: number;
  /** People with points above zero. */
  scored: number;
  /** The average «в срок» of the rows that have one, rounded; null — nobody has one. */
  onTimeAvg: number | null;
};

export function ratingSummary(rows: readonly Pick<RatingRow, "points" | "on_time_pct">[]): RatingSummary {
  const scored = rows.filter((row) => row.points > 0);
  const timed = rows.filter((row) => row.on_time_pct !== null);
  return {
    earned: scored.reduce((sum, row) => sum + row.points, 0),
    scored: scored.length,
    onTimeAvg: timed.length ? Math.round(timed.reduce((sum, row) => sum + (row.on_time_pct ?? 0), 0) / timed.length) : null,
  };
}

const PERIOD_WORDS = { week: "за неделю", month: "за месяц", all: "за всё время" } as const;
export type RatingPeriodKey = keyof typeof PERIOD_WORDS;

/**
 * The line about oneself under the rating. `ahead` — the row one place up; `balance` — the whole
 * ledger (undefined while it loads). Returns the words without the place's number styling.
 */
export function myRatingWords(
  me: Pick<RatingRow, "points" | "rank">,
  ahead: Pick<RatingRow, "points" | "display_name"> | undefined,
  period: RatingPeriodKey,
  balance?: number,
): { kind: "place"; rank: number; gap: number | null; leader: boolean } | { kind: "minus" | "none"; text: string } {
  if (me.points > 0) {
    const gap = ahead && ahead.points > me.points ? ahead.points - me.points : null;
    return { kind: "place", rank: me.rank, gap, leader: me.rank === 1 };
  }
  if (me.points < 0) {
    // «на счету 910» never breaks between the words and the number
    const tail = balance === undefined ? "" : ` · на счету ${formatNum(balance)}`;
    return { kind: "minus", text: `${capital(PERIOD_WORDS[period])} у вас ${formatNum(me.points)}${tail}` };
  }
  return { kind: "none", text: `${capital(PERIOD_WORDS[period])} очков пока нет. Закрытая в срок задача — первые очки` };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
