import { z } from "zod";

import { assigneeFields, type KindModule } from "./fields";
import { REPEAT_EVERY } from "../../recurrence/schedule";

/**
 * The `recurrence` kind (task 026, D-148): its section of the prompt, its few-shot pairs and its
 * variant of the model's schema. A repeating order: the model says what was named — how often,
 * which days, by what hour — and code counts the dates (lib/recurrence/schedule.ts), as with
 * TimeRef. No field is nullable: the grammar caps union parameters (schema.ts), so «не сказано»
 * is "" / 0 / [] here, as in the event's variant.
 */

/** The parts of a day a repeating deadline may name; their hours are the company's conventions (D-15). */
export const RECURRENCE_PARTS = ["", "morning", "before_lunch", "lunch", "after_lunch", "evening", "end_of_day"] as const;

export const ModelRecurrenceEntitySchema = z.strictObject({
  kind: z.literal("recurrence"),
  ...assigneeFields,
  title: z.string(),
  every: z.enum(REPEAT_EVERY),
  interval: z.number(), // 1; «раз в две недели» — 2
  weekdays: z.array(z.literal([1, 2, 3, 4, 5, 6, 7])), // every "week": 1 пн … 7 вс; otherwise []
  month_day: z.number(), // every "month": 1…31, «в конце месяца» — 31; otherwise 0
  time: z.string(), // "HH:MM" when a clock time was named; otherwise ""
  part: z.enum(RECURRENCE_PARTS), // a part of the day said in words; otherwise ""
  source_span: z.string(),
});

const section = `## recurrence — повторяющееся поручение
- Поручение, которое повторяется само: «каждый понедельник», «по пятницам», «ежедневно»,
  «по будням», «раз в две недели», «каждое пятое число», «в конце каждого месяца».
- ТОЛЬКО при явном слове о повторе: «каждый/каждую/каждое», «по <дням>», «ежедневно»,
  «еженедельно», «ежемесячно», «раз в …», «через неделю». День без такого слова
  («в понедельник», «к пятнице», «пятого числа») — один раз, это task, не recurrence.
- Исполнитель — как у task (assignee_*); «Айгуль и Марат каждый понедельник …» — две
  сущности recurrence. title — суть без слов о повторе и времени («Отчёт по ПЗТМ»).
- every: "day" — каждый день; "workday" — по будням / каждый рабочий день; "week" — по дням
  недели, дни — в weekdays (1 понедельник … 7 воскресенье; «по вторникам и четвергам» —
  [2, 4]; «еженедельно» без дня — [1]); "month" — по числам, число — в month_day
  («в конце месяца» — 31). У других every weekdays — [], month_day — 0.
- interval — 1; «раз в две недели», «через неделю» — 2; «раз в квартал» (every "month") — 3.
- Срок в день повтора: названное время — time "HH:MM" (24 часа, «к пяти» днём — "17:00");
  часть дня словами («до обеда», «к вечеру») — part (ключ из раздела «Время»); не сказано —
  time "" и part "".
- Регулярная встреча («каждый понедельник планёрка») — не recurrence, а event с repeat.`;

export const recurrenceKind: KindModule = {
  kind: "recurrence",
  section,
  modelSchema: ModelRecurrenceEntitySchema,
  examples: [
    // П13. Два повтора в одной фразе: дни недели со временем и будни с частью дня (D-148).
    {
      n: 13,
      user: "Сакен, каждую пятницу к пяти сдавай кассу. И Динара, по будням с утра присылай сводку по звонкам",
      assistant: {
        entities: [
          {
            kind: "recurrence",
            assignee_queries: ["Сакен"],
            assignee_name: "Сәкен Жумабаев",
            assignee_confidence: 0.95,
            title: "Сдать кассу",
            every: "week",
            interval: 1,
            weekdays: [5],
            month_day: 0,
            time: "17:00",
            part: "",
            source_span: "Сакен, каждую пятницу к пяти сдавай кассу",
          },
          {
            kind: "recurrence",
            assignee_queries: ["Динара"],
            assignee_name: "Динара Ахметова",
            assignee_confidence: 0.97,
            title: "Прислать сводку по звонкам",
            every: "workday",
            interval: 1,
            weekdays: [],
            month_day: 0,
            time: "",
            part: "morning",
            source_span: "И Динара, по будням с утра присылай сводку по звонкам",
          },
        ],
      },
    },
  ],
};
