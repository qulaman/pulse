/**
 * The director's reactions to a task (D-133, И-68): seven of them, each with a price in points
 * from `settings.points_rules.reactions` (👍 1, 🔥 10, ❤️ 100 by default, the rest free). The
 * database knows the same codes (`react_to_task`, `reaction_glyph`). Plain module: no zod, no
 * React — the settings screen, the task screen and the tests import it alike.
 */

export const REACTION_CODES = ["like", "fire", "heart", "clap", "zap", "think", "dislike"] as const;
export type ReactionCode = (typeof REACTION_CODES)[number];

export const REACTION_GLYPH: Record<ReactionCode, string> = {
  like: "👍",
  fire: "🔥",
  heart: "❤️",
  clap: "👏",
  zap: "⚡",
  think: "🤔",
  dislike: "👎",
};

/** What a screen reader says, and the settings row's name. */
export const REACTION_LABEL: Record<ReactionCode, string> = {
  like: "Нравится",
  fire: "Огонь",
  heart: "Сердце",
  clap: "Браво",
  zap: "Молния",
  think: "Подумать",
  dislike: "Не то",
};

export type ReactionPrices = Record<ReactionCode, number>;

export const DEFAULT_REACTION_PRICES: ReactionPrices = {
  like: 1,
  fire: 10,
  heart: 100,
  clap: 0,
  zap: 0,
  think: 0,
  dislike: 0,
};

export function isReactionCode(value: unknown): value is ReactionCode {
  return typeof value === "string" && (REACTION_CODES as readonly string[]).includes(value);
}

/** The prices as stored, a broken or missing value falling back to its default (as `reaction_points()`). */
export function reactionPricesOf(raw: unknown): ReactionPrices {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prices = { ...DEFAULT_REACTION_PRICES };
  for (const code of REACTION_CODES) {
    const value = stored[code];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) prices[code] = value;
  }
  return prices;
}

/**
 * A task the director may react to: it reached somebody else and was not taken back — the same
 * rule as `react_to_task` (scheduled and revoked tasks say `not_reactable`).
 */
export function isReactable(task: { status: string; assignee_id: string | null }, meId: string): boolean {
  return Boolean(task.assignee_id) && task.assignee_id !== meId && task.status !== "scheduled" && task.status !== "revoked";
}

/** «+10» under a reaction that pays; nothing under a free one. */
export function priceLabel(points: number): string | null {
  return points > 0 ? `+${points}` : null;
}

/**
 * Where the row of seven shows (D-133): on work handed in or accepted — what a reaction is for —
 * and on any task that already carries one, so it can be moved or taken off. Elsewhere it would
 * be seven buttons on every card for nothing (принцип 1).
 */
export function showsReactionBar(status: string, reacted: boolean): boolean {
  return reacted || status === "pending_review" || status === "done";
}
