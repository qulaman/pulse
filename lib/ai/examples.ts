import type Anthropic from "@anthropic-ai/sdk";

import { kindModules } from "./kinds";
import type { FewShotPair } from "./kinds/fields";
import { PARSER_KINDS, type ParserKind } from "./kinds/names";

/**
 * Few-shot pairs П1–П12 (docs/AI.md §4) — each lives in the module of the kind it teaches
 * (lib/ai/kinds, task 026) and is mapped onto the single demo roster tests/stt/roster.json:
 * Айгуль → u-005, Ерлан → u-001 (spoken as «Ерлану Б.», otherwise the two Erlans are
 * ambiguous), Марат → u-003, Сакен → u-004, Тимур → u-009, Жандос → u-010.
 * Context of every example: четверг, 13.08.2026 16:32 (+05:00), источник voice.
 * Nothing here may vary between requests — these messages are cached.
 * The examples teach the FORMAT, not a client's world: counterparties are the neutral
 * «Альфа», never a real partner of client №1 (code is client-agnostic, V-02).
 * Answers are in the model's form: names, not ids (D-56), times as TimeRefs — what was said,
 * nothing computed.
 */

/**
 * The pairs of the kinds that are on, in the fixed order of their numbers П1–П12 — the order
 * the evals were measured on (the order of the kinds put П6 last and moved r-016-mini, task
 * 026). A pair is shown only while every kind in its answer is on: an example of a
 * switched-off kind would teach the model an answer its schema refuses.
 */
export function fewShotPairs(kinds: readonly ParserKind[] = PARSER_KINDS): FewShotPair[] {
  const modules = kindModules(kinds);
  const on = new Set<string>(modules.map((module) => module.kind));
  return modules
    .flatMap((module) => module.examples.filter((pair) => pair.assistant.entities.every((entity) => on.has(entity.kind))))
    .sort((a, b) => a.n - b.n);
}

/** Every pair, every kind on — what the tests and the lab's run fingerprint read. */
export const FEW_SHOT: FewShotPair[] = fewShotPairs();

/** Context line shared by every few-shot user turn (docs/AI.md §4). */
export const FEW_SHOT_CONTEXT = "Сейчас: четверг, 13.08.2026 16:32 (+05:00). Источник: voice.";

/**
 * Alternating user/assistant turns. The last assistant message carries the second
 * cache breakpoint, so system + roster + few-shot form one cached prefix (§9).
 */
export function fewShotMessages(kinds: readonly ParserKind[] = PARSER_KINDS): Anthropic.MessageParam[] {
  const pairs = fewShotPairs(kinds);
  const messages: Anthropic.MessageParam[] = [];
  pairs.forEach((pair, index) => {
    messages.push({
      role: "user",
      content: `${FEW_SHOT_CONTEXT}\n<input>\n${pair.user}\n</input>`,
    });
    const text = JSON.stringify(pair.assistant);
    messages.push({
      role: "assistant",
      content:
        index === pairs.length - 1
          ? [{ type: "text", text, cache_control: { type: "ephemeral" } }]
          : [{ type: "text", text }],
    });
  });
  return messages;
}
