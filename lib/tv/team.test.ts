import { describe, expect, it } from "vitest";

import { teamFigures, teamGrid, teamPosition } from "./team";

describe("teamGrid — сцена «Команда» по размеру команды (D-194)", () => {
  it("до трёх — один ряд больших карточек, до восьми — два ряда, дальше — список по 16", () => {
    expect([1, 2, 3].map((n) => teamGrid(n))).toEqual([
      { cols: 1, rows: 1, size: "large", perPage: 3 },
      { cols: 2, rows: 1, size: "large", perPage: 3 },
      { cols: 3, rows: 1, size: "large", perPage: 3 },
    ]);
    expect(teamGrid(5)).toMatchObject({ cols: 3, rows: 2, size: "medium" });
    expect(teamGrid(8)).toMatchObject({ cols: 4, rows: 2, size: "medium" });
    expect(teamGrid(9)).toMatchObject({ cols: 4, rows: 4, size: "compact", perPage: 16 });
    expect(teamGrid(40).perPage).toBe(16);
  });

  it("на одной странице помещаются все карточки маленькой команды", () => {
    for (let n = 1; n <= 8; n++) {
      const grid = teamGrid(n);
      expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(n);
      expect(grid.perPage).toBeGreaterThanOrEqual(n);
    }
  });
});

describe("teamFigures — числа карточки словами, только хорошие (D-45)", () => {
  it("в работе и готово за неделю — со словами; ноль не пишется", () => {
    expect(teamFigures({ active: 2, done_today: 1, done_week: 3 })).toEqual([
      { key: "work", value: 2, label: "задачи в работе" },
      { key: "done", value: 3, label: "готово за неделю" },
    ]);
    expect(teamFigures({ active: 1, done_today: 0, done_week: 0 })).toEqual([{ key: "work", value: 1, label: "задача в работе" }]);
    expect(teamFigures({ active: 5, done_week: 0 })[0]?.label).toBe("задач в работе");
    expect(teamFigures({ active: 0, done_today: 0, done_week: 0 })).toEqual([]);
  });

  it("база без недели — «готово сегодня»", () => {
    expect(teamFigures({ active: 0, done_today: 2 })).toEqual([{ key: "done", value: 2, label: "готово сегодня" }]);
  });
});

describe("teamPosition — должность под фамилией", () => {
  it("пишется, если не повторяет фамилию", () => {
    expect(teamPosition({ name: "Айболат Нурланов", position: "Прораб" })).toBe("Прораб");
    expect(teamPosition({ name: "Ербол Сотрудник", position: "Сотрудник" })).toBeNull();
    expect(teamPosition({ name: "Юля", position: "  " })).toBeNull();
    expect(teamPosition({ name: "Юля", position: null })).toBeNull();
    expect(teamPosition({ name: "Юля" })).toBeNull();
  });
});
