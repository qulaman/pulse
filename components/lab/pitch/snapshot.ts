/**
 * The measured numbers «Как работает Pulse» (PitchStory) and «Как устроено» (TechStory) show,
 * frozen on the day they were counted. Nothing reads them from data: the owner refreshes them by
 * hand, all at once, here.
 */
export const SNAPSHOT = {
  /** The parser evals run the parse figures come from (tests/ai/results). */
  evalRunOn: "22.09.2026",
  /** The model that parsed that run; Sonnet re-checks the doubtful phrases. */
  parserModel: "Claude Haiku 4.5",
  /** The assignee picked right, % of the phrases. */
  assigneeAccuracy: 100,
  /** Entity F1 of the parse, %. */
  parseF1: 97.6,
  /** Median seconds to parse one phrase. */
  parseSeconds: 1.5,
  /** Phrases in tests/ai/parser_evals.jsonl, Kazakh and mixed ones included. */
  evalPhrases: 66,
  /** The repository was counted on 2026-09-26: first commit 2026-08-14, decisions D-01…D-123. */
  countedOn: "26.09.2026",
  weeks: 6,
  commits: 535,
  decisions: 123,
} as const;
