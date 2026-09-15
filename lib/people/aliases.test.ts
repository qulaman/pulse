import { describe, expect, it } from "vitest";

import { initialAlias, shortNames, suggestAliases } from "./aliases";

describe("shortNames", () => {
  it("first names, initials only where a first name is shared", () => {
    const labels = shortNames([
      { id: "a", full_name: "Ерлан Байжанов" },
      { id: "b", full_name: "Ерлан Досов" },
      { id: "c", full_name: "Марат Оспанов" },
      { id: "d", full_name: "Динара" },
    ]);
    expect([...labels.values()]).toEqual(["Ерлан Б.", "Ерлан Д.", "Марат", "Динара"]);
  });
});

const ROSTER = [
  { full_name: "Ерлан Байжанов", aliases: ["Ерлан"] },
  { full_name: "Марат Оспанов", aliases: ["Марат"] },
  { full_name: "Сәкен Жумабаев", aliases: ["Сәкен", "Сакен"] },
];

describe("suggestAliases", () => {
  it("a unique first name becomes the only alias", () => {
    expect(suggestAliases("Айгуль Сапарова", ROSTER)).toEqual({
      mine: ["Айгуль"],
      forOthers: [],
      namesakes: [],
    });
  });

  it("a namesake gets the initial form, and the existing namesake is offered theirs", () => {
    expect(suggestAliases("Ерлан Досов", ROSTER)).toEqual({
      mine: ["Ерлан", "Ерлан Д."],
      forOthers: [{ full_name: "Ерлан Байжанов", alias: "Ерлан Б." }],
      namesakes: ["Ерлан Байжанов"],
    });
  });

  it("does not re-offer an initial the namesake already has, however it is spelled", () => {
    const roster = [{ full_name: "Ерлан Байжанов", aliases: ["Ерлан", "ерлан б"] }];
    expect(suggestAliases("Ерлан Досов", roster).forOthers).toEqual([]);
  });

  it("matches first names case- and ё-insensitively", () => {
    expect(suggestAliases("ёлдос Ахметов", [{ full_name: "Елдос Каримов", aliases: [] }]).namesakes).toEqual([
      "Елдос Каримов",
    ]);
  });

  it("a single word has no initial form and an empty name suggests nothing", () => {
    expect(initialAlias("Динара")).toBeNull();
    expect(suggestAliases("Динара", ROSTER).mine).toEqual(["Динара"]);
    expect(suggestAliases("   ", ROSTER)).toEqual({ mine: [], forOthers: [], namesakes: [] });
  });
});
