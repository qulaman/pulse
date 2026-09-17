import { describe, expect, it } from "vitest";

import { MAX_ORBS, teamField } from "./team";

const TEAM = [
  { name: "Айгуль Сапарова", active: 0 },
  { name: "Динара Ахметова", active: 3 },
  { name: "Ерлан Байжанов", active: 1 },
  { name: "Марат Оспанов", active: 0 },
];

describe("teamField", () => {
  it("место человека — его собственное: список поменялся, кружок стоит там же", () => {
    const before = teamField(TEAM);
    const after = teamField([...TEAM].reverse());
    const marat = (orbs: ReturnType<typeof teamField>) => orbs.find((orb) => orb.key === "Марат Оспанов")!;
    expect(marat(after).y).toBeCloseTo(marat(before).y, 6);
    expect(marat(after).size).toBeCloseTo(marat(before).size, 6);
  });

  it("занятый крупнее и бьётся чаще свободного", () => {
    const orbs = teamField(TEAM);
    const dinara = orbs.find((orb) => orb.key === "Динара Ахметова")!;
    const erlan = orbs.find((orb) => orb.key === "Ерлан Байжанов")!;
    const aigul = orbs.find((orb) => orb.key === "Айгуль Сапарова")!;
    expect(dinara.size).toBeGreaterThan(erlan.size);
    expect(erlan.size).toBeGreaterThan(aigul.size);
    expect(dinara.beatMs).toBeLessThan(erlan.beatMs);
    expect(aigul.busy).toBe(false);
  });

  it("в большой компании свободные не вытесняются занятыми", () => {
    const big = [
      ...Array.from({ length: 14 }, (_, i) => ({ name: `Занятый ${i}`, active: i + 1 })),
      { name: "Свободный Первый", active: 0 },
      { name: "Свободный Второй", active: 0 },
      { name: "Свободный Третий", active: 0 },
    ];
    const orbs = teamField(big);
    expect(orbs).toHaveLength(MAX_ORBS);
    expect(orbs.filter((orb) => !orb.busy).length).toBeGreaterThanOrEqual(3);
  });

  it("кружки стоят в полосе и не наезжают на края", () => {
    for (const orb of teamField(TEAM)) {
      expect(orb.x).toBeGreaterThan(0);
      expect(orb.x).toBeLessThan(100);
      expect(orb.y).toBeGreaterThanOrEqual(48);
      expect(orb.y).toBeLessThanOrEqual(60);
    }
  });

  it("инициалы берутся из имени, подпись — только имя", () => {
    const orb = teamField(TEAM).find((item) => item.key === "Марат Оспанов")!;
    expect(orb.initials).toBe("МО");
    expect(orb.label).toBe("Марат");
  });

  it("два тёзки (у гостя имена без фамилий) не делят ни ключ, ни место", () => {
    const orbs = teamField([
      { name: "Ерлан", active: 1 },
      { name: "Ерлан", active: 0 },
    ]);
    expect(new Set(orbs.map((orb) => orb.key)).size).toBe(2);
    expect(orbs[0]!.y).not.toBeCloseTo(orbs[1]!.y, 3);
  });

  it("пустая команда — пустая полоса, без падения", () => {
    expect(teamField([])).toEqual([]);
  });
});
