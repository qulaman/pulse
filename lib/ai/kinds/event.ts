import { z } from "zod";

import type { KindModule } from "./fields";
import { spokenTime, TimeRefSchema } from "../timeref";

/**
 * The `event` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. A meeting with a date and time (D-78).
 */

/**
 * A meeting with a time (D-78): one row and N participants, unlike a task, which is
 * copied per assignee (D-02). Names the model copies from the roster verbatim, exactly
 * as for an assignee; the ids are the server's (D-56).
 *
 * Why this variant is so much leaner than the app's event (schema.ts): the API compiles the
 * whole schema into one grammar and refuses it twice over — more than 16 union (nullable)
 * parameters, and a grammar «too large» (both live, 2026-09-18, once the ninth kind
 * arrived). So the model is asked only for what nothing else can supply: everything
 * unsaid is "" instead of null, and the end time, the agenda, the verbatim mentions
 * and the reminder offset are filled in by the app and by /confirm.
 */
export const ModelEventEntitySchema = z.strictObject({
  kind: z.literal("event"),
  title: z.string(), // «Планёрка», «Встреча с Альфой» — без даты и имён
  location: z.string(), // «в офисе», «у Альфы»; "" — не сказано
  starts_at: TimeRefSchema.nullable(), // null — ни даты, ни времени
  participant_names: z.array(z.string()), // roster full_name copied verbatim (D-56)
  everyone: z.boolean(), // «всем», «вся команда»
  source_span: z.string(),
});

const section = `## event — мероприятие с датой и временем
- Собрание, планёрка, совещание, встреча, созвон, выезд, обучение, корпоратив, день
  рождения. Есть слово-маркер и дата/время → event.
- title — суть без даты и имён («Планёрка», «Встреча с Альфой»).
- Участники: названные имена → participant_names (full_name из ростера, дословно, как
  assignee_name; склонения и казахские падежи — так же); «всем / вся команда / весь
  офис» → everyone: true и пустой список; никого не названо и не «всем» → пустой
  список, everyone: false (мероприятие директора).
- Место после «в / на / у» (в офисе, на складе, у Альфы) → location; не сказано — "".
- starts_at — когда (TimeRef, раздел «Время»). Дата без времени («в пятницу
  корпоратив») — только день; ни даты, ни времени — null.
- Повестку и время напоминания директор ставит сам на экране — не выдумывай.
- Поручение вокруг мероприятия («Марат, подготовь зал») — отдельный task. «Каждый
  понедельник планёрка» → recurrence. «Напомни мне позвонить …» — reminder, не event.`;

export const eventKind: KindModule = {
  kind: "event",
  section,
  modelSchema: ModelEventEntitySchema,
  examples: [
    // П12. Мероприятие с участниками по именам, местом и явным напоминанием (D-78).
    {
      n: 12,
      user: "Встреча с Альфой в четверг в три у них в офисе, идут Марат и Айгуль. Напомни за час",
      assistant: {
        entities: [
          {
            kind: "event",
            title: "Встреча с Альфой",
            location: "у них в офисе",
            starts_at: spokenTime("в четверг в три", { day: "weekday", weekday: 4, time: "15:00" }),
            participant_names: ["Марат Оспанов", "Айгуль Сапарова"],
            everyone: false,
            source_span:
              "Встреча с Альфой в четверг в три у них в офисе, идут Марат и Айгуль. Напомни за час",
          },
        ],
      },
    },
  ],
};
