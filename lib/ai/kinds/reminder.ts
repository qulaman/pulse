import { z } from "zod";

import type { KindModule } from "./fields";
import { TimeRefSchema } from "../timeref";

/**
 * The `reminder` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. A reminder the director asks for himself; stored as a note with a time (D-95).
 */

export const ModelReminderEntitySchema = z.strictObject({
  kind: z.literal("reminder"),
  text: z.string(),
  remind_at: TimeRefSchema.nullable(),
  source_span: z.string(),
});

const section = `## reminder — напоминание директора самому себе
- ТОЛЬКО когда директор просит напомнить ему самому («напомни мне завтра позвонить
  в банк», «не забыть мне»). Поручение без имени — не reminder, а task.
- remind_at — когда напомнить (TimeRef, раздел «Время»); не сказано — null.`;

export const reminderKind: KindModule = {
  kind: "reminder",
  section,
  modelSchema: ModelReminderEntitySchema,
  examples: [],
};
