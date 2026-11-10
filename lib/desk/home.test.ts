import { describe, expect, it } from "vitest";

import type { BoardTask } from "@/lib/pulse/board";

import {
  asksDirector,
  dndChoices,
  etherLinesOf,
  freeAction,
  graceLine,
  meetingEndOf,
  messagesOf,
  myErrandsOf,
  newsWords,
  plainWords,
  shortWhen,
  topOf,
} from "./home";

// 2026-11-10 10:30 Aqtobe (UTC+5)
const NOW = new Date("2026-11-10T05:30:00Z");
const ME = "dir";

function task(id: string, extra: Partial<BoardTask> = {}): BoardTask {
  return {
    id,
    title: `Задача ${id}`,
    status: "accepted",
    author_id: ME,
    assignee_id: "emp",
    deadline: null,
    created_at: "2026-11-09T05:00:00Z",
    updated_at: "2026-11-09T06:00:00Z",
    assignee: { full_name: "Айгуль Нурланова" },
    author: { full_name: "Директор Тестов" },
    question: null,
    question_id: null,
    question_at: null,
    decline_reason: null,
    time_request: null,
    last_message: null,
    seen_seq: 0,
    ...extra,
  } as unknown as BoardTask;
}

function word(seq: number, sender: string, at: string, content = "готово, посмотрите") {
  return { id: `m${seq}`, content, type: "text", sender_id: sender, seq, created_at: at };
}

describe("shortWhen", () => {
  it("says the time today, «вчера» yesterday, the date further back", () => {
    expect(shortWhen(new Date("2026-11-10T04:14:00Z"), NOW)).toBe("09:14");
    expect(shortWhen(new Date("2026-11-09T12:00:00Z"), NOW)).toBe("вчера");
    expect(shortWhen(new Date("2026-10-21T12:00:00Z"), NOW)).toBe("21.10");
  });
});

describe("messagesOf", () => {
  it("takes what the phone's «Сообщения» counts: questions first, then requests for time, then words — the newest first", () => {
    const board = [
      task("old-word", { last_message: word(3, "emp", "2026-11-10T03:00:00Z"), seen_seq: 1 }),
      task("new-word", { last_message: word(5, "emp", "2026-11-10T05:00:00Z"), seen_seq: 0 }),
      task("asks", { question: "Какой подрядчик?", question_id: "q", question_at: "2026-11-10T01:00:00Z" }),
      task("time", { time_request: { id: "r", proposed: "2026-11-12T13:00:00Z", words: null, at: "2026-11-10T04:00:00Z", senderId: "emp" } }),
      task("calm"),
    ];
    const list = messagesOf(board, ME, NOW);
    expect(list.map((m) => `${m.kind}:${m.task.id}`)).toEqual(["question:asks", "request:time", "word:new-word", "word:old-word"]);
    expect(list[0]).toMatchObject({ text: "Какой подрядчик?", at: "2026-11-10T01:00:00Z", who: "Айгуль Нурланова" });
    expect(list[1].text).toMatch(/^просит срок /);
  });

  it("never counts the director's own word, a word already read, or a closed task", () => {
    const board = [
      task("mine", { last_message: word(4, ME, "2026-11-10T05:00:00Z") }),
      task("read", { last_message: word(2, "emp", "2026-11-10T05:00:00Z"), seen_seq: 2 }),
      task("closed", { status: "done", question: "Ещё актуально?", question_id: "q" }),
      task("own-request", { time_request: { id: "r", proposed: "2026-11-12T13:00:00Z", words: null, at: "2026-11-10T04:00:00Z", senderId: ME } }),
    ];
    expect(messagesOf(board, ME, NOW)).toEqual([]);
  });

  it("names whoever wrote: the author of the task when it is the author's word", () => {
    const board = [task("by-author", { author_id: "boss", last_message: word(3, "boss", "2026-11-10T05:00:00Z") })];
    expect(messagesOf(board, ME, NOW)[0].who).toBe("Директор Тестов");
  });

  it("a photo and a voice say what they are", () => {
    const board = [task("photo", { last_message: { ...word(3, "emp", "2026-11-10T05:00:00Z", ""), type: "photo", content: null } })];
    expect(messagesOf(board, ME, NOW)[0].text).toBe("фото");
  });

  it("«Прочитал все» takes only the plain words", () => {
    const list = messagesOf(
      [task("asks", { question: "Когда?", question_id: "q", question_at: "2026-11-10T01:00:00Z" }), task("w", { last_message: word(3, "emp", "2026-11-10T05:00:00Z") })],
      ME,
      NOW,
    );
    expect(plainWords(list).map((m) => m.task.id)).toEqual(["w"]);
  });
});

describe("etherLinesOf", () => {
  const announcements = [
    { id: "a-old", created_at: "2026-11-08T05:00:00Z" },
    { id: "a-new", created_at: "2026-11-10T04:00:00Z" },
    { id: "a-night", created_at: "2026-11-09T18:00:00Z" },
    { id: "a-later", created_at: "2026-11-09T19:00:00Z" },
  ];
  const news = [{ id: "n1", created_at: "2026-11-09T10:00:00Z" }];

  it("puts what waits for the window first — the soonest first — then everything else by time", () => {
    const held = { "a-later": "2026-11-11T03:30:00Z", "a-night": "2026-11-11T03:00:00Z" };
    const lines = etherLinesOf(announcements, news, held, NOW, 10);
    expect(lines.map((line) => `${line.kind}:${line.item.id}`)).toEqual(["announcement:a-night", "announcement:a-later", "announcement:a-new", "news:n1", "announcement:a-old"]);
    expect(lines[0]).toMatchObject({ until: "2026-11-11T03:00:00Z" });
    expect(lines[2]).toMatchObject({ until: null });
  });

  it("a moment already past no longer waits", () => {
    const lines = etherLinesOf(announcements, [], { "a-night": "2026-11-10T03:00:00Z" }, NOW, 10);
    expect(lines.find((line) => line.item.id === "a-night")).toMatchObject({ until: null });
    expect(lines[0].item.id).toBe("a-new");
  });

  it("keeps to the limit", () => {
    expect(etherLinesOf(announcements, news, undefined, NOW, 3)).toHaveLength(3);
    expect(etherLinesOf([], [], undefined, NOW, 4)).toEqual([]);
  });
});

