import { z } from "zod";

import { assigneeFields, PrioritySchema, type KindModule } from "./fields";
import { spokenTime, TimeRefSchema } from "../timeref";

/**
 * The `task` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. An order to an employee, any order — the one kind a company cannot switch off.
 */

/**
 * Times the model names symbolically (TimeRef, lib/ai/timeref.ts); the ISO fields of the app
 * form (schema.ts) are computed from them by code — the model does no date arithmetic.
 */
export const ModelTaskEntitySchema = z.strictObject({
  kind: z.literal("task"),
  ...assigneeFields,
  group_id: z.string().nullable(), // same for copies born from one multi-assignee phrase
  title: z.string(),
  body: z.string().nullable(),
  deadline: TimeRefSchema.nullable(),
  priority: PrioritySchema,
  scheduled_send: TimeRefSchema.nullable(), // only on explicit "отправь утром/в понедельник"
  source_span: z.string(),
});

const section = `## task — поручение сотруднику
- ЛЮБОЕ поручение: рабочее («подготовь КП»), бытовое («сходи за сигаретами», «забери
  машину с мойки», «принеси кофе»), личное («позвони моей жене»). Уместность не
  оценивай — извлекай как сказано.
- ПОРУЧЕНИЕ БЕЗ ИМЕНИ — всё равно task (assignee_name: null, адресата выберет директор):
  «сходи за сигаретами», «надо заказать щебень», «кто-нибудь сгоняйте в аптеку».
- «Ерлану и Марату сделать X» — это ДВЕ независимые сущности task (по одной на
  исполнителя) с одинаковым group_id (любая строка, уникальная в этом ответе).
- ТЕЛЕГРАФ ИЗ ДВУХ СЛОВ: имя + предмет («Марат сигареты», «Жандос кофе») — task этому
  сотруднику; title — предмет как действие («Купить сигареты», «Принести кофе»). Одно
  слово без имени — не сущность.
- Есть имя сотрудника — task, даже если сказано «запиши» («запиши Марату: позвонить
  Альфе»).
- Просьба менеджеру «распредели в группе» — обычный task этому менеджеру.
- deadline — срок (TimeRef, раздел «Время»); не назван — null.
- priority: "high" только при явных маркерах («срочно», «в первую очередь», «горит»);
  "low" при «не к спеху», «когда будет время»; иначе "normal".
- scheduled_send — только если директор ЯВНО просит отложить отправку самого поручения
  сотруднику («утром ему отправь» — day "tomorrow", part "morning"; «в понедельник
  отправь»). «Скинь мне / пришли мне / сдай … завтра утром» — это срок (deadline), не
  scheduled_send. Иначе null.`;

