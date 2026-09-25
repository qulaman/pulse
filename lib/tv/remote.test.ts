import { describe, expect, it } from "vitest";

import type { TvState } from "./queries";
import { SCENE_LABEL, keyLabels, wallNow, wallReceipt } from "./remote";

const NOW = new Date("2026-09-18T09:00:00Z"); // 14:00 в Актобе

function state(patch: Partial<TvState> = {}): TvState {
  return {
    company_id: "11111111-1111-1111-1111-111111111111",
    mode: "ether",
    employee_id: null,
    task_id: null,
    scene: "face",
    guest: false,
    guest_until: null,
    clock_style: "digital",
    calendar_view: "week",
    rating_view: "week",
    carousel: false,
    board_id: null,
    board_until: null,
    board_guest: false,
    board_point: null,
    board_view: "list",
    awake_until: null,
    expires_at: null,
    version: 1,
    reload_requested_at: null,
    seen_at: NOW.toISOString(),
    applied_version: 1,
    updated_by: null,
    updated_at: NOW.toISOString(),
    ...patch,
  };
}

const PEOPLE = [{ id: "e1", full_name: "Марат Ахметов" }];

describe("wallReceipt", () => {
  it("экран показал последнюю команду — «На стене»", () => {
    expect(wallReceipt(state(), NOW)).toEqual({ tone: "ok", text: "На стене" });
  });

  it("строки нет — экран ещё не подключался", () => {
    expect(wallReceipt(null, NOW).tone).toBe("muted");
    expect(wallReceipt(null, NOW).text).toBe("Экран ещё не подключался");
  });

  it("квитанции нет вовсе — тоже «ещё не подключался», а не «не отвечает»", () => {
    expect(wallReceipt(state({ seen_at: null, applied_version: null }), NOW).text).toBe(
      "Экран ещё не подключался",
    );
  });

  it("молчит дольше трёх минут — называет время, а не ставит диагноз", () => {
    const row = state({ seen_at: "2026-09-18T04:14:00Z" }); // 09:14 в Актобе
    expect(wallReceipt(row, NOW)).toEqual({ tone: "warn", text: "Экран не отвечает с 09:14" });
  });

  it("команда ушла, но экран её ещё не показал", () => {
    const row = state({ version: 5, applied_version: 4 });
    expect(wallReceipt(row, NOW)).toEqual({ tone: "muted", text: "Отправлено, экран ещё не показал" });
  });
});

