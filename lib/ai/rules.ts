/**
 * «Правила компании» (D-138): the director's own lines appended to the parser prompt. Plain
 * values only — the lab page imports them and must stay free of zod and the SDK (D-126).
 */

/** Long enough for a dozen rules, short enough that the prompt stays a prompt. */
export const PARSER_RULES_MAX = 2000;

/** Versions kept in company.settings.parser_rules — the newest first, the oldest go. */
export const PARSER_RULES_HISTORY_MAX = 10;

/** The corpus gates a save must pass — the same as `pnpm eval:parser` (CLAUDE.md §5). */
export const PARSER_GATES = { assignee: 0.97, f1: 0.9 } as const;

/** One text, one prompt: line endings and the edges never make a «new» version. */
export function normalizeRules(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}
