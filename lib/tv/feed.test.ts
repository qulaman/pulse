import { describe, expect, it } from "vitest";

import { lineOf, type TvEvent } from "./feed";

const base: TvEvent = {
  id: "e1",
  kind: "points",
  created_at: "2026-09-17T09:00:00Z",
  payload: { name: "Марат Оспанов", title: "за акт в срок", amount: 5 },
  payload_guest: { name: "Марат", title: null, amount: null },
};

describe("lineOf", () => {
  it("очки показывает числом, а гостю — словом без цифры", () => {
    expect(lineOf(base, false).label).toBe("+5");
    expect(lineOf(base, true).label).toBe("Очки");
  });

  it("гость видит имя без фамилии и без заголовка (D-33)", () => {
    const guest = lineOf(base, true);
    expect(guest.name).toBe("Марат");
    expect(guest.detail).toBeNull();
  });

  it("длинное объявление режется до одной читаемой строки", () => {
    const long = "а".repeat(300);
    const line = lineOf({ ...base, kind: "announcement", payload: { name: "Директор", title: long, amount: null } }, false);
    expect(line.detail).toHaveLength(120);
    expect(line.detail?.endsWith("…")).toBe(true);
  });

  it("событие без имени не оставляет пустую строку", () => {
    const line = lineOf({ ...base, kind: "announcement", payload: { name: null, title: "Завтра планёрка", amount: null } }, false);
    expect(line.name).toBe("Компания");
    expect(line.label).toBe("Объявление");
  });
});
