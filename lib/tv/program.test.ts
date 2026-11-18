import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROGRAM_WINDOW,
  manualHolds,
  programNext,
  programRound,
  programScene,
  programWindowOf,
  segmentEndsAt,
  segmentOf,
  segmentStartsAt,
  welcomeOn,
  type ProgramOpts,
  type ProgramWindow,
} from "./program";
import type { TvState } from "./queries";

/** hh:mm by Aqtobe on a day of November 2026: 16 — Monday, 18 — Wednesday, 20 — Friday, 21 — Saturday. */
const at = (day: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, day, hh - 5, mm));
const W = DEFAULT_PROGRAM_WINDOW;
const P: ProgramOpts = { points: true, guest: false, weekBoard: false, announcement: false };

function state(patch: Partial<TvState> & { scene_set_at?: string | null } = {}): TvState {
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
    week_board_id: null,
    week_board_until: null,
    awake_until: null,
    expires_at: null,
    version: 1,
    reload_requested_at: null,
    seen_at: null,
    applied_version: null,
    updated_by: null,
    updated_at: "2026-11-18T05:00:00Z",
    ...patch,
  } as TvState;
}

describe("отрезки дня (D-182)", () => {
  it("утро от конца ночи до 10:00, день до вечера, вечер до ночи, ночь по окну", () => {
    expect(segmentOf(at(18, 7, 59), W)).toBe("night");
    expect(segmentOf(at(18, 8, 0), W)).toBe("morning");
    expect(segmentOf(at(18, 9, 59), W)).toBe("morning");
    expect(segmentOf(at(18, 10, 0), W)).toBe("day");
    expect(segmentOf(at(18, 16, 59), W)).toBe("day");
    expect(segmentOf(at(18, 17, 0), W)).toBe("evening");
    expect(segmentOf(at(18, 20, 59), W)).toBe("evening");
    expect(segmentOf(at(18, 21, 0), W)).toBe("night");
    expect(segmentOf(at(18, 0, 0), W)).toBe("night");
  });

  it("знает начало и конец своего отрезка — и через полночь", () => {
    expect(segmentStartsAt(at(18, 12, 34), W)).toEqual(at(18, 10));
    expect(segmentEndsAt(at(18, 12, 34), W)).toEqual(at(18, 17));
    expect(segmentStartsAt(at(18, 23, 0), W)).toEqual(at(18, 21));
    expect(segmentEndsAt(at(18, 23, 0), W)).toEqual(at(19, 8));
    expect(segmentStartsAt(at(18, 3, 0), W)).toEqual(at(17, 21));
    expect(segmentEndsAt(at(18, 3, 0), W)).toEqual(at(18, 8));
    expect(segmentStartsAt(at(18, 8, 0), W)).toEqual(at(18, 8));
  });

  it("окно ночи — из настроек компании; нечитаемое поле остаётся умолчанием", () => {
    const w = programWindowOf({ program: { night_from: "22:30", night_to: "07:00", evening_from: "18:00" } });
    expect(w).toEqual({ nightFrom: 22 * 60 + 30, nightTo: 7 * 60, eveningFrom: 18 * 60 });
    expect(segmentOf(at(18, 6, 59), w)).toBe("night");
    expect(segmentOf(at(18, 7, 0), w)).toBe("morning");
    expect(segmentOf(at(18, 17, 59), w)).toBe("day");
    expect(segmentOf(at(18, 18, 0), w)).toBe("evening");
    expect(segmentOf(at(18, 22, 0), w)).toBe("evening");
    expect(segmentOf(at(18, 22, 30), w)).toBe("night");

    expect(programWindowOf({ program: { night_from: "поздно", night_to: "7:15", evening_from: "" } })).toEqual({
      nightFrom: W.nightFrom,
      nightTo: 7 * 60 + 15,
      eveningFrom: W.eveningFrom,
    });
    expect(programWindowOf(null)).toEqual(W);
    expect(programWindowOf({})).toEqual(W);
  });

  it("ночь кончается после 10:00 — утра нет, сразу день", () => {
    const late: ProgramWindow = { nightFrom: 23 * 60, nightTo: 11 * 60, eveningFrom: 18 * 60 };
    expect(segmentOf(at(18, 11, 0), late)).toBe("day");
    expect(programScene(at(18, 11, 0), late, P)).toBe("face");
  });

  it("ночь с той же минуты до той же — ночи нет", () => {
    const none: ProgramWindow = { nightFrom: 8 * 60, nightTo: 8 * 60, eveningFrom: 17 * 60 };
    expect(segmentOf(at(18, 3, 0), none)).toBe("evening");
    expect(segmentOf(at(18, 9, 0), none)).toBe("morning");
  });
});

