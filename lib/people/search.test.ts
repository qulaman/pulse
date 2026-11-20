import { describe, expect, it } from "vitest";

import { fits, foldRu, personFits, searchPeople, textHas } from "./search";

const people = [
  { id: "e1", full_name: "Ерлан Бекмуханов", position: "Прораб", aliases: ["Ерик"] },
  { id: "e2", full_name: "Ерлан Досанов", position: "Водитель", aliases: null },
  { id: "m1", full_name: "Марат Оспанов", position: "Бухгалтер", aliases: [] },
  { id: "d1", full_name: "Дина Ким", position: null },
  { id: "s1", full_name: "Семён Ли", position: null },
];

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("searchPeople", () => {
  it("is everybody for an empty query, in the given order", () => {
    expect(ids(searchPeople(people, "  "))).toEqual(["e1", "e2", "m1", "d1", "s1"]);
    expect(ids(searchPeople(people, "", 2))).toEqual(["e1", "e2"]);
  });

  it("finds by the start of a name word, both words, the position", () => {
    expect(ids(searchPeople(people, "ер"))).toEqual(["e1", "e2"]);
    expect(ids(searchPeople(people, "ер б"))).toEqual(["e1"]);
    expect(ids(searchPeople(people, "бух"))).toEqual(["m1"]);
    expect(ids(searchPeople(people, "оспан"))).toEqual(["m1"]);
  });

  it("does not match the middle of a word", () => {
    expect(searchPeople(people, "лан")).toHaveLength(0);
  });

  it("finds by a nickname", () => {
    expect(ids(searchPeople(people, "ерик"))).toEqual(["e1"]);
  });

  it("finds a name in another case", () => {
    expect(ids(searchPeople(people, "Дине"))).toEqual(["d1"]);
    expect(ids(searchPeople(people, "ерлану досанову"))).toEqual(["e2"]);
  });

  it("reads ё as е and ignores case", () => {
    expect(ids(searchPeople(people, "СЕМЕН"))).toEqual(["s1"]);
    expect(foldRu("Семён")).toBe("семен");
  });

  it("puts a first-name match before a surname one", () => {
    const more = [...people, { id: "x1", full_name: "Айгуль Динова", position: null }];
    expect(ids(searchPeople(more, "дин"))).toEqual(["d1", "x1"]);
  });

  it("stops at the limit", () => {
    expect(ids(searchPeople(people, "ер", 1))).toEqual(["e1"]);
  });
});

describe("fits", () => {
  it("takes a beginning, a longer typed word and a changed last letter", () => {
    expect(fits("ер", "ерлан")).toBe(true);
    expect(fits("ерлану", "ерлан")).toBe(true);
    expect(fits("дине", "дина")).toBe(true);
    expect(fits("ли", "лидия")).toBe(true);
    expect(fits("лан", "ерлан")).toBe(false);
  });
});

describe("personFits", () => {
  it("is the same rule for one person, and true for an empty query", () => {
    expect(personFits(people[0], "ер бек")).toBe(true);
    expect(personFits(people[0], "прораб")).toBe(true);
    expect(personFits(people[0], "лан")).toBe(false);
    expect(personFits(people[0], " ")).toBe(true);
  });
});

describe("textHas", () => {
  it("finds every typed word inside the texts, a piece of a word too", () => {
    expect(textHas(["Ерлан Бекмуханов", null, "Прораб"], "лан пРо")).toBe(true);
    expect(textHas(["Семён Ли", "+7 777 123"], "семен 777")).toBe(true);
    expect(textHas(["Семён Ли"], "семен марат")).toBe(false);
    expect(textHas(["Семён Ли"], "  ")).toBe(true);
  });
});
