import { describe, expect, it } from "vitest";

import { matchErrand } from "@/lib/errands/matcher";
import type { RosterUser } from "@/lib/matchName";
import { DEFAULT_SECRETARY_ACTIONS } from "@/lib/settings";

const ROSTER: RosterUser[] = [
  { id: "1", full_name: "Марат Оспанов", aliases: ["Марат"], is_active: true },
  { id: "2", full_name: "Айгуль Сапарова", aliases: ["Айгуль"], is_active: true },
];

const match = (text: string, hasSecretary = true) =>
  matchErrand(text, DEFAULT_SECRETARY_ACTIONS, ROSTER, hasSecretary);

describe("matchErrand", () => {
  it("catches the label itself", () => {
    expect(match("Кофе")).toEqual({ code: "coffee", label: "Кофе", note: null });
  });

  it("catches a synonym and its case ending", () => {
    expect(match("кофейку")).toEqual({ code: "coffee", label: "Кофе", note: null });
    expect(match("врача")).toEqual({ code: "doctor", label: "Врач", note: null });
  });

  it("keeps the rest of the phrase as a note", () => {
    expect(match("кофе без сахара")).toEqual({ code: "coffee", label: "Кофе", note: "без сахара" });
  });

  it("prefers the longer button when two match", () => {
    expect(match("зайди ко мне")).toEqual({ code: "come", label: "Зайди ко мне", note: null });
  });

  it("refuses a phrase with a name in it — that is an order to a person", () => {
    expect(match("Марат кофе")).toBeNull();
  });

  it("refuses anything longer than three words", () => {
    expect(match("свари кофе Марату к 15:00")).toBeNull();
    expect(match("кофе без сахара пожалуйста")).toBeNull();
  });

  it("is off while the company has no secretary", () => {
    expect(match("кофе", false)).toBeNull();
  });

  it("does not invent a button that is not in the catalogue", () => {
    expect(match("вода")).toBeNull();
    // казахское «шай» работает, только если его добавили синонимом
    expect(match("шай")).toBeNull();
    expect(
      matchErrand(
        "шай",
        [{ code: "tea", label: "Чай", icon: "", synonyms: ["чай", "шай"] }],
        ROSTER,
        true,
      ),
    ).toEqual({ code: "tea", label: "Чай", note: null });
  });

  it("ignores punctuation and case", () => {
    expect(match("Кофе!")).toEqual({ code: "coffee", label: "Кофе", note: null });
  });

  it("stays out of the way of an empty phrase", () => {
    expect(match("   ")).toBeNull();
  });
});
