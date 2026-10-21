import { z } from "zod";

import { assigneeFields, type KindModule } from "./fields";

/**
 * The `recurrence` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. A repeating rule; written, not executed yet (IDEAS И-19).
 */

export const ModelRecurrenceEntitySchema = z.strictObject({
  kind: z.literal("recurrence"),
  ...assigneeFields,
  title: z.string(),
  rrule: z.string(),
  source_span: z.string(),
});

const section = `## recurrence — повторяющееся правило
- «Каждый понедельник Айгуль сдаёт отчёт», «каждый понедельник планёрка».`;

export const recurrenceKind: KindModule = {
  kind: "recurrence",
  section,
  modelSchema: ModelRecurrenceEntitySchema,
  examples: [],
};
