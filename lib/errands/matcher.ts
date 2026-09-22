import { matchName, type RosterUser } from "@/lib/matchName";
import type { SecretaryAction } from "@/lib/settings";
import { normalize, stem } from "@/lib/text/normalize";

/**
 * Детерминированный матчер заявок (D-79, фаза D): «кофе» — это не задача и не повод
 * будить модель. Короткая фраза без имени из ростера, совпавшая с кнопкой каталога,
 * становится заявкой сразу, минуя парсер и /confirm.
 *
 * Границы намеренно узкие, потому что ошибка здесь дороже экономии: «Свари кофе Марату
 * к 15:00» — это поручение человеку, и его разбирает модель, как раньше.
 */

/** Длиннее — уже не просьба на бегу, а поручение: такое читает модель. */
const MAX_WORDS = 3;

export type ErrandMatch = { code: string; label: string; note: string | null };

function words(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

/** Слово совпадает само с собой или своей основой: «врача» ловится «врач». */
function sameWord(a: string, b: string): boolean {
  return a === b || stem(a) === stem(b);
}

function leadingMatch(said: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > said.length) return false;
  return phrase.every((word, i) => sameWord(word, said[i]!));
}

/**
 * Что сказали → какая кнопка каталога. Null означает «это не заявка» — фраза уходит
 * в парсер, как уходила всегда.
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

  // имя в фразе означает адресата, а значит задачу: «Марат, кофе» — не заявка
  for (const word of said) {
    const match = matchName(
      { assignee_id: null, assignee_queries: [word], assignee_confidence: 1 },
      roster as RosterUser[],
    );
    if (match.status !== "unmatched") return null;
  }

  // из двух подошедших кнопок выигрывает более длинная фраза: «зайди ко мне» важнее «зайди»
  let best: { action: SecretaryAction; length: number } | null = null;
  for (const action of actions) {
    for (const phrase of [action.label, ...action.synonyms]) {
      const tokens = words(phrase);
      if (!leadingMatch(said, tokens)) continue;
      if (!best || tokens.length > best.length) best = { action, length: tokens.length };
    }
  }
  if (!best) return null;

  // остаток фразы — примечание: «кофе без сахара» → coffee + «без сахара»
  const rest = said.slice(best.length).join(" ").trim();
  return { code: best.action.code, label: best.action.label, note: rest || null };
}
