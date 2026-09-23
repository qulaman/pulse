import { describe, expect, it } from "vitest";

import {
  ALIAS_MAX,
  VOCABULARY_MAX,
  checkName,
  entryKey,
  mergeEntries,
  nameReport,
  ownersOf,
  planAliases,
  planWords,
  splitEntries,
  type RosterPerson,
} from "./dictionary";

const erlanB: RosterPerson = { id: "u1", full_name: "Ерлан Байжанов", aliases: ["Ерлан", "Ерлан Б."] };
const erlanD: RosterPerson = { id: "u2", full_name: "Ерлан Досов", aliases: ["Ерлан"] };
const marat: RosterPerson = { id: "u3", full_name: "Марат Оспанов", aliases: [] };
const aigul: RosterPerson = { id: "u4", full_name: "Айгуль Серикова", aliases: ["Айгуль", "Саша"] };
const alex: RosterPerson = { id: "u5", full_name: "Александр Ким", aliases: ["Саша"] };
const people = [erlanB, erlanD, marat, aigul, alex];

describe("entryKey", () => {
  it("ignores case, ё and punctuation", () => {
    expect(entryKey("Ерлан Б.")).toBe(entryKey("ерлан б"));
    expect(entryKey("Актобе-Склад")).toBe(entryKey("актобе-склад"));
    expect(entryKey("Семёнов")).toBe(entryKey("Семенов"));
  });
});

describe("splitEntries", () => {
  it("splits a typed list and a pasted spreadsheet column, dropping repeats and blanks", () => {
    expect(splitEntries("КазАзот, ERG;  Актобе-склад\nказазот\r\n\n\tКазхром  ")).toEqual([
      "КазАзот",
      "ERG",
      "Актобе-склад",
      "Казхром",
    ]);
  });

  it("collapses inner whitespace", () => {
    expect(splitEntries("Каз   Хром")).toEqual(["Каз Хром"]);
  });
});

describe("mergeEntries", () => {
  it("removes, then adds what is not there yet", () => {
    expect(mergeEntries(["A", "B"], ["b", "C"], ["a"], 10)).toEqual({ list: ["B", "C"], overflow: [] });
  });

  it("is idempotent: a replayed add or remove changes nothing", () => {
    const once = mergeEntries(["A"], ["B"], [], 10).list;
    expect(mergeEntries(once, ["B"], [], 10).list).toEqual(once);
    expect(mergeEntries(["A"], [], ["Z"], 10).list).toEqual(["A"]);
  });

  it("stops at the limit and reports the rest", () => {
    expect(mergeEntries(["A"], ["B", "C"], [], 2)).toEqual({ list: ["A", "B"], overflow: ["C"] });
  });
});

describe("ownersOf", () => {
  it("finds everybody who answers to a first name or an alias", () => {
    expect(ownersOf("саша", people).map((p) => p.id)).toEqual(["u4", "u5"]);
    expect(ownersOf("Марат", people).map((p) => p.id)).toEqual(["u3"]);
    expect(ownersOf("Ерлан", people, "u1").map((p) => p.id)).toEqual(["u2"]);
  });
});

describe("planWords", () => {
  it("adds new words and names what it skips", () => {
    const plan = planWords(["Казхром"], "казхром, КазАзот, Марат, Марат Оспанов", people);
    expect(plan.add).toEqual(["КазАзот"]);
    expect(plan.existing).toEqual(["казхром"]);
    expect(plan.names).toEqual([
      { entry: "Марат", person: "Марат Оспанов" },
      { entry: "Марат Оспанов", person: "Марат Оспанов" },
    ]);
  });

  it("refuses an overlong entry and anything past the limit", () => {
    const full = Array.from({ length: VOCABULARY_MAX - 1 }, (_, i) => `w${i}`);
    const plan = planWords(full, `ok, second, ${"x".repeat(61)}`, []);
    expect(plan.add).toEqual(["ok"]);
    expect(plan.overflow).toEqual(["second"]);
    expect(plan.tooLong).toHaveLength(1);
  });
});

describe("planAliases", () => {
  it("adds new forms and warns about the ones somebody else answers to", () => {
    const plan = planAliases(marat, "Маке, Саша", people);
    expect(plan.add).toEqual(["Маке", "Саша"]);
    expect(plan.shared).toEqual([{ entry: "Саша", people: ["Айгуль Серикова", "Александр Ким"] }]);
  });

  it("skips the full name, an existing form and a lone letter", () => {
    const plan = planAliases(erlanB, "Ерлан Байжанов, ерлан б, Е", people);
    expect(plan.add).toEqual([]);
    expect(plan.fullName).toBe(true);
    expect(plan.existing).toEqual(["ерлан б"]);
    expect(plan.tooShort).toEqual(["Е"]);
  });

  it("stops at the alias limit", () => {
    const busy = { ...marat, aliases: Array.from({ length: ALIAS_MAX }, (_, i) => `a${i}`) };
    expect(planAliases(busy, "Маке", people).overflow).toEqual(["Маке"]);
  });
});

describe("nameReport", () => {
  it("suggests the first name to a person without aliases", () => {
    expect(nameReport(marat, people)).toEqual({ suggestions: ["Марат"], shared: [] });
  });

  it("suggests the initial a namesake still lacks and names the shared first name", () => {
    expect(nameReport(erlanD, people)).toEqual({
      suggestions: ["Ерлан Д."],
      shared: [{ alias: "Ерлан", people: ["Ерлан Байжанов"] }],
    });
  });

  it("reports a nickname two people share", () => {
    expect(nameReport(alex, people).shared).toEqual([{ alias: "Саша", people: ["Айгуль Серикова"] }]);
  });
});

describe("checkName", () => {
  it("is sure on an exact alias, in any case form", () => {
    expect(checkName("Айгуль", people)).toEqual({ kind: "sure", person: "Айгуль Серикова" });
    expect(checkName("Ерлану Б.", people)).toEqual({ kind: "sure", person: "Ерлан Байжанов" });
  });

  it("asks who on a first name two people share — and no alias would help", () => {
    expect(checkName("Ерлану", people)).toEqual({ kind: "ask", people: ["Ерлан Байжанов", "Ерлан Досов"], teach: false });
  });

  it("asks who on a nickname two people answer to — giving it again changes nothing", () => {
    expect(checkName("Саша", people)).toEqual({ kind: "ask", people: ["Айгуль Серикова", "Александр Ким"], teach: false });
  });

  it("guesses with a «check» on a first name that is not an alias; the alias would settle it", () => {
    expect(checkName("Марату", people)).toEqual({ kind: "check", person: "Марат Оспанов", teach: true });
  });

  it("calls one weak candidate a guess to check, not a choice between people", () => {
    const smoke: RosterPerson = { id: "u9", full_name: "Смоук Тестов", aliases: ["Смоук"] };
    expect(checkName("Смоуша", [smoke])).toEqual({ kind: "check", person: "Смоук Тестов", teach: true });
  });

  it("gives up on a form nobody answers to, and says an alias would teach it", () => {
    expect(checkName("Жаке", people)).toEqual({ kind: "none", teach: true });
    expect(checkName("  ", people)).toBeNull();
  });
});
