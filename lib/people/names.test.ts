import { afterEach, describe, expect, it } from "vitest";

import { indexNames, setCompanyNames, shortName, shortNameIn } from "./names";

describe("shortNameIn — a name on screen (D-146)", () => {
  const company = indexNames(["Ерлан Байжанов", "Ерлан Досов", "Марат Оспанов", "Айболат", "Семён Ким", "Семен Ли"]);

  it("is the bare first name without a namesake", () => {
    expect(shortNameIn("Марат Оспанов", company)).toBe("Марат");
    expect(shortNameIn("Айболат", company)).toBe("Айболат");
  });

  it("adds the surname's initial beside a namesake", () => {
    expect(shortNameIn("Ерлан Байжанов", company)).toBe("Ерлан Б.");
    expect(shortNameIn("Ерлан Досов", company)).toBe("Ерлан Д.");
  });

  it("folds case and «ё»: Семён and Семен are namesakes", () => {
    expect(shortNameIn("Семён Ким", company)).toBe("Семён К.");
    expect(shortNameIn("семен ли", company)).toBe("семен Л.");
  });

  it("keeps the whole surname when the initials meet too", () => {
    const two = indexNames(["Ерлан Байжанов", "Ерлан Бекмуханов"]);
    expect(shortNameIn("Ерлан Байжанов", two)).toBe("Ерлан Байжанов");
    expect(shortNameIn("Ерлан Бекмуханов", two)).toBe("Ерлан Бекмуханов");
  });

  it("tells apart someone who left from a working namesake", () => {
    // the roster holds working people only; an old task still names the one who left
    expect(shortNameIn("Ерлан Касымов", indexNames(["Ерлан Байжанов"]))).toBe("Ерлан К.");
  });

  it("is not fooled by spaces or a missing name", () => {
    expect(shortNameIn("  Ерлан   Досов ", company)).toBe("Ерлан Д.");
    expect(shortNameIn(null, company)).toBe("");
    expect(shortNameIn("", company)).toBe("");
  });
});

describe("shortName — against the company's names known so far", () => {
  afterEach(() => setCompanyNames([]));

  it("is bare before the roster has come", () => {
    expect(shortName("Ерлан Досов")).toBe("Ерлан");
  });

  it("tells namesakes apart once it has", () => {
    setCompanyNames(["Ерлан Байжанов", "Ерлан Досов"]);
    expect(shortName("Ерлан Досов")).toBe("Ерлан Д.");
  });
});