describe("программа: утро", () => {
  it("«Сегодня» календаря до 10:00", () => {
    expect(programScene(at(18, 8, 0), W, P)).toBe("calendar");
    expect(programScene(at(18, 9, 59), W, P)).toBe("calendar");
  });

  it("в понедельник первый час — рейтинг недели, если очки и не гость", () => {
    expect(programScene(at(16, 8, 0), W, P)).toBe("rating");
    expect(programScene(at(16, 8, 59), W, P)).toBe("rating");
    expect(programScene(at(16, 9, 0), W, P)).toBe("calendar");
    expect(programScene(at(16, 8, 30), W, { ...P, guest: true })).toBe("calendar");
    expect(programScene(at(16, 8, 30), W, { ...P, points: false })).toBe("calendar");
    // вторник — календарь
    expect(programScene(at(17, 8, 30), W, P)).toBe("calendar");
  });

  it("первый час понедельника — от конца ночи компании", () => {
    const w: ProgramWindow = { nightFrom: 21 * 60, nightTo: 7 * 60, eveningFrom: 17 * 60 };
    expect(programScene(at(16, 7, 30), w, P)).toBe("rating");
    expect(programScene(at(16, 8, 0), w, P)).toBe("calendar");
  });
});

describe("программа: день", () => {
  it("круг как прежде — лицо, рейтинг, календарь, команда — раз в три минуты от 10:00", () => {
    const steps = [0, 3, 6, 9, 12].map((m) => programScene(at(18, 10, m), W, P));
    expect(steps).toEqual(["face", "rating", "calendar", "team", "face"]);
    expect(programScene(at(18, 10, 2), W, P)).toBe("face");
  });

  it("без очков и при госте рейтинга в круге нет", () => {
    expect([0, 3, 6, 9].map((m) => programScene(at(18, 10, m), W, { ...P, points: false }))).toEqual(["face", "calendar", "team", "face"]);
    expect(programRound(at(18, 11), W, { ...P, guest: true })).toEqual(["face", "calendar", "team"]);
  });

  it("доска недели — последней в круге, гостю — нет", () => {
    expect(programRound(at(18, 11), W, { ...P, weekBoard: true })).toEqual(["face", "rating", "calendar", "team", "board"]);
    expect(programRound(at(18, 11), W, { ...P, weekBoard: true, guest: true })).toEqual(["face", "calendar", "team"]);
  });

  it("объявление дня — первым в круге; гостю объявления нет", () => {
    const o = { ...P, announcement: true };
    expect(programRound(at(18, 11), W, o)).toEqual(["announcement", "face", "rating", "calendar", "team"]);
    expect(programScene(at(18, 10, 0), W, o)).toBe("announcement");
    expect(programScene(at(18, 10, 3), W, o)).toBe("face");
    expect(programScene(at(18, 10, 15), W, o)).toBe("announcement");
    expect(programRound(at(18, 11), W, { ...o, guest: true })).not.toContain("announcement");
  });
});

describe("программа: вечер, пятница, ночь", () => {
  it("вечером «Итог дня» первым, дальше круг", () => {
    expect(programScene(at(18, 17, 0), W, P)).toBe("day-result");
    expect(programScene(at(18, 17, 3), W, P)).toBe("face");
    expect(programRound(at(18, 18), W, { ...P, announcement: true })).toEqual(["day-result", "announcement", "face", "rating", "calendar", "team"]);
  });

  it("в пятницу с 16:00 «Итог недели» в круге — и днём, и вечером", () => {
    expect(programRound(at(20, 15, 59), W, P)).not.toContain("week-result");
    expect(programRound(at(20, 16, 0), W, P)).toEqual(["week-result", "face", "rating", "calendar", "team"]);
    expect(programRound(at(20, 17, 0), W, P)).toEqual(["day-result", "week-result", "face", "rating", "calendar", "team"]);
    // в четверг и в субботу — нет
    expect(programRound(at(19, 17, 0), W, P)).not.toContain("week-result");
    expect(programRound(at(21, 17, 0), W, P)).not.toContain("week-result");
    // гость видит итог недели — без очков его рисует сцена
    expect(programRound(at(20, 16, 30), W, { ...P, guest: true })).toContain("week-result");
  });

  it("ночью (разбуженная стена) — итог дня и круг без доски недели и без итога недели", () => {
    expect(programScene(at(18, 21, 0), W, P)).toBe("day-result");
    expect(programRound(at(20, 22, 0), W, { ...P, weekBoard: true })).toEqual(["day-result", "face", "rating", "calendar", "team"]);
  });
});

