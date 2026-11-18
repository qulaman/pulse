import { describe, expect, it } from "vitest";

import { shortName, teamDensity, teamView, type TeamLoadRow } from "./team";

const row = (name: string, done_today: number | undefined = undefined, active = 3): TeamLoadRow => ({ name, active, overdue: 1, done_today });

describe("teamView — «Команда сейчас» (D-182)", () => {
  it("порядок — по имени, а не по загрузке; имя и инициал фамилии", () => {
    const view = teamView([row("Ерлан Беков", 0, 9), row("Айгерим Сапарова", 2, 1), row("Марат Ахметов")], [], { points: false, guest: false });
    expect(view.members.map((m) => m.name)).toEqual(["Айгерим С.", "Ерлан Б.", "Марат А."]);
  });

  it("сдано сегодня — числом или ничего; ни загрузки, ни просрочки (D-45)", () => {
    const view = teamView([row("Айгерим Сапарова", 2), row("Ерлан Беков", 0), row("Марат Ахметов")], [], { points: false, guest: false });
    expect(view.members.map((m) => m.done)).toEqual([2, null, null]);
    expect(view.doneToday).toBe(2);
    expect(Object.keys(view.members[0])).not.toContain("overdue");
    expect(Object.keys(view.members[0])).not.toContain("active");
  });

  it("медаль первой тройки — только при очках и не гостю (D-33)", () => {
    const load = [row("Айгерим Сапарова"), row("Ерлан Беков"), row("Марат Ахметов"), row("Тимур Жаксылыков")];
    const rating = [
      { name: "Ерлан Беков", points: 50, rank: 1 },
      { name: "Айгерим Сапарова", points: 40, rank: 2 },
      { name: "Марат Ахметов", points: 30, rank: 3 },
      { name: "Тимур Жаксылыков", points: 20, rank: 4 },
    ];
    expect(teamView(load, rating, { points: true, guest: false }).members.map((m) => m.medal)).toEqual([2, 1, 3, null]);
    expect(teamView(load, rating, { points: false, guest: false }).members.every((m) => m.medal === null)).toBe(true);
    expect(teamView(load, rating, { points: true, guest: true }).members.every((m) => m.medal === null)).toBe(true);
  });

  it("тёзки не сливаются: «Ерлан Б.» дважды — полные имена", () => {
    const view = teamView([row("Ерлан Беков"), row("Ерлан Бакиров"), row("Ерлан Досанов")], [], { points: false, guest: false });
    expect(view.members.map((m) => m.name)).toEqual(["Ерлан Бакиров", "Ерлан Беков", "Ерлан Д."]);
  });

  it("гостю приходит имя без фамилии — так и печатается", () => {
    expect(teamView([row("Айгерим")], [], { points: true, guest: true }).members[0].name).toBe("Айгерим");
    expect(shortName("  Айгерим   Сапарова ")).toBe("Айгерим С.");
  });

  it("толпа — одни имена, тёзкам — инициал", () => {
    const load = Array.from({ length: 30 }, (_, i) => row(i < 2 ? `Ерлан ${i ? "Беков" : "Досанов"}` : `Человек${i} Фамилия`));
    const names = teamView(load, [], { points: false, guest: false }).members.map((m) => m.name);
    expect(names).toContain("Ерлан Б.");
    expect(names).toContain("Ерлан Д.");
    expect(names).toContain("Человек2");
  });
});

describe("teamDensity — сетка ужимается, а не обрезает", () => {
  it("чем больше людей, тем больше в ряду и меньше круг; всем хватает места", () => {
    for (const count of [1, 4, 8, 12, 18, 24, 32, 40, 50]) {
      const d = teamDensity(count);
      const rows = Math.ceil(count / d.cols);
      expect(rows).toBeLessThanOrEqual(5);
    }
    expect(teamDensity(8)).toMatchObject({ cols: 4, badge: false });
    expect(teamDensity(10)).toMatchObject({ cols: 6, badge: true });
    expect(teamDensity(24)).toMatchObject({ cols: 8, badge: true, heading: "tv-lead" });
  });
});
