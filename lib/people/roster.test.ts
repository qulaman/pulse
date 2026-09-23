import { describe, expect, it } from "vitest";

import { firstNameOf, foldRu, initialsOf, searchPeople } from "./roster";

const PEOPLE = [
  { full_name: "Ерлан Бекмуханов", position: "Прораб" },
  { full_name: "Ерлан Досанов", position: "Водитель" },
  { full_name: "Семён Ким", position: "Бухгалтер" },
  { full_name: "Марат Оспанов", position: null },
];

describe("searchPeople", () => {
  it("keeps everybody for an empty query", () => {
    expect(searchPeople(PEOPLE, "  ")).toHaveLength(4);
  });

  it("finds by the start of any word of the name or the position", () => {
    expect(searchPeople(PEOPLE, "ер").map((p) => p.full_name)).toEqual(["Ерлан Бекмуханов", "Ерлан Досанов"]);
    expect(searchPeople(PEOPLE, "ер б").map((p) => p.full_name)).toEqual(["Ерлан Бекмуханов"]);
    expect(searchPeople(PEOPLE, "бух").map((p) => p.full_name)).toEqual(["Семён Ким"]);
    expect(searchPeople(PEOPLE, "оспан").map((p) => p.full_name)).toEqual(["Марат Оспанов"]);
  });

  it("does not match the middle of a word", () => {
    expect(searchPeople(PEOPLE, "лан")).toHaveLength(0);
  });

  it("reads ё as е and ignores case", () => {
    expect(searchPeople(PEOPLE, "СЕМЕН").map((p) => p.full_name)).toEqual(["Семён Ким"]);
    expect(foldRu("Семён")).toBe("семен");
  });
});

describe("names", () => {
  it("makes initials and a first name", () => {
    expect(initialsOf("Марат Оспанов")).toBe("МО");
    expect(initialsOf("Марат")).toBe("М");
    expect(initialsOf("  ")).toBe("•");
    expect(firstNameOf("Марат Оспанов")).toBe("Марат");
  });
});