describe("programNext — что дальше и когда", () => {
  it("следующий шаг круга", () => {
    expect(programNext(at(18, 10, 1), W, P)).toEqual({ scene: "rating", at: at(18, 10, 3) });
  });

  it("с утра — день в 10:00, с понедельничного рейтинга — календарь в 9:00", () => {
    expect(programNext(at(18, 9, 58), W, P)).toEqual({ scene: "face", at: at(18, 10) });
    expect(programNext(at(16, 8, 10), W, P)).toEqual({ scene: "calendar", at: at(16, 9) });
    // утро без рейтинга: календарь стоит до 10:00, промежуточных шагов нет
    expect(programNext(at(17, 8, 10), W, P)).toEqual({ scene: "face", at: at(17, 10) });
  });

  it("на границе вечера — «Итог дня»", () => {
    expect(programNext(at(18, 16, 58), W, P)).toEqual({ scene: "day-result", at: at(18, 17) });
  });

  it("в пятницу в 16:00 круг берёт «Итог недели»", () => {
    const next = programNext(at(20, 15, 58), W, P);
    expect(next.at).toEqual(at(20, 16));
    expect(programScene(next.at, W, P)).toBe(next.scene);
  });

  it("шаг, на котором сцена не меняется, пропускает", () => {
    const next = programNext(at(18, 10, 1), W, P);
    expect(next.scene).not.toBe(programScene(at(18, 10, 1), W, P));
  });
});

describe("manualHolds — ручная заставка держится до конца отрезка", () => {
  it("поставленная в этом отрезке — держится; в прошлом — уже нет", () => {
    const row = state({ scene: "clock", scene_set_at: at(18, 10, 30).toISOString() });
    expect(manualHolds(row, at(18, 12), W)).toBe(true);
    expect(manualHolds(row, at(18, 16, 59), W)).toBe(true);
    expect(manualHolds(row, at(18, 17, 0), W)).toBe(false);
    expect(manualHolds(state({ scene: "clock", scene_set_at: at(18, 9).toISOString() }), at(18, 12), W)).toBe(false);
  });

  it("ночная — держится через полночь до утра", () => {
    const row = state({ scene: "team", scene_set_at: at(17, 22).toISOString() });
    expect(manualHolds(row, at(18, 3), W)).toBe(true);
    expect(manualHolds(row, at(18, 8), W)).toBe(false);
  });

  it("круг (carousel) — программа всегда; доска живёт своим сроком", () => {
    expect(manualHolds(state({ carousel: true, scene: "clock", scene_set_at: at(18, 11).toISOString() }), at(18, 12), W)).toBe(false);
    expect(manualHolds(state({ scene: "board", scene_set_at: at(18, 11).toISOString() }), at(18, 12), W)).toBe(false);
  });

  it("без отметки — программа; база старше D-182 (поля нет) — рука держит, как раньше", () => {
    expect(manualHolds(state({ scene: "clock", scene_set_at: null }), at(18, 12), W)).toBe(false);
    expect(manualHolds(state({ scene: "clock" }), at(18, 12), W)).toBe(true);
    expect(manualHolds(null, at(18, 12), W)).toBe(false);
  });
});

describe("welcomeOn — приветствие гостю минуту после «Пусть заходит»", () => {
  const now = at(18, 11);
  it("гость визитом: первая минута его часа", () => {
    expect(welcomeOn(state({ guest: true, guest_until: at(18, 12).toISOString() }), now)).toBe(true);
    expect(welcomeOn(state({ guest: true, guest_until: new Date(at(18, 11, 59).getTime() + 30_000).toISOString() }), now)).toBe(true);
    expect(welcomeOn(state({ guest: true, guest_until: at(18, 11, 59).toISOString() }), now)).toBe(false);
  });

  it("ручной гость и выключенный — без приветствия", () => {
    expect(welcomeOn(state({ guest: true, guest_until: null }), now)).toBe(false);
    expect(welcomeOn(state({ guest: false, guest_until: at(18, 12).toISOString() }), now)).toBe(false);
    expect(welcomeOn(null, now)).toBe(false);
  });
});
