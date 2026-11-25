import { describe, expect, it } from "vitest";

import { composedText, DUE_PRESETS } from "./typed";

const PIN = { id: "a", name: "Айгуль С.", address: "Айгуль, " };

describe("composedText (D-192)", () => {
  it("passes the typed text as it is without a pin or a deadline", () => {
    expect(composedText("подготовить КП", null, null)).toBe("подготовить КП");
  });

  it("puts the pinned person's address in front", () => {
    expect(composedText("подготовить КП", PIN, null)).toBe("Айгуль, подготовить КП");
  });

  it("adds the deadline words after the text, dropping a closing stop", () => {
    expect(composedText("подготовить КП.", PIN, "до пятницы")).toBe("Айгуль, подготовить КП до пятницы");
    expect(composedText("Ерлану отчёт  ", null, "до завтра")).toBe("Ерлану отчёт до завтра");
  });

  it("offers only words the parser reads as a deadline", () => {
    expect(DUE_PRESETS.map((preset) => preset.words)).toEqual(["до конца дня", "до завтра", "до конца недели", "до конца месяца"]);
  });
});
