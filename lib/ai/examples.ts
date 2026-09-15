import type Anthropic from "@anthropic-ai/sdk";

import type { ParseResult } from "./schema";

/**
 * Few-shot pairs П1–П8 (docs/AI.md §4), mapped onto the single demo roster
 * tests/stt/roster.json: Айгуль → u-005, Ерлан → u-001 (spoken as «Ерлану Б.», otherwise
 * the two Erlans are ambiguous), Марат → u-003, Сакен → u-004.
 * Context of every example: четверг, 13.08.2026 16:32 (+05:00), источник voice.
 * Nothing here may vary between requests — these messages are cached.
 */
export const FEW_SHOT: { user: string; assistant: ParseResult }[] = [
  // П1. Одиночная задача, явный дедлайн.
  {
    user: "Марат, подготовь коммерческое предложение по Казхрому к пятнице к трём часам",
    assistant: {
      entities: [
        {
          kind: "task",
          assignee_queries: ["Марат"],
          assignee_id: "u-003",
          assignee_confidence: 0.98,
          group_id: null,
          title: "Подготовить КП по Казхрому",
          body: null,
          deadline_iso: "2026-08-14T15:00:00+05:00",
          deadline_confidence: 0.95,
          deadline_source_text: "к пятнице к трём часам",
          priority: "normal",
          scheduled_send_at: null,
          source_span:
            "Марат, подготовь коммерческое предложение по Казхрому к пятнице к трём часам",
        },
      ],
    },
  },
  // П2. Мульти-сущность: объявление + 2 задачи + очки.
  {
    user:
      "Так, всем: завтра в десять общее собрание в офисе, не опаздывать. " +
      "Айгуль, подготовь акт сверки по Казхрому завтра до обеда. " +
      "Сакен, срочно закрой наряды по третьему объекту сегодня до вечера. " +
      "И Ерлану Б. плюс десять за вчерашнюю поставку",
    assistant: {
      entities: [
        {
          kind: "announcement",
          text: "Завтра в 10:00 общее собрание в офисе, не опаздывать",
          source_span: "всем: завтра в десять общее собрание в офисе, не опаздывать",
        },
        {
          kind: "task",
          assignee_queries: ["Айгуль"],
          assignee_id: "u-005",
          assignee_confidence: 0.97,
          group_id: null,
          title: "Подготовить акт сверки по Казхрому",
          body: null,
          deadline_iso: "2026-08-14T13:00:00+05:00",
          deadline_confidence: 0.7,
          deadline_source_text: "завтра до обеда",
          priority: "normal",
          scheduled_send_at: null,
          source_span: "Айгуль, подготовь акт сверки по Казхрому завтра до обеда",
        },
        {
          kind: "task",
          assignee_queries: ["Сакен"],
          assignee_id: "u-004",
          assignee_confidence: 0.97,
          group_id: null,
          title: "Закрыть наряды по третьему объекту",
          body: null,
          deadline_iso: "2026-08-13T18:00:00+05:00",
          deadline_confidence: 0.7,
          deadline_source_text: "сегодня до вечера",
          priority: "high",
          scheduled_send_at: null,
          source_span: "Сакен, срочно закрой наряды по третьему объекту сегодня до вечера",
        },
        {
          kind: "points",
          assignee_queries: ["Ерлану Б."],
          assignee_id: "u-001",
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
    user: "марат кп казхром завтра до обеда, ерлану б +10",
    assistant: {
      entities: [
        {
          kind: "task",
          assignee_queries: ["марат"],
          assignee_id: "u-003",
          assignee_confidence: 0.95,
          group_id: null,
          title: "КП по Казхрому",
          body: null,
          deadline_iso: "2026-08-14T13:00:00+05:00",
          deadline_confidence: 0.7,
          deadline_source_text: "завтра до обеда",
          priority: "normal",
          scheduled_send_at: null,
          source_span: "марат кп казхром завтра до обеда",
        },
        {
          kind: "points",
          assignee_queries: ["ерлану б"],
          assignee_id: "u-001",
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
          assignee_id: null,
          assignee_confidence: 0,
          group_id: null,
          title: "Заказать щебень на третий объект",
          body: null,
          deadline_iso: "2026-08-14T18:00:00+05:00",
          deadline_confidence: 0.6,
          deadline_source_text: "до конца недели",
          priority: "normal",
          scheduled_send_at: null,
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
          assignee_id: "u-005",
          assignee_confidence: 0.97,
          group_id: null,
          title: "Закрыть отчёты по командировкам",
          body: null,
          deadline_iso: "2026-08-14T18:00:00+05:00",
          deadline_confidence: 0.5,
          deadline_source_text: "на неделе",
          priority: "normal",
          scheduled_send_at: null,
          source_span: "Айгуль пусть на неделе закроет отчёты по командировкам",
        },
      ],
    },
  },
  // П6. Вопрос к системе.
  {
    user: "Что там по Казхрому и кто сегодня не отчитался?",
    assistant: {
      entities: [
        {
          kind: "query",
          question: "Что там по Казхрому и кто сегодня не отчитался?",
          source_span: "Что там по Казхрому и кто сегодня не отчитался?",
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
          assignee_id: "u-004",
          assignee_confidence: 0.95,
          group_id: null,
          title: "Отправить фотоотчёт по объекту",
          body: null,
          deadline_iso: "2026-08-13T18:00:00+05:00",
          deadline_confidence: 0.7,
          deadline_source_text: "бүгін кешке",
          priority: "normal",
          scheduled_send_at: null,
          source_span: "Сәкенге айт, объект бойынша фотоотчёт жіберсін бүгін кешке",
        },
        {
          kind: "task",
          assignee_queries: ["Маратқа"],
          assignee_id: "u-003",
          assignee_confidence: 0.95,
          group_id: null,
          title: "Перезвонить по тендеру",
          body: null,
          deadline_iso: null,
          deadline_confidence: null,
          deadline_source_text: null,
          priority: "normal",
          scheduled_send_at: null,
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
          assignee_id: "u-001",
          assignee_confidence: 0.97,
          group_id: "g1",
          title: "Подготовить площадку к приезду комиссии",
          body: null,
          deadline_iso: "2026-08-17T09:00:00+05:00",
          deadline_confidence: 0.6,
          deadline_source_text: "к понедельнику",
          priority: "normal",
          scheduled_send_at: null,
          source_span:
            "Ерлану Б. и Марату подготовить площадку к приезду комиссии к понедельнику",
        },
        {
          kind: "task",
          assignee_queries: ["Марату"],
          assignee_id: "u-003",
          assignee_confidence: 0.97,
          group_id: "g1",
          title: "Подготовить площадку к приезду комиссии",
          body: null,
          deadline_iso: "2026-08-17T09:00:00+05:00",
          deadline_confidence: 0.6,
          deadline_source_text: "к понедельнику",
          priority: "normal",
          scheduled_send_at: null,
          source_span:
            "Ерлану Б. и Марату подготовить площадку к приезду комиссии к понедельнику",
        },
      ],
    },
  },
  // П9. Бытовые поручения: телеграф из двух слов, задача без имени (не reminder).
  {
    user: "Тимур, забери мою машину с мойки к вечеру. Жандос кофе. И кто-нибудь сходите за сигаретами",
    assistant: {
      entities: [
        {
          kind: "task",
          assignee_queries: ["Тимур"],
          assignee_id: "u-009",
          assignee_confidence: 0.97,
          group_id: null,
          title: "Забрать машину с мойки",
          body: null,
          deadline_iso: "2026-08-13T18:00:00+05:00",
          deadline_confidence: 0.7,
          deadline_source_text: "к вечеру",
          priority: "normal",
          scheduled_send_at: null,
          source_span: "Тимур, забери мою машину с мойки к вечеру",
        },
        {
          kind: "task",
          assignee_queries: ["Жандос"],
          assignee_id: "u-010",
          assignee_confidence: 0.95,
          group_id: null,
          title: "Принести кофе",
          body: null,
          deadline_iso: null,
          deadline_confidence: null,
          deadline_source_text: null,
          priority: "normal",
          scheduled_send_at: null,
          source_span: "Жандос кофе",
        },
        {
          kind: "task",
          assignee_queries: [],
          assignee_id: null,
          assignee_confidence: 0,
          group_id: null,
          title: "Сходить за сигаретами",
          body: null,
          deadline_iso: null,
          deadline_confidence: null,
          deadline_source_text: null,
          priority: "normal",
          scheduled_send_at: null,
          source_span: "кто-нибудь сходите за сигаретами",
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
