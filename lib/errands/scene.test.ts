import { describe, expect, it } from "vitest";

import type { Errand } from "@/lib/errands/queries";
import {
  askedDetails,
  daypartOf,
  deskFocus,
  deskLine,
  isQuick,
  justDone,
  justThanked,
  quickStreak,
  sceneOf,
  sceneOfAction,
  todayTally,
  urgencyOf,
} from "@/lib/errands/scene";

const AIGUL = "10000000-0000-0000-0000-000000000008";
const MARAT = "10000000-0000-0000-0000-000000000002";

function errand(patch: Partial<Errand> = {}): Errand {
  return {
    id: "e1",
    company_id: "c1",
    author_id: "d1",
    kind: "coffee",
    label: "Кофе",
    note: null,
    status: "sent",
    claimed_by: null,
    decline_reason: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    client_request_id: null,
    escalated_at: null,
    thanked_at: null,
    created_at: "2026-09-23T09:00:00Z",
    accepted_at: null,
    done_at: null,
    updated_at: "2026-09-23T09:00:00Z",
    claimed: null,
    author: { full_name: "Директор Демо" },
    ...patch,
  } as Errand;
}

describe("sceneOf", () => {
  it("reads the default buttons by their code, whatever the label became", () => {
    expect(sceneOf({ kind: "coffee", label: "Кофе с молоком" })).toBe("coffee");
    expect(sceneOf({ kind: "tea", label: "Чай" })).toBe("tea");
    expect(sceneOf({ kind: "dnd", label: "Не беспокоить" })).toBe("dnd");
    expect(sceneOf({ kind: "guest", label: "Пригласи гостя" })).toBe("guest");
    expect(sceneOf({ kind: "doctor", label: "Врач" })).toBe("doctor");
    expect(sceneOf({ kind: "come", label: "Зайди ко мне" })).toBe("come");
  });

  it("reads a button the director added by the words of its label", () => {
    expect(sceneOf({ kind: "kapuchino", label: "Капучино" })).toBe("coffee");
    expect(sceneOf({ kind: "chayku", label: "Чайку зелёного" })).toBe("tea");
    expect(sceneOf({ kind: "tishina", label: "Никого не пускать" })).toBe("dnd");
    expect(sceneOf({ kind: "posetitel", label: "Позови посетителя" })).toBe("guest");
    expect(sceneOf({ kind: "voda", label: "Воды" })).toBe("water");
    expect(sceneOf({ kind: "taxi", label: "Такси" })).toBe("taxi");
    expect(sceneOf({ kind: "voditel", label: "Водителя к подъезду" })).toBe("taxi");
    expect(sceneOf({ kind: "raspechatat", label: "Распечатать договор" })).toBe("print");
    expect(sceneOf({ kind: "obed", label: "Обед" })).toBe("lunch");
    expect(sceneOf({ kind: "kurer", label: "Курьер" })).toBe("courier");
    expect(sceneOf({ kind: "peregovornaya", label: "Переговорную" })).toBe("meeting");
  });

  it("does not take a word for a scene by a part in the middle of it", () => {
    // «начальник» holds «ча», «водитель» is not water
    expect(sceneOf({ kind: "boss", label: "Позвать начальника цеха" })).toBe("other");
    expect(sceneOf({ kind: "zamok", label: "Замок на двери" })).toBe("other");
  });

  it("takes the scene the director chose for the button first", () => {
    const catalogue = [{ code: "kofe", label: "Кофе", icon: "", synonyms: [], scene: "tea" as const }];
    expect(sceneOf({ kind: "kofe", label: "Кофе" }, catalogue)).toBe("tea");
    expect(sceneOfAction(catalogue[0]!)).toBe("tea");
    expect(sceneOfAction({ code: "", label: "Такси" })).toBe("taxi");
  });
});

