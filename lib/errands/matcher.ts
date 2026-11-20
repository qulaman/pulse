import { matchName, type RosterUser } from "@/lib/matchName";
import type { SecretaryAction } from "@/lib/settings";
import { normalize, stem } from "@/lib/text/normalize";

/**
 * The deterministic errand matcher (D-79, phase D): «кофе» is not a task and no reason to
 * wake the model. A short phrase with no roster name that matched a catalogue button
 * becomes an errand at once, past the parser and /confirm.
 *
 * The bounds are narrow on purpose, because a mistake here costs more than it saves: «Свари кофе Марату
 * к 15:00» is an order to a person, and the model reads it.
 */

/** Longer is no request in passing but an order: the model reads such a phrase. */
const MAX_WORDS = 3;

export type ErrandMatch = { code: string; label: string; note: string | null };

function words(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

/** A word matches itself or its stem: «врача» is caught by «врач». */
function sameWord(a: string, b: string): boolean {
  return a === b || stem(a) === stem(b);
}

function leadingMatch(said: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > said.length) return false;
  return phrase.every((word, i) => sameWord(word, said[i]!));
}

/**
 * What was said → which catalogue button. Null means «not an errand» — the phrase goes
 * to the parser, as it always did.
 */
export function matchErrand(
  transcript: string,
  actions: readonly SecretaryAction[],
  roster: readonly RosterUser[],
  hasSecretary: boolean,
): ErrandMatch | null {
  if (!hasSecretary || actions.length === 0) return null;

  const said = words(transcript);
  if (said.length === 0 || said.length > MAX_WORDS) return null;

  // a name in the phrase is an addressee, and so a task: «Марат, кофе» is not an errand
  for (const word of said) {
    const match = matchName(
      { assignee_id: null, assignee_queries: [word], assignee_confidence: 1 },
      roster as RosterUser[],
    );
    if (match.status !== "unmatched") return null;
  }

  // of two buttons that fit, the longer phrase wins: «зайди ко мне» before «зайди»
  let best: { action: SecretaryAction; length: number } | null = null;
  for (const action of actions) {
    for (const phrase of [action.label, ...action.synonyms]) {
      const tokens = words(phrase);
      if (!leadingMatch(said, tokens)) continue;
      if (!best || tokens.length > best.length) best = { action, length: tokens.length };
    }
  }
  if (!best) return null;

  // the rest of the phrase is a note: «кофе без сахара» → coffee + «без сахара»
  const rest = said.slice(best.length).join(" ").trim();
  return { code: best.action.code, label: best.action.label, note: rest || null };
}
