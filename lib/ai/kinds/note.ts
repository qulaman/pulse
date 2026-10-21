import { z } from "zod";

import type { KindModule } from "./fields";
import { spokenTime } from "../timeref";

/**
 * The `note` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. A thought the director keeps for himself (D-75).
 */

/**
 * A thought the director keeps for himself (D-75): no assignee, no time, nobody else
 * ever reads it. `text` is already combed — the model drops «запиши», «заметка», «мысль».
 */
export const NoteEntitySchema = z.strictObject({
  kind: z.literal("note"),
  text: z.string(),
  source_span: z.string(),
});

const section = `## note — мысль директора для себя
- Без исполнителя и без «напомни»: «запиши мысль…», «заметка:», «идея:», «не забыть…».
  Вводные слова не включай в text.
- «запиши / заметка / мысль / идея / не забыть» без имени сотрудника → note; есть имя
  сотрудника → task. «Напомни мне …» → reminder. Заметка без времени и адресата — НЕ
  task с пустым исполнителем.`;

export const noteKind: KindModule = {
  kind: "note",
  section,
  modelSchema: NoteEntitySchema,
  examples: [
    // П10. Заметка директора самому себе: ни исполнителя, ни времени (D-75).
    {
      n: 10,
      user: "Запиши мысль: сделать акцию для Альфы к сезону",
      assistant: {
        entities: [
          {
            kind: "note",
            text: "Сделать акцию для Альфы к сезону",
            source_span: "Запиши мысль: сделать акцию для Альфы к сезону",
          },
        ],
      },
    },
    // П11. Заметка и поручение в одной фразе: имя разводит их по разным типам.
    {
      n: 11,
      user: "Заметка: подумать про склад. И Марат, позвони Альфе сегодня до шести",
      assistant: {
        entities: [
          {
            kind: "note",
            text: "Подумать про склад",
            source_span: "Заметка: подумать про склад",
          },
          {
            kind: "task",
            assignee_queries: ["Марат"],
            assignee_name: "Марат Оспанов",
            assignee_confidence: 0.98,
            group_id: null,
            title: "Позвонить Альфе",
            body: null,
            deadline: spokenTime("сегодня до шести", { day: "today", time: "18:00" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Марат, позвони Альфе сегодня до шести",
          },
        ],
      },
    },
  ],
};