describe("deskFocus", () => {
  it("rests when nothing is alive", () => {
    expect(deskFocus([errand({ status: "done", claimed_by: AIGUL })], AIGUL)).toEqual({ scene: null, phase: "rest", errand: null, queue: 0 });
  });

  it("calls for the request that has waited longest, the rest wait as «+N»", () => {
    const older = errand({ id: "a", kind: "tea", label: "Чай", created_at: "2026-09-23T09:00:00Z" });
    const newer = errand({ id: "b", kind: "guest", label: "Пригласи гостя", created_at: "2026-09-23T09:05:00Z" });
    const doing = errand({ id: "c", status: "accepted", claimed_by: AIGUL });
    const focus = deskFocus([newer, doing, older], AIGUL);
    expect(focus).toMatchObject({ phase: "asked", scene: "tea", queue: 1 });
    expect(focus.errand?.id).toBe("a");
  });

  it("acts out the secretary's own job, never somebody else's", () => {
    const theirs = errand({ id: "a", status: "accepted", claimed_by: MARAT, kind: "tea", label: "Чай" });
    const mine = errand({ id: "b", status: "accepted", claimed_by: AIGUL });
    expect(deskFocus([theirs, mine], AIGUL)).toMatchObject({ scene: "coffee", phase: "doing" });
    expect(deskFocus([theirs], AIGUL)).toMatchObject({ scene: null, phase: "rest" });
  });

  it("on the director's desk acts out anybody's job", () => {
    const theirs = errand({ id: "a", status: "accepted", claimed_by: MARAT, kind: "tea", label: "Чай" });
    expect(deskFocus([theirs], null)).toMatchObject({ scene: "tea", phase: "doing" });
  });

  it("keeps «не беспокоить» under a job, and guards the door whoever took it", () => {
    const dnd = errand({ id: "a", status: "accepted", claimed_by: MARAT, kind: "dnd", label: "Не беспокоить", created_at: "2026-09-23T09:10:00Z" });
    const coffee = errand({ id: "b", status: "accepted", claimed_by: AIGUL, created_at: "2026-09-23T09:00:00Z" });
    expect(deskFocus([dnd, coffee], AIGUL)).toMatchObject({ scene: "coffee", phase: "doing" });
    expect(deskFocus([dnd], AIGUL)).toMatchObject({ scene: "dnd", phase: "doing" });
  });
});

describe("justDone and justThanked", () => {
  it("finishes once for this secretary's own «Готово»", () => {
    const before = [errand({ status: "accepted", claimed_by: AIGUL })];
    const after = [errand({ status: "done", claimed_by: AIGUL })];
    expect(justDone(before, after, AIGUL)?.id).toBe("e1");
    expect(justDone(after, after, AIGUL)).toBeNull();
    expect(justDone(before, after, MARAT)).toBeNull();
    expect(justDone(before, after, null)?.id).toBe("e1");
  });

  it("does not finish a declined or cancelled request", () => {
    const before = [errand({ status: "accepted", claimed_by: AIGUL })];
    expect(justDone(before, [errand({ status: "cancelled", claimed_by: AIGUL })], AIGUL)).toBeNull();
  });

  it("hears the director's thank-you once, only for the secretary's own job", () => {
    const before = [errand({ status: "done", claimed_by: AIGUL })];
    const after = [errand({ status: "done", claimed_by: AIGUL, thanked_at: "2026-09-23T09:03:00Z" })];
    expect(justThanked(before, after, AIGUL)?.id).toBe("e1");
    expect(justThanked(after, after, AIGUL)).toBeNull();
    expect(justThanked(before, after, MARAT)).toBeNull();
    // the first read of the list is not news
    expect(justThanked([], after, AIGUL)).toBeNull();
  });
});

describe("urgencyOf", () => {
  const asked = errand({ created_at: "2026-09-23T09:00:00Z" });
  it("calls calmly at first, harder after a minute, runs once the repeat push is due", () => {
    expect(urgencyOf(asked, new Date("2026-09-23T09:00:30Z"), 3)).toBe(0);
    expect(urgencyOf(asked, new Date("2026-09-23T09:01:10Z"), 3)).toBe(1);
    expect(urgencyOf(asked, new Date("2026-09-23T09:03:00Z"), 3)).toBe(2);
    expect(urgencyOf({ ...asked, escalated_at: "2026-09-23T09:00:40Z" }, new Date("2026-09-23T09:00:45Z"), 3)).toBe(2);
  });

  it("is quiet for anything that is not calling", () => {
    expect(urgencyOf(null, new Date(), 3)).toBe(0);
    expect(urgencyOf({ ...asked, status: "accepted" }, new Date("2026-09-23T09:10:00Z"), 3)).toBe(0);
  });
});