describe("wallNow", () => {
  it("называет сцену эфира", () => {
    expect(wallNow(state(), PEOPLE, NOW)).toBe("Эфир · лицо");
    expect(wallNow(state({ scene: "clock" }), PEOPLE, NOW)).toBe("Эфир · часы");
    expect(wallNow(state({ scene: "team" }), PEOPLE, NOW)).toBe("Эфир · команда");
    expect(wallNow(state({ scene: "calendar" }), PEOPLE, NOW)).toBe("Эфир · календарь");
    expect(wallNow(state({ scene: "calendar", calendar_view: "month" }), PEOPLE, NOW)).toBe("Эфир · календарь · месяц");
    expect(wallNow(null, PEOPLE, NOW)).toBe("Эфир · лицо");
  });

  it("называет доску на стене и до скольки она там (D-102)", () => {
    const row = state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T16:00:00Z" });
    expect(wallNow(row, PEOPLE, NOW, [{ id: "b-1", title: "Планёрка" }])).toBe("Доска «Планёрка» · до 21:00");
    expect(wallNow(row, PEOPLE, NOW)).toBe("Доска · до 21:00");
    // истёкшая доска — снова лицо
    expect(wallNow(state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T08:00:00Z" }), PEOPLE, NOW)).toBe("Эфир · лицо");
  });

  describe("доска с ведущим (D-121)", () => {
    const BOARDS = [{ id: "b-1", title: "Планёрка" }];
    const POINTS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const onWall = (patch: Partial<TvState> = {}) =>
      state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T16:00:00Z", ...patch });

    it("называет подсвеченный пункт: «пункт 3 из 7»", () => {
      expect(wallNow(onWall({ board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · пункт 3 из 7 · до 21:00");
      // без подсветки — как раньше
      expect(wallNow(onWall(), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · до 21:00");
      // подсвеченного пункта уже нет на доске — стена его не светит, и пульт не называет
      expect(wallNow(onWall({ board_point: "gone" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · до 21:00");
    });

    it("карта — только когда она влезает на стену", () => {
      expect(wallNow(onWall({ board_view: "map", board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe(
        "Доска «Планёрка» · карта · пункт 3 из 7 · до 21:00",
      );
      const many = Array.from({ length: 13 }, (_, i) => `p${i + 1}`);
      expect(wallNow(onWall({ board_view: "map" }), PEOPLE, NOW, BOARDS, { boardPoints: many })).toBe("Доска «Планёрка» · до 21:00");
      // пустая доска картой не рисуется
      expect(wallNow(onWall({ board_view: "map" }), PEOPLE, NOW, BOARDS, { boardPoints: [] })).toBe("Доска «Планёрка» · до 21:00");
    });

    it("при госте без «Показать гостю» — доска скрыта (D-102 §7)", () => {
      expect(wallNow(onWall({ guest: true, board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · скрыта от гостя");
      expect(wallNow(onWall({ guest: true, board_guest: true, board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe(
        "Доска «Планёрка» · пункт 3 из 7 · до 21:00",
      );
      // гость визита истёк — доска снова на стене
      expect(wallNow(onWall({ guest: true, guest_until: "2026-09-18T08:30:00Z" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · до 21:00");
    });

    it("длинное название режется, чтобы пункт и время остались на дисплее", () => {
      const long = [{ id: "b-1", title: "Совещание по новому складу и логистике  на октябрь" }];
      expect(wallNow(onWall({ board_point: "p1" }), PEOPLE, NOW, long, { boardPoints: POINTS })).toBe(
        "Доска «Совещание по новому скл…» · пункт 1 из 7 · до 21:00",
      );
    });

    it("ночью доска будит стену — дисплей говорит о доске, а не о сне", () => {
      const night = new Date("2026-09-18T17:00:00Z"); // 22:00 в Актобе
      const late = onWall({ board_until: "2026-09-18T19:00:00Z", board_point: "p2" }); // до 00:00
      expect(wallNow(late, PEOPLE, night, BOARDS, { boardPoints: POINTS })).toBe("Доска «Планёрка» · пункт 2 из 7 · до 00:00");
    });
  });

  it("в фокусе — имя и сколько осталось", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T09:07:00Z" });
    expect(wallNow(row, PEOPLE, NOW)).toBe("Марат Ахметов · ещё 7 мин");
  });

  it("истёкший фокус — уже эфир", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T08:55:00Z" });
    expect(wallNow(row, PEOPLE, NOW)).toBe("Эфир · лицо");
  });

  it("ночью спящая стена — тусклые часы, разбуженная — снова сцена (D-105)", () => {
    const night = new Date("2026-09-18T17:00:00Z"); // 22:00 в Актобе
    expect(wallNow(state({ scene: "team" }), PEOPLE, night)).toBe("Ночь · тусклые часы");
    expect(wallNow(state({ scene: "team", awake_until: "2026-09-18T19:00:00Z" }), PEOPLE, night)).toBe("Эфир · команда");
    // человек на стене ночь перебивает и без пульта
    const focus = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T17:07:00Z" });
    expect(wallNow(focus, PEOPLE, night)).toBe("Марат Ахметов · ещё 7 мин");
  });
});

describe("SCENE_LABEL", () => {
  it("даёт русское имя каждой сцене", () => {
    expect(SCENE_LABEL).toEqual({ face: "Лицо", clock: "Часы", team: "Команда", calendar: "Календарь", board: "Доска", rating: "Рейтинг" });
  });
});

describe("keyLabels", () => {
  it("подписывает клавишу именем, тёзок — с буквой фамилии", () => {
    const labels = keyLabels([
      { id: "a", full_name: "Ерлан Байжанов" },
      { id: "b", full_name: "Ерлан Досов" },
      { id: "c", full_name: "Марат Оспанов" },
      { id: "d", full_name: "Айгуль" },
    ]);
    expect(labels.get("a")).toBe("Ерлан Б.");
    expect(labels.get("b")).toBe("Ерлан Д.");
    expect(labels.get("c")).toBe("Марат");
    expect(labels.get("d")).toBe("Айгуль");
  });
});

describe("wallNow — стена v4 (D-123)", () => {
  it("рейтинг недели и месяца", () => {
    expect(wallNow(state({ scene: "rating" }), PEOPLE, NOW)).toBe("Эфир · рейтинг недели");
    expect(wallNow(state({ scene: "rating", rating_view: "month" }), PEOPLE, NOW)).toBe("Эфир · рейтинг месяца");
    // очки выключены — на стене лицо, и пульт говорит то же
    expect(wallNow(state({ scene: "rating" }), PEOPLE, NOW, [], { points: false })).toBe("Эфир · лицо");
  });

  it("одно дело — название и сколько осталось", () => {
    const row = state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T09:07:00Z" });
    expect(wallNow(row, PEOPLE, NOW, [], { taskTitle: "Замер окон" })).toBe("Дело «Замер окон» · ещё 7 мин");
    expect(wallNow(row, PEOPLE, NOW)).toBe("Одно дело · ещё 7 мин");
  });

  it("круг заставок — сцена и «по кругу»", () => {
    const text = wallNow(state({ carousel: true }), PEOPLE, NOW);
    expect(text).toMatch(/^Эфир · .+ · по кругу$/);
  });
});
