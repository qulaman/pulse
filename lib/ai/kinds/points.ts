import { z } from "zod";

import { assigneeFields, type KindModule } from "./fields";

/**
 * The `points` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. Points awarded by voice (D-30, D-48); shared text never awards any (D-36).
 */

export const ModelPointsEntitySchema = z.strictObject({
  kind: z.literal("points"),
  ...assigneeFields,
  amount: z.number(),
  reason: z.string().nullable(),
  source_span: z.string(),
});

const section = `## points — начисление очков
- «Ерлану плюс десять за скорость». Только при явном числе очков или однозначной
  формуле («десятку» = 10). Похвала без числа — не points.
- Отрицательные суммы извлекай как услышано — их заблокирует система (снятие очков
  голосом запрещено). Суммы и знаки чисел НЕ реконструируй никогда — только как услышаны.`;

export const pointsKind: KindModule = {
  kind: "points",
  section,
  modelSchema: ModelPointsEntitySchema,
  examples: [],
};
