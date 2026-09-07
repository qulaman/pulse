import { describe, expect, it } from "vitest";

import { normalize, stem, stems, tokens } from "./normalize";

describe("normalize", () => {
  it("lowercases, strips punctuation, folds ё and spells numerals as digits", () => {
    expect(normalize("В десять, Ё!")).toBe("в 10 е");
  });

  it("tokenizes into non-empty words", () => {
    expect(tokens("  Марат,  КП   Казхром ")).toEqual(["марат", "кп", "казхром"]);
    expect(stems("Ерлану Байжанову")).toEqual(["ерлан", "байжанов"]);
  });
});

describe("stem", () => {
  const sameStem = (...forms: string[]) => new Set(forms.map((f) => stem(normalize(f)))).size === 1;

  it.each([
    ["Ерлан", ["Ерлан", "Ерлану", "Ерланға"]],
    ["Марат", ["Марат", "Марату", "Маратқа"]],
    ["Сәкен", ["Сәкен", "Сәкенге"]],
    ["Алия", ["Алия", "Алияға"]],
    ["Динара", ["Динара", "Динаре"]],
  ])("collapses case forms of %s", (_name, forms) => {
    expect(sameStem(...forms)).toBe(true);
  });

  it("strips only the -ге ending, not -нге", () => {
    expect(stem(normalize("Сәкенге"))).toBe("сәкен");
    expect(stem(normalize("Сәкенге"))).not.toBe("сәк");
  });

  it("leaves short words (<= 3 letters) untouched", () => {
    for (const word of ["кп", "год", "дом", "ул"]) {
      expect(stem(normalize(word))).toBe(normalize(word));
    }
  });
});
