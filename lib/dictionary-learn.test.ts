import { describe, expect, it } from "vitest";

import type { RosterPerson } from "./dictionary";
import { collectMisheard, correctionsIn, lessonOf, misheardKey } from "./dictionary-learn";

const erlanB: RosterPerson = { id: "u1", full_name: "Ерлан Байжанов", aliases: ["Ерлан", "Ерлан Б."] };
const erlanD: RosterPerson = { id: "u2", full_name: "Ерлан Досов", aliases: ["Ерлан", "Ерлан Д."] };
const marat: RosterPerson = { id: "u3", full_name: "Марат Оспанов", aliases: [] };
const zhandos: RosterPerson = { id: "u4", full_name: "Жандос Сериков", aliases: ["Жандос"] };
const aigul: RosterPerson = { id: "u5", full_name: "Айгуль Серикова", aliases: ["Айгуль"] };
const people = [erlanB, erlanD, marat, zhandos, aigul];

const unmatched = { status: "unmatched", flag: "check" } as const;
const sure = { status: "matched", flag: "ok" } as const;

describe("lessonOf", () => {
  it("remembers a form nobody answers to on the person the director chose", () => {
    expect(lessonOf({ queries: ["Жаке"], match: unmatched }, "u4", people)).toBe("Жаке");
  });

  it("turns a case of the person's own first name into the first name", () => {
    expect(lessonOf({ queries: ["Марату"], match: { status: "matched", flag: "check" } }, "u3", people)).toBe("Марат");
  });

  it("learns nothing when the matcher was sure — the director changed their mind", () => {
    expect(lessonOf({ queries: ["Жаке"], match: sure }, "u4", people)).toBeNull();
  });

  it("learns nothing from a bare first name two people share", () => {
    expect(lessonOf({ queries: ["Ерлану"], match: { status: "ambiguous", flag: "check" } }, "u1", people)).toBeNull();
  });

  it("learns nothing from a form somebody else answers to", () => {
    expect(lessonOf({ queries: ["Айгуль"], match: unmatched }, "u4", people)).toBeNull();
  });

  it("learns nothing the person answers to already, nor their full name, nor an empty mention", () => {
    expect(lessonOf({ queries: ["Жандос"], match: unmatched }, "u4", people)).toBeNull();
    expect(lessonOf({ queries: ["Жандос Сериков"], match: unmatched }, "u4", people)).toBeNull();
    expect(lessonOf({ queries: [], match: unmatched }, "u4", people)).toBeNull();
  });
});

const task = (over: Record<string, unknown>) => ({
  kind: "task",
  title: "Отчёт",
  source_span: "Жаке, сделай отчёт",
  assignee_queries: ["Жаке"],
  assignee_id: null,
  ...over,
});

describe("correctionsIn", () => {
  it("finds the card whose person the director changed, by phrase and heard names", () => {
    const parsed = [
      { kind: "announcement", text: "Все на планёрку", source_span: "всем на планёрку" },
      task({ assignee: unmatched }),
    ];
    const confirmed = [task({ assignee_id: "u4", title: "Отчёт за неделю" })];
    expect(correctionsIn(parsed, confirmed)).toEqual([{ heard: { queries: ["Жаке"], match: unmatched }, personId: "u4" }]);
  });

  it("ignores cards whose person stayed, and copies of one phrase stay apart", () => {
    const span = "Ерлану и Марату отчёт";
    const parsed = [
      task({ source_span: span, assignee_queries: ["Ерлану"], assignee_id: "u1", assignee: sure }),
      task({ source_span: span, assignee_queries: ["Марату"], assignee_id: null, assignee: unmatched }),
    ];
    const confirmed = [
      task({ source_span: span, assignee_queries: ["Ерлану"], assignee_id: "u1" }),
      task({ source_span: span, assignee_queries: ["Марату"], assignee_id: "u3" }),
    ];
    expect(correctionsIn(parsed, confirmed).map((c) => c.personId)).toEqual(["u3"]);
  });

  it("survives junk", () => {
    expect(correctionsIn(null, [task({})])).toEqual([]);
    expect(correctionsIn([task({})], [null, 1, { kind: "note" }])).toEqual([]);
  });
});

describe("collectMisheard", () => {
  const batch = (at: string, personId = "u4", queries = ["Жаке"]) => ({
    created_at: at,
    parsed_entities: [task({ assignee_queries: queries, assignee: unmatched })],
    confirmed_entities: [task({ assignee_queries: queries, assignee_id: personId })],
  });

  it("counts a lesson across batches, most frequent first, latest time kept", () => {
    const rows = [batch("2026-09-20T10:00:00Z"), batch("2026-09-22T10:00:00Z"), batch("2026-09-21T10:00:00Z", "u3", ["Марату"])];
    expect(collectMisheard(rows, people, undefined, [])).toEqual([
      { key: misheardKey("u4", "Жаке"), form: "Жаке", personId: "u4", fullName: "Жандос Сериков", times: 2, lastAt: "2026-09-22T10:00:00Z" },
      { key: misheardKey("u3", "Марат"), form: "Марат", personId: "u3", fullName: "Марат Оспанов", times: 1, lastAt: "2026-09-21T10:00:00Z" },
    ]);
  });

  it("drops what «×» hid and what has been remembered since", () => {
    const rows = [batch("2026-09-20T10:00:00Z")];
    expect(collectMisheard(rows, people, undefined, [misheardKey("u4", "жаке")])).toEqual([]);
    const remembered = people.map((p) => (p.id === "u4" ? { ...p, aliases: [...p.aliases, "Жаке"] } : p));
    expect(collectMisheard(rows, remembered, undefined, [])).toEqual([]);
  });
});
