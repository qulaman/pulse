import { describe, expect, it } from "vitest";

import { applyOrder, countUse, habitOrder, habitPartOf, HABIT_MIN, usualOf, withSend, type Uses } from "@/lib/errands/habits";
import type { SecretaryAction } from "@/lib/settings";

const button = (code: string, label = code): SecretaryAction => ({ code, label, icon: "" }) as SecretaryAction;
const catalogue = [button("coffee"), button("tea"), button("dnd"), button("security"), button("guest"), button("doctor")];
const isAlarm = (action: SecretaryAction) => action.code === "security";
const codes = (list: SecretaryAction[]) => list.map((action) => action.code);

describe("usualOf — «как обычно» for a hold (D-106 §4)", () => {
  it("three sends with the same words make them the usual", () => {
    expect(usualOf(["без сахара", "без сахара", "без сахара"])).toBe("без сахара");
  });

  it("two are not enough, one other breaks it, no note is no usual", () => {
    expect(usualOf(["без сахара", "без сахара"])).toBeNull();
    expect(usualOf(["с молоком", "без сахара", "без сахара"])).toBeNull();
    expect(usualOf([null, null, null])).toBeNull();
  });

  it("a send from the sheet with other words changes the usual at once", () => {
    const history = withSend(["без сахара", "без сахара", "без сахара"], "с лимоном");
    expect(history).toEqual(["с лимоном", "без сахара", "без сахара"]);
    expect(usualOf(history)).toBeNull();
    expect(withSend(history, "  ")[0]).toBeNull();
  });
});

describe("habitPartOf — the Aqtobe wall clock", () => {
  it("morning until noon, day until five, evening after", () => {
    expect(habitPartOf(new Date("2026-09-23T04:00:00Z"))).toBe("morning"); // 09:00
    expect(habitPartOf(new Date("2026-09-23T07:30:00Z"))).toBe("day"); // 12:30
    expect(habitPartOf(new Date("2026-09-23T12:10:00Z"))).toBe("evening"); // 17:10
  });
});

describe("countUse — a habit that stopped fades out", () => {
  it("each send adds one and fades the others of its part of the day", () => {
    let uses: Uses = {};
    uses = countUse(uses, "morning", "coffee");
    uses = countUse(uses, "morning", "tea");
    expect(uses.morning?.tea).toBe(1);
    expect(uses.morning?.coffee).toBeCloseTo(0.9);
    expect(uses.day).toBeUndefined();
  });
});

describe("habitOrder — the buttons this part of the day asks for come first (D-106 §5)", () => {
  it("too little to go on — the catalogue's order", () => {
    expect(codes(habitOrder(catalogue, undefined, isAlarm))).toEqual(codes(catalogue));
    expect(codes(habitOrder(catalogue, { guest: HABIT_MIN - 1 }, isAlarm))).toEqual(codes(catalogue));
  });

  it("the asked-for buttons by weight, the rest in catalogue order", () => {
    const order = habitOrder(catalogue, { guest: 4, doctor: 2.5, coffee: 0.5 }, isAlarm);
    expect(codes(order)).toEqual(["guest", "doctor", "coffee", "security", "tea", "dnd"]);
  });

  it("the alarm keeps its catalogue place, whatever the habit", () => {
    const order = habitOrder(catalogue, { security: 9, doctor: 6 }, isAlarm);
    expect(codes(order).indexOf("security")).toBe(3);
    expect(codes(order)[0]).toBe("doctor");
  });
});

describe("applyOrder — a kept order over a catalogue that changed", () => {
  it("follows the order, drops what is gone, adds what is new at the end", () => {
    const now = [button("tea"), button("coffee"), button("taxi")];
    expect(codes(applyOrder(now, ["coffee", "gone", "tea"]))).toEqual(["coffee", "tea", "taxi"]);
  });
});