describe("newsWords", () => {
  it("names a reward and the praise with its points", () => {
    expect(newsWords({ kind: "merch", title: "Обед", amount: 300 })).toEqual({ what: "награда из магазина «Обед»", points: null });
    expect(newsWords({ kind: "praise", title: "за объект", amount: 50 })).toEqual({ what: "за объект", points: 50 });
    expect(newsWords({ kind: "praise", title: "молодец", amount: null })).toEqual({ what: "молодец", points: null });
  });
});

describe("topOf", () => {
  it("is the five with points, in rank order", () => {
    const rows = [
      { id: "f", points: 10, rank: 6 },
      { id: "b", points: 80, rank: 2 },
      { id: "zero", points: 0, rank: 7 },
      { id: "a", points: 90, rank: 1 },
      { id: "c", points: 50, rank: 3 },
      { id: "d", points: 40, rank: 4 },
      { id: "e", points: 30, rank: 5 },
    ];
    expect(topOf(rows).map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(topOf([{ id: "zero", points: 0, rank: 1 }])).toEqual([]);
  });
});

describe("myErrandsOf", () => {
  const base = { author_id: ME, question: null, answer: null };
  it("keeps the director's live requests: the secretary's question first, then nobody's, then in hand, the oldest first", () => {
    const rows = [
      { ...base, id: "taken", status: "accepted", created_at: "2026-11-10T05:00:00Z" },
      { ...base, id: "waits-new", status: "sent", created_at: "2026-11-10T05:20:00Z" },
      { ...base, id: "waits-old", status: "sent", created_at: "2026-11-10T05:10:00Z" },
      { ...base, id: "asks", status: "accepted", created_at: "2026-11-10T05:25:00Z", question: "Какой чай?" },
      { ...base, id: "done", status: "done", created_at: "2026-11-10T04:00:00Z" },
      { ...base, id: "someone-else", author_id: "emp", status: "sent", created_at: "2026-11-10T04:00:00Z" },
    ];
    expect(myErrandsOf(rows, ME).map((row) => row.id)).toEqual(["asks", "waits-old", "waits-new", "taken"]);
  });

  it("an answered question no longer asks", () => {
    expect(asksDirector({ status: "accepted", question: "Какой чай?", answer: "Зелёный" })).toBe(false);
    expect(asksDirector({ status: "done", question: "Какой чай?", answer: null })).toBe(false);
    expect(asksDirector({ status: "sent", question: "Какой чай?", answer: null })).toBe(true);
  });
});

describe("graceLine", () => {
  it("says what goes and that it goes in five seconds", () => {
    expect(graceLine("Кофе", null)).toBe("Кофе · отправлю через 5 с");
    expect(graceLine("Кофе", "без сахара")).toBe("Кофе · без сахара · отправлю через 5 с");
  });

  it("a request in own words is the words alone", () => {
    const action = freeAction("Принеси документы из бухгалтерии на подпись");
    expect(graceLine(action.label, "Принеси документы из бухгалтерии на подпись")).toBe("Принеси документы из бухгалтерии на подпись · отправлю через 5 с");
  });

  it("says who is away after it", () => {
    expect(graceLine("Чай", null, "Айгуль не на месте до 14:00")).toBe("Чай · отправлю через 5 с · Айгуль не на месте до 14:00");
  });
});

describe("freeAction", () => {
  it("labels a request by its first five words", () => {
    expect(freeAction("  позвони   в банк и узнай про перевод сегодня ")).toEqual({ code: "free", label: "позвони в банк и узнай", icon: "" });
  });
});

describe("dndChoices / meetingEndOf", () => {
  it("offers the three spans, and the end of a meeting going on", () => {
    expect(dndChoices(null, NOW).map((choice) => choice.untilMin)).toEqual([30, 60, 120]);
    const end = "2026-11-10T06:00:00Z"; // 11:00 Aqtobe, half an hour ahead
    const choices = dndChoices(end, NOW);
    expect(choices.at(-1)).toEqual({ key: "meeting", label: "До конца встречи, до 11:00", untilMin: 30, note: "на встречу" });
  });

  it("a meeting ending within five minutes is not offered", () => {
    expect(dndChoices("2026-11-10T05:33:00Z", NOW)).toHaveLength(3);
  });

  it("finds the meeting on now; one with no end lasts an hour; a cancelled one is not on", () => {
    expect(meetingEndOf([{ starts_at: "2026-11-10T05:00:00Z", ends_at: "2026-11-10T06:00:00Z", cancelled_at: null }], NOW)).toBe("2026-11-10T06:00:00.000Z");
    expect(meetingEndOf([{ starts_at: "2026-11-10T05:00:00Z", ends_at: null, cancelled_at: null }], NOW)).toBe("2026-11-10T06:00:00.000Z");
    expect(meetingEndOf([{ starts_at: "2026-11-10T05:00:00Z", ends_at: "2026-11-10T06:00:00Z", cancelled_at: "2026-11-10T04:00:00Z" }], NOW)).toBeNull();
    expect(meetingEndOf([{ starts_at: "2026-11-10T07:00:00Z", ends_at: null, cancelled_at: null }], NOW)).toBeNull();
  });
});
