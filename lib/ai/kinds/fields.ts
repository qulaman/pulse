import { z } from "zod";

import type { ParserKind } from "./names";
import type { ModelParseResult } from "../schema";

/**
 * What several kinds share: the assignee the model names, the priority, and the shape of a
 * few-shot pair. Here rather than in schema.ts, which imports every kind module.
 */

export const PrioritySchema = z.enum(["high", "normal", "low"]);

/**
 * What the MODEL says about the assignee: the verbatim mention and the roster's full_name
 * copied verbatim, or null. Names it copies reliably; ids it does not — on a real (uuid)
 * roster it echoed few-shot ids in every call (D-56). The id is the server's to fill from
 * the name, and it is kept out of the model schema.
 */
export const assigneeFields = {
  assignee_queries: z.array(z.string()), // verbatim mentions as heard; [] if none
  assignee_name: z.string().nullable(),
  assignee_confidence: z.number(), // 0..1
};

/**
 * One few-shot pair in the model's form: names, not ids (D-56); times as TimeRefs — what was
 * said, nothing computed (task 026). Context of every pair: четверг, 13.08.2026 16:32
 * (+05:00), источник voice (FEW_SHOT_CONTEXT); the roster is tests/stt/roster.json.
 */
export interface FewShotPair {
  /** Its number П1–П13 (docs/AI.md §4): the model sees the pairs in this order, whatever kind owns them. */
  n: number;
  user: string;
  assistant: ModelParseResult;
}

/** One kind of entity, everything the parser needs of it in one place (task 026). */
export interface KindModule {
  kind: ParserKind;
  /** Its section of the system prompt: what it is, what it is not, the rules of its fields. */
  section: string;
  /** Its few-shot pairs; a pair is shown only while every kind in its answer is on. */
  examples: FewShotPair[];
  /** Its variant of the union the model answers in. */
  modelSchema: z.ZodObject;
}
