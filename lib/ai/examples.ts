import type Anthropic from "@anthropic-ai/sdk";

import type { ModelParseResult } from "./schema";
import type { TimeRef } from "./timeref";

/**
 * Few-shot pairs П1–П12 (docs/AI.md §4), mapped onto the single demo roster
 * tests/stt/roster.json: Айгуль → u-005, Ерлан → u-001 (spoken as «Ерлану Б.», otherwise
 * the two Erlans are ambiguous), Марат → u-003, Сакен → u-004, Тимур → u-009, Жандос → u-010.
 * Context of every example: четверг, 13.08.2026 16:32 (+05:00), источник voice.
 * Nothing here may vary between requests — these messages are cached.
 * The examples teach the FORMAT, not a client's world: counterparties are the neutral
 * «Альфа», never a real partner of client №1 (code is client-agnostic, V-02).
 * Answers are in the model's form: names, not ids (D-56), times as TimeRefs — what was said,
 * nothing computed (task 026).
 */

/** A TimeRef as the model writes it: the words and what they name, no arithmetic. */
function ref(text: string, said: Partial<Omit<TimeRef, "text" | "confidence">>, confidence = 0.95): TimeRef {
  return { text, day: null, weekday: null, date: null, time: null, part: null, ...said, confidence };
}

export const FEW_SHOT: { user: string; assistant: ModelParseResult }[] = [
  // П1. Одиночная задача, явный дедлайн.
  {
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
          deadline: ref("к пятнице к трём часам", { day: "weekday", weekday: 5, time: "15:00" }),
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
          starts_at: ref("завтра в десять", { day: "tomorrow", time: "10:00" }),
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
          deadline: ref("завтра до обеда", { day: "tomorrow", part: "before_lunch" }),
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
          deadline: ref("сегодня до вечера", { day: "today", part: "evening" }),
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
          deadline: ref("завтра до обеда", { day: "tomorrow", part: "before_lunch" }),
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
          deadline: ref("до конца недели", { part: "end_of_week" }),
          priority: "normal",
          scheduled_send: null,
          source_span: "Надо заказать щебень на третий объект до конца недели",
        },
      ],
    },
  },
  // П5. Неоднозначный дедлайн (low confidence).
  {
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
          deadline: ref("на неделе", { part: "this_week" }),
          priority: "normal",
          scheduled_send: null,
          source_span: "Айгуль пусть на неделе закроет отчёты по командировкам",
        },
      ],
    },
  },
  // П6. Вопрос к системе.
  {
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
  // П7. Казахские падежи и вставка казахского.
  {
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
          deadline: ref("бүгін кешке", { day: "today", part: "evening" }),
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
          deadline: ref("к понедельнику", { day: "weekday", weekday: 1 }),
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
          deadline: ref("к понедельнику", { day: "weekday", weekday: 1 }),
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
          deadline: ref("к вечеру", { part: "evening" }),
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
  // П10. Заметка директора самому себе: ни исполнителя, ни времени (D-75).
  {
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
          deadline: ref("сегодня до шести", { day: "today", time: "18:00" }),
          priority: "normal",
          scheduled_send: null,
          source_span: "Марат, позвони Альфе сегодня до шести",
        },
      ],
    },
  },
  // П12. Мероприятие с участниками по именам, местом и явным напоминанием (D-78).
  {
    user: "Встреча с Альфой в четверг в три у них в офисе, идут Марат и Айгуль. Напомни за час",
    assistant: {
      entities: [
        {
          kind: "event",
          title: "Встреча с Альфой",
          location: "у них в офисе",
          starts_at: ref("в четверг в три", { day: "weekday", weekday: 4, time: "15:00" }),
          participant_names: ["Марат Оспанов", "Айгуль Сапарова"],
          everyone: false,
          source_span:
            "Встреча с Альфой в четверг в три у них в офисе, идут Марат и Айгуль. Напомни за час",
        },
      ],
    },
  },
];

/** Context line shared by every few-shot user turn (docs/AI.md §4). */
export const FEW_SHOT_CONTEXT = "Сейчас: четверг, 13.08.2026 16:32 (+05:00). Источник: voice.";

/**
 * Alternating user/assistant turns. The last assistant message carries the second
 * cache breakpoint, so system + roster + few-shot form one cached prefix (§9).
 */
export function fewShotMessages(): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  FEW_SHOT.forEach((pair, index) => {
    messages.push({
      role: "user",
      content: `${FEW_SHOT_CONTEXT}\n<input>\n${pair.user}\n</input>`,
    });
    const text = JSON.stringify(pair.assistant);
    messages.push({
      role: "assistant",
      content:
        index === FEW_SHOT.length - 1
          ? [{ type: "text", text, cache_control: { type: "ephemeral" } }]
          : [{ type: "text", text }],
    });
  });
  return messages;
}