describe("daypartOf", () => {
  const window = { from: "08:00", to: "21:00" };
  // Aqtobe is UTC+5: 03:30Z is 08:30 there
  it("tells the time of day by the office clock", () => {
    expect(daypartOf(new Date("2026-09-23T03:30:00Z"), window)).toBe("morning");
    expect(daypartOf(new Date("2026-09-23T07:00:00Z"), window)).toBe("day");
    expect(daypartOf(new Date("2026-09-23T14:00:00Z"), window)).toBe("evening");
    expect(daypartOf(new Date("2026-09-23T16:30:00Z"), window)).toBe("night");
    expect(daypartOf(new Date("2026-09-23T01:00:00Z"), window)).toBe("night");
  });
});

describe("todayTally and the quick streak", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const catalogue = [
    { code: "coffee", label: "Кофе", icon: "☕", synonyms: [] },
    { code: "tea", label: "Чай", icon: "🍵", synonyms: [] },
  ];
  const done = (id: string, kind: string, askedAt: string, doneAt: string, who = AIGUL) =>
    errand({ id, kind, label: kind === "tea" ? "Чай" : "Кофе", status: "done", claimed_by: who, created_at: askedAt, done_at: doneAt });

  it("counts what this secretary closed today, by button, with the average wait", () => {
    const rows = [
      done("a", "coffee", "2026-09-23T08:00:00Z", "2026-09-23T08:02:00Z"),
      done("b", "coffee", "2026-09-23T09:00:00Z", "2026-09-23T09:04:00Z"),
      done("c", "tea", "2026-09-23T09:10:00Z", "2026-09-23T09:13:00Z"),
      done("d", "tea", "2026-09-23T09:20:00Z", "2026-09-23T09:21:00Z", MARAT),
      // yesterday in Aqtobe
      done("e", "coffee", "2026-09-22T17:00:00Z", "2026-09-22T17:01:00Z"),
    ];
    expect(todayTally(rows, AIGUL, now, catalogue)).toEqual({
      items: [
        { kind: "coffee", label: "Кофе", icon: "☕", count: 2 },
        { kind: "tea", label: "Чай", icon: "🍵", count: 1 },
      ],
      averageMin: 3,
      total: 3,
    });
  });

  it("counts quick jobs in a row, the newest first", () => {
    const rows = [
      done("a", "coffee", "2026-09-23T08:00:00Z", "2026-09-23T08:05:00Z"),
      done("b", "coffee", "2026-09-23T09:00:00Z", "2026-09-23T09:01:00Z"),
      done("c", "tea", "2026-09-23T09:10:00Z", "2026-09-23T09:11:30Z"),
    ];
    expect(isQuick(rows[2]!)).toBe(true);
    expect(isQuick(rows[0]!)).toBe(false);
    expect(quickStreak(rows, AIGUL, now)).toBe(2);
  });
});

describe("deskLine", () => {
  it("says the moment in a few words, without gender", () => {
    expect(deskLine({ scene: null, phase: "rest", errand: null, queue: 0 })).toBe("Заявок нет — на месте");
    const guest = errand({ kind: "guest", label: "Пригласи гостя", created_at: "2026-09-23T09:00:00Z" });
    expect(deskLine({ scene: "guest", phase: "asked", errand: guest, queue: 0 })).toBe("Директор просит: пригласи гостя");
    expect(askedDetails({ scene: "guest", phase: "asked", errand: guest, queue: 2 }, new Date("2026-09-23T09:02:30Z"))).toBe("ждёт 2 мин · ещё 2");
    expect(askedDetails({ scene: "guest", phase: "asked", errand: guest, queue: 0 }, new Date("2026-09-23T09:00:20Z"))).toBe("");
    expect(deskLine({ scene: "guest", phase: "doing", errand: guest, queue: 0 })).toBe("Приглашаю гостя в кабинет");
    expect(deskLine({ scene: "coffee", phase: "done", errand: errand(), queue: 0 })).toBe("Готово · кофе");
    expect(deskLine({ scene: "taxi", phase: "doing", errand: errand({ kind: "taxi", label: "Такси" }), queue: 0 })).toBe("Вызываю машину");
    const other = errand({ kind: "zamok", label: "Замок" });
    expect(deskLine({ scene: "other", phase: "doing", errand: other, queue: 0 })).toBe("В работе: замок");
  });
});