export const taskKind: KindModule = {
  kind: "task",
  section,
  modelSchema: ModelTaskEntitySchema,
  examples: [
    // П1. Одиночная задача, явный дедлайн.
    {
      n: 1,
      user: "Марат, подготовь коммерческое предложение по Альфе к пятнице к трём часам",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["Марат"],
            assignee_name: "Марат Оспанов",
            assignee_confidence: 0.98,
            group_id: null,
            title: "Подготовить КП по Альфе",
            body: null,
            deadline: spokenTime("к пятнице к трём часам", { day: "weekday", weekday: 5, time: "15:00" }),
            priority: "normal",
            scheduled_send: null,
            source_span:
              "Марат, подготовь коммерческое предложение по Альфе к пятнице к трём часам",
          },
        ],
      },
    },
    // П2. Мульти-сущность: мероприятие всем + 2 задачи + очки.
    {
      n: 2,
      user:
        "Так, всем: завтра в десять общее собрание в офисе, не опаздывать. " +
        "Айгуль, подготовь акт сверки по Альфе завтра до обеда. " +
        "Сакен, срочно закрой наряды по третьему объекту сегодня до вечера. " +
        "И Ерлану Б. плюс десять за вчерашнюю поставку",
      assistant: {
        entities: [
          {
            kind: "event",
            title: "Общее собрание",
            location: "в офисе",
            starts_at: spokenTime("завтра в десять", { day: "tomorrow", time: "10:00" }),
            participant_names: [],
            everyone: true,
            source_span: "всем: завтра в десять общее собрание в офисе, не опаздывать",
          },
          {
            kind: "task",
            assignee_queries: ["Айгуль"],
            assignee_name: "Айгуль Сапарова",
            assignee_confidence: 0.97,
            group_id: null,
            title: "Подготовить акт сверки по Альфе",
            body: null,
            deadline: spokenTime("завтра до обеда", { day: "tomorrow", part: "before_lunch" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Айгуль, подготовь акт сверки по Альфе завтра до обеда",
          },
          {
            kind: "task",
            assignee_queries: ["Сакен"],
            assignee_name: "Сәкен Жумабаев",
            assignee_confidence: 0.97,
            group_id: null,
            title: "Закрыть наряды по третьему объекту",
            body: null,
            deadline: spokenTime("сегодня до вечера", { day: "today", part: "evening" }),
            priority: "high",
            scheduled_send: null,
            source_span: "Сакен, срочно закрой наряды по третьему объекту сегодня до вечера",
          },
          {
            kind: "points",
            assignee_queries: ["Ерлану Б."],
            assignee_name: "Ерлан Байжанов",
            assignee_confidence: 0.97,
            amount: 10,
            reason: "за вчерашнюю поставку",
            source_span: "Ерлану Б. плюс десять за вчерашнюю поставку",
          },
        ],
      },
    },
    // П3. Телеграфный стиль.
    {
      n: 3,
      user: "марат кп альфа завтра до обеда, ерлану б +10",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["марат"],
            assignee_name: "Марат Оспанов",
            assignee_confidence: 0.95,
            group_id: null,
            title: "КП по Альфе",
            body: null,
            deadline: spokenTime("завтра до обеда", { day: "tomorrow", part: "before_lunch" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "марат кп альфа завтра до обеда",
          },
          {
            kind: "points",
            assignee_queries: ["ерлану б"],
            assignee_name: "Ерлан Байжанов",
            assignee_confidence: 0.95,
            amount: 10,
            reason: null,
            source_span: "ерлану б +10",
          },
        ],
      },
    },
    // П4. Без исполнителя — null, не выдумывать.
    {
      n: 4,
      user: "Надо заказать щебень на третий объект до конца недели",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: [],
            assignee_name: null,
            assignee_confidence: 0,
            group_id: null,
            title: "Заказать щебень на третий объект",
            body: null,
            deadline: spokenTime("до конца недели", { part: "end_of_week" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Надо заказать щебень на третий объект до конца недели",
          },
        ],
      },
    },
    // П5. Неоднозначный дедлайн (low confidence).
    {
      n: 5,
      user: "Айгуль пусть на неделе закроет отчёты по командировкам",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["Айгуль"],
            assignee_name: "Айгуль Сапарова",
            assignee_confidence: 0.97,
            group_id: null,
            title: "Закрыть отчёты по командировкам",
            body: null,
            deadline: spokenTime("на неделе", { part: "this_week" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Айгуль пусть на неделе закроет отчёты по командировкам",
          },
        ],
      },
    },
    // П7. Казахские падежи и вставка казахского.
    {
      n: 7,
      user:
        "Сәкенге айт, объект бойынша фотоотчёт жіберсін бүгін кешке. " +
        "И Маратқа скажи, пусть перезвонит по тендеру",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["Сәкенге"],
            assignee_name: "Сәкен Жумабаев",
            assignee_confidence: 0.95,
            group_id: null,
            title: "Отправить фотоотчёт по объекту",
            body: null,
            deadline: spokenTime("бүгін кешке", { day: "today", part: "evening" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Сәкенге айт, объект бойынша фотоотчёт жіберсін бүгін кешке",
          },
          {
            kind: "task",
            assignee_queries: ["Маратқа"],
            assignee_name: "Марат Оспанов",
            assignee_confidence: 0.95,
            group_id: null,
            title: "Перезвонить по тендеру",
            body: null,
            deadline: null,
            priority: "normal",
            scheduled_send: null,
            source_span: "Маратқа скажи, пусть перезвонит по тендеру",
          },
        ],
      },
    },
    // П8. Два исполнителя → две копии с общим group_id.
    {
      n: 8,
      user: "Ерлану Б. и Марату подготовить площадку к приезду комиссии к понедельнику",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["Ерлану Б."],
            assignee_name: "Ерлан Байжанов",
            assignee_confidence: 0.97,
            group_id: "g1",
            title: "Подготовить площадку к приезду комиссии",
            body: null,
            deadline: spokenTime("к понедельнику", { day: "weekday", weekday: 1 }),
            priority: "normal",
            scheduled_send: null,
            source_span:
              "Ерлану Б. и Марату подготовить площадку к приезду комиссии к понедельнику",
          },
          {
            kind: "task",
            assignee_queries: ["Марату"],
            assignee_name: "Марат Оспанов",
            assignee_confidence: 0.97,
            group_id: "g1",
            title: "Подготовить площадку к приезду комиссии",
            body: null,
            deadline: spokenTime("к понедельнику", { day: "weekday", weekday: 1 }),
            priority: "normal",
            scheduled_send: null,
            source_span:
              "Ерлану Б. и Марату подготовить площадку к приезду комиссии к понедельнику",
          },
        ],
      },
    },
    // П9. Бытовые поручения: телеграф из двух слов, задача без имени (не reminder).
    {
      n: 9,
      // not «забери машину с мойки»: eval ev-05 says nearly that without a deadline, and the
      // model copied this example's 18:00 onto it — an example must not shadow a fixture
      user: "Тимур, отгони мою машину на мойку к вечеру. Жандос кофе. И кто-нибудь сходите за сигаретами",
      assistant: {
        entities: [
          {
            kind: "task",
            assignee_queries: ["Тимур"],
            assignee_name: "Тимур Салимов",
            assignee_confidence: 0.97,
            group_id: null,
            title: "Отогнать машину на мойку",
            body: null,
            deadline: spokenTime("к вечеру", { part: "evening" }),
            priority: "normal",
            scheduled_send: null,
            source_span: "Тимур, отгони мою машину на мойку к вечеру",
          },
          {
            kind: "task",
            assignee_queries: ["Жандос"],
            assignee_name: "Жандос Ермеков",
            assignee_confidence: 0.95,
            group_id: null,
            title: "Принести кофе",
            body: null,
            deadline: null,
            priority: "normal",
            scheduled_send: null,
            source_span: "Жандос кофе",
          },
          {
            kind: "task",
            assignee_queries: [],
            assignee_name: null,
            assignee_confidence: 0,
            group_id: null,
            title: "Сходить за сигаретами",
            body: null,
            deadline: null,
            priority: "normal",
            scheduled_send: null,
            source_span: "кто-нибудь сходите за сигаретами",
          },
        ],
      },
    },
  ],
};
