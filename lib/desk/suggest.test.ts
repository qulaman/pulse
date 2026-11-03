import { describe, expect, it } from "vitest";

import { suggestPeople, wordAtCaret } from "./suggest";

const people = [
  { id: "e1", full_name: "Ерлан Бекмуханов", aliases: ["Ерлан Б"] },
  { id: "e2", full_name: "Ерлан Досжанов", aliases: [] },
  { id: "m1", full_name: "Марат Оспанов", aliases: ["Маратик"] },
  { id: "d1", full_name: "Дина Ахметова", aliases: null },
  { id: "a1", full_name: "Айгуль Сейтова", aliases: [] },
];

describe("wordAtCaret (D-154)", () => {
  it("takes the word that ends at the caret", () => {
    expect(wordAtCaret("Ерл", 3)).toEqual({ start: 0, word: "Ерл" });
    expect(wordAtCaret("смета для Мар", 13)).toEqual({ start: 10, word: "Мар" });
  });

  it("has nothing after a space or inside a word", () => {
    expect(wordAtCaret("Ерлан ", 6)).toBeNull();
    expect(wordAtCaret("Ерлан", 2)).toBeNull();
  });
});

describe("suggestPeople", () => {
  it("finds both namesakes from two letters", () => {
    expect(suggestPeople(people, "Ер").map((p) => p.id)).toEqual(["e1", "e2"]);
  });

  it("reads a name in another case", () => {
    expect(suggestPeople(people, "Марату").map((p) => p.id)).toEqual(["m1"]);
    expect(suggestPeople(people, "Дине").map((p) => p.id)).toEqual(["d1"]);
    expect(suggestPeople(people, "Ерлану").map((p) => p.id)).toEqual(["e1", "e2"]);
  });

  it("finds by surname and alias, first names first", () => {
    expect(suggestPeople(people, "Досж").map((p) => p.id)).toEqual(["e2"]);
    expect(suggestPeople(people, "маратик").map((p) => p.id)).toEqual(["m1"]);
  });

  it("stays quiet on one letter and on words that are not names", () => {
    expect(suggestPeople(people, "Е")).toEqual([]);
    expect(suggestPeople(people, "смета")).toEqual([]);
  });
});
