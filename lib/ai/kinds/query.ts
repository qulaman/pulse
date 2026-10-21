import { z } from "zod";

import type { KindModule } from "./fields";

/**
 * The `query` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. A question about the state of things; answered on Пульс, not parsed into work (D-51).
 */

export const QueryEntitySchema = z.strictObject({
  kind: z.literal("query"),
  question: z.string(),
  source_span: z.string(),
});

const section = `## query — вопрос к системе
- Вопрос о состоянии дел («что там по…», «кто не отчитался», «чем занят…») — query,
  НЕ task.
- Поручение с вопросительной интонацией («Марат сделает КП?» в контексте раздачи
  задач) — task.`;

export const queryKind: KindModule = {
  kind: "query",
  section,
  modelSchema: QueryEntitySchema,
  examples: [
    // П6. Вопрос к системе.
    {
      n: 6,
      user: "Что там по Альфе и кто сегодня не отчитался?",
      assistant: {
        entities: [
          {
            kind: "query",
            question: "Что там по Альфе и кто сегодня не отчитался?",
            source_span: "Что там по Альфе и кто сегодня не отчитался?",
          },
        ],
      },
    },
  ],
};
