import { describe, expect, it } from "vitest";

import type { TvState } from "./queries";
import {
  afterBoard,
  awakeUntil,
  boardLive,
  boardCapFrom,
  boardExtendTo,
  boardUntilFrom,
  burnInShift,
  calendarViewOf,
  CAROUSEL_MS,
  carouselNext,
  carouselScene,
  carouselScenes,
  clockStyleOf,
  effectiveMode,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  ratingViewOf,
  roundOn,
  sceneOf,
  shouldReload,
  weekBoardLive,
  weekEndFrom,
  weekInRound,
  SHIFT_STEP_MS,
  wallAsleep,
} from "./state";

const NOW = new Date("2026-09-18T09:00:00Z");

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
    week_board_id: null,
    week_board_until: null,
    awake_until: null,
    expires_at: null,
    version: 1,
    reload_requested_at: null,
    seen_at: null,
    applied_version: null,
    updated_by: null,
    updated_at: NOW.toISOString(),
    ...patch,
  };
}

describe("effectiveMode", () => {
  it("живой фокус на сотруднике держит стену", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T09:05:00Z" });
    expect(effectiveMode(row, NOW)).toBe("employee");
  });

  it("истёкший фокус — уже эфир, без чьей-либо команды", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T08:59:00Z" });
    expect(effectiveMode(row, NOW)).toBe("ether");
  });

  it("строки нет — эфир", () => {
    expect(effectiveMode(null, NOW)).toBe("ether");
  });

  it("одно дело на стене живёт до `expires_at`, как человек (D-123)", () => {
    expect(effectiveMode(state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T09:05:00Z" }), NOW)).toBe("task");
    expect(effectiveMode(state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T08:55:00Z" }), NOW)).toBe("ether");
    expect(effectiveMode(state({ mode: "task", task_id: null, expires_at: "2026-09-18T09:05:00Z" }), NOW)).toBe("ether");
  });
});

describe("guestOf", () => {
  it("без строки слушается стартового ?guest=1", () => {
    expect(guestOf(null, true)).toBe(true);
    expect(guestOf(null, false)).toBe(false);
  });

  it("со строкой слушается пульта", () => {
    expect(guestOf(state({ guest: true }), false)).toBe(true);
    expect(guestOf(state({ guest: false }), true)).toBe(false);
  });
});

describe("sceneOf", () => {
  it("берёт сцену из строки", () => {
    expect(sceneOf(state({ scene: "clock" }))).toBe("clock");
    expect(sceneOf(state({ scene: "calendar" }))).toBe("calendar");
  });

  it("незнакомая сцена и отсутствие строки дают лицо", () => {
    expect(sceneOf(state({ scene: "disco" }))).toBe("face");
    expect(sceneOf(null)).toBe("face");
  });
});

describe("shouldReload", () => {
  const booted = new Date("2026-09-18T08:30:00Z");

  it("просьба после загрузки страницы — перезапуск", () => {
    expect(shouldReload(state({ reload_requested_at: "2026-09-18T08:45:00Z" }), booted)).toBe(true);
  });

  it("просьба до загрузки уже исполнена — второй раз не перезапускаемся", () => {
    expect(shouldReload(state({ reload_requested_at: "2026-09-18T08:00:00Z" }), booted)).toBe(false);
    expect(shouldReload(state(), booted)).toBe(false);
    expect(shouldReload(null, booted)).toBe(false);
  });
});

describe("focusRemainingMs", () => {
  it("считает остаток фокуса", () => {
    expect(focusRemainingMs(state({ expires_at: "2026-09-18T09:07:00Z" }), NOW)).toBe(7 * 60_000);
  });

  it("истёкший срок и отсутствие строки — ноль, без отрицательных минут", () => {
    expect(focusRemainingMs(state({ expires_at: "2026-09-18T08:50:00Z" }), NOW)).toBe(0);
    expect(focusRemainingMs(null, NOW)).toBe(0);
  });
});

describe("гость с таймером (D-96)", () => {
  it("включённый визитом гость живёт до guest_until и гаснет сам", () => {
    const row = state({ guest: true, guest_until: "2026-09-18T09:30:00Z" });
    expect(guestOf(row, false, NOW)).toBe(true);
    expect(guestOf(row, false, new Date("2026-09-18T09:31:00Z"))).toBe(false);
    expect(guestEndsAt(row, NOW)?.toISOString()).toBe("2026-09-18T09:30:00.000Z");
  });

  it("ручной гость не истекает и таймера не показывает", () => {
    const row = state({ guest: true, guest_until: null });
    expect(guestOf(row, false, new Date("2026-09-19T09:00:00Z"))).toBe(true);
    expect(guestEndsAt(row, NOW)).toBeNull();
    expect(guestEndsAt(state({ guest: false, guest_until: "2026-09-18T09:30:00Z" }), NOW)).toBeNull();
  });
});

describe("clockStyleOf", () => {
  it("стрелки — только когда так сказал пульт", () => {
    expect(clockStyleOf(state({ clock_style: "analog" }))).toBe("analog");
    expect(clockStyleOf(state({ clock_style: "sundial" }))).toBe("digital");
    expect(clockStyleOf(null)).toBe("digital");
  });
});

describe("calendarViewOf", () => {
  it("месяц — только когда так сказал пульт; иначе неделя с «Сегодня»", () => {
    expect(calendarViewOf(state({ calendar_view: "month" }))).toBe("month");
    expect(calendarViewOf(state({ calendar_view: "year" }))).toBe("week");
    expect(calendarViewOf(null)).toBe("week");
  });
});

describe("isNight", () => {
  it("ночь стены — с 21:00 до 08:00 по Актобе", () => {
    // 16:00 UTC = 21:00 Актобе, 02:59 UTC = 07:59, 03:00 UTC = 08:00
    expect(isNight(new Date("2026-09-18T16:00:00Z"))).toBe(true);
    expect(isNight(new Date("2026-09-18T02:59:00Z"))).toBe(true);
    expect(isNight(new Date("2026-09-18T03:00:00Z"))).toBe(false);
    expect(isNight(new Date("2026-09-18T15:59:00Z"))).toBe(false);
  });
});

describe("разбудка с пульта (D-105)", () => {
  // 22:00 Актобе
  const NIGHT = new Date("2026-09-18T17:00:00Z");

  it("ночью пустая стена спит, днём — нет", () => {
    expect(wallAsleep(state(), NIGHT)).toBe(true);
    expect(wallAsleep(null, NIGHT)).toBe(true);
    expect(wallAsleep(state(), NOW)).toBe(false);
  });

  it("разбуженная стена не спит до отметки, потом засыпает сама", () => {
    const row = state({ awake_until: "2026-09-18T19:00:00Z" });
    expect(awakeUntil(row, NIGHT)?.toISOString()).toBe("2026-09-18T19:00:00.000Z");
    expect(wallAsleep(row, NIGHT)).toBe(false);
    // 00:00 Актобе — два часа прошли, снова ночь
    expect(awakeUntil(row, new Date("2026-09-18T19:00:00Z"))).toBeNull();
    expect(wallAsleep(row, new Date("2026-09-18T19:00:00Z"))).toBe(true);
    expect(awakeUntil(state(), NIGHT)).toBeNull();
  });

  it("фокус и живая доска будят стену и без пульта", () => {
    expect(wallAsleep(state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T17:05:00Z" }), NIGHT)).toBe(false);
    expect(wallAsleep(state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T18:00:00Z" }), NIGHT)).toBe(false);
    // истёкшие — уже нет
    expect(wallAsleep(state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T16:55:00Z" }), NIGHT)).toBe(true);
    expect(wallAsleep(state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T16:00:00Z" }), NIGHT)).toBe(true);
  });
});

describe("burnInShift", () => {
  it("сдвиг меняется раз в шаг и не больше нескольких пикселей", () => {
    const a = burnInShift(new Date(0));
    const b = burnInShift(new Date(SHIFT_STEP_MS));
    expect(a).not.toEqual(b);
    expect(burnInShift(new Date(SHIFT_STEP_MS - 1))).toEqual(a);
    for (let i = 0; i < 16; i += 1) {
      const { x, y } = burnInShift(new Date(i * SHIFT_STEP_MS));
      expect(Math.abs(x)).toBeLessThanOrEqual(6);
      expect(Math.abs(y)).toBeLessThanOrEqual(6);
    }
  });
});

describe("board on the wall (D-102)", () => {
  const up = (patch: Partial<TvState> = {}) =>
    state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T16:00:00Z", ...patch });

  it("shows the board while it lives, else the face", () => {
    expect(sceneOf(up(), NOW)).toBe("board");
    expect(boardLive(up(), NOW)).toBe(true);
    // its time is over: the face, not a board nobody put up today
    expect(sceneOf(up({ board_until: "2026-09-18T08:59:00Z" }), NOW)).toBe("face");
    // the board was deleted (board_id set null by the database)
    expect(sceneOf(up({ board_id: null }), NOW)).toBe("face");
    expect(boardLive(state(), NOW)).toBe(false);
  });

  it("keeps the board till 21:00 Aqtobe, two hours when put up later", () => {
    // 20:59 Aqtobe → 21:00 the same evening
    expect(boardUntilFrom(new Date("2026-09-18T15:59:00Z")).toISOString()).toBe("2026-09-18T16:00:00.000Z");
    // 07:30 Aqtobe, before the working day → 21:00 that day
    expect(boardUntilFrom(new Date("2026-09-18T02:30:00Z")).toISOString()).toBe("2026-09-18T16:00:00.000Z");
    // 21:00 and later → two hours
    expect(boardUntilFrom(new Date("2026-09-18T16:00:00Z")).toISOString()).toBe("2026-09-18T18:00:00.000Z");
    expect(boardUntilFrom(new Date("2026-09-18T18:00:00Z")).toISOString()).toBe("2026-09-18T20:00:00.000Z");
    // 00:30 Aqtobe (19:30 UTC the day before) is still before 21:00 of the new day
    expect(boardUntilFrom(new Date("2026-09-17T19:30:00Z")).toISOString()).toBe("2026-09-18T16:00:00.000Z");
  });

  it("never lets a chosen time or «+30 мин» run past the end of the day (D-140)", () => {
    // 10:00 Aqtobe → 21:00 the same day
    expect(boardCapFrom(new Date("2026-09-18T05:00:00Z")).toISOString()).toBe("2026-09-18T16:00:00.000Z");
    // 20:30 Aqtobe → two hours from now: an hour-long meeting still fits
    expect(boardCapFrom(new Date("2026-09-18T15:30:00Z")).toISOString()).toBe("2026-09-18T17:30:00.000Z");
    // 23:00 Aqtobe → two hours
    expect(boardCapFrom(new Date("2026-09-18T18:00:00Z")).toISOString()).toBe("2026-09-18T20:00:00.000Z");
  });

  it("extends a board to a time, from what is left or from now, under the cap (D-140)", () => {
    const now = new Date("2026-09-18T10:00:00Z"); // 15:00 Aqtobe
    expect(boardExtendTo({ board_until: "2026-09-18T10:20:00Z" }, 30, now).toISOString()).toBe("2026-09-18T10:50:00.000Z");
    // run out already: from now
    expect(boardExtendTo({ board_until: "2026-09-18T09:00:00Z" }, 30, now).toISOString()).toBe("2026-09-18T10:30:00.000Z");
    // never past 21:00
    expect(boardExtendTo({ board_until: "2026-09-18T15:50:00Z" }, 30, now).toISOString()).toBe("2026-09-18T16:00:00.000Z");
  });
});

describe("заставка «Рейтинг» и круг заставок (D-123)", () => {
  it("рейтинг — своя заставка; без очков — лицо", () => {
    expect(sceneOf(state({ scene: "rating" }), NOW)).toBe("rating");
    expect(sceneOf(state({ scene: "rating" }), NOW, false)).toBe("face");
  });

  it("период рейтинга: неделя по умолчанию, месяц — когда сказано", () => {
    expect(ratingViewOf(null)).toBe("week");
    expect(ratingViewOf(state({ rating_view: "month" }))).toBe("month");
    expect(ratingViewOf(state({ rating_view: "year" }))).toBe("week");
  });

  it("круг: лицо, рейтинг, календарь, команда; без очков — без рейтинга", () => {
    expect(carouselScenes(true)).toEqual(["face", "rating", "calendar", "team"]);
    expect(carouselScenes(false)).toEqual(["face", "calendar", "team"]);
  });

  it("заставка круга — по часам, раз в три минуты, по кругу", () => {
    const at = (step: number) => new Date(step * CAROUSEL_MS + 1000);
    expect([0, 1, 2, 3, 4].map((step) => carouselScene(at(step), true))).toEqual(["face", "rating", "calendar", "team", "face"]);
    expect([0, 1, 2, 3].map((step) => carouselScene(at(step), false))).toEqual(["face", "calendar", "team", "face"]);
  });

  it("включённый круг перебивает выбранную заставку и доску", () => {
    const round = state({ carousel: true, scene: "clock" });
    expect(sceneOf(round, new Date(1 * CAROUSEL_MS + 5))).toBe("rating");
    expect(sceneOf(round, new Date(1 * CAROUSEL_MS + 5), false)).toBe("calendar");
  });

  it("гость в кабинете убирает рейтинг из круга", () => {
    const round = state({ carousel: true });
    expect(sceneOf(round, new Date(1 * CAROUSEL_MS + 5), true, true)).toBe("calendar");
    // поставленный руками рейтинг остаётся: стена честно скажет «скрыт»
    expect(sceneOf(state({ scene: "rating" }), NOW, true, true)).toBe("rating");
  });

  it("пульт знает, что дальше и когда", () => {
    const next = carouselNext(new Date(2 * CAROUSEL_MS + 7_000), true);
    expect(next.scene).toBe("team");
    expect(next.at.getTime()).toBe(3 * CAROUSEL_MS);
  });

  it("одно дело на стене будит ночь", () => {
    const night = new Date("2026-09-18T18:00:00Z"); // 23:00 в Актобе
    expect(wallAsleep(state(), night)).toBe(true);
    expect(wallAsleep(state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T18:05:00Z" }), night)).toBe(false);
  });
});

describe("доска недели в круге заставок (D-144)", () => {
  // 14:00 Aqtobe on Friday 18 September 2026
  const DAY = new Date("2026-09-18T09:00:00Z");
  const week = { week_board_id: "w1", week_board_until: "2026-09-20T16:00:00Z" };

  it("lives till the end of its week", () => {
    expect(weekBoardLive(state(week), DAY)).toBe(true);
    expect(weekBoardLive(state(week), new Date("2026-09-20T16:00:01Z"))).toBe(false);
    expect(weekBoardLive(state(), DAY)).toBe(false);
  });

  it("ends on the coming Sunday 21:00 Aqtobe, and on Sunday night — on the next one", () => {
    expect(weekEndFrom(DAY).toISOString()).toBe("2026-09-20T16:00:00.000Z");
    // Monday morning
    expect(weekEndFrom(new Date("2026-09-14T03:00:00Z")).toISOString()).toBe("2026-09-20T16:00:00.000Z");
    // Sunday 20:59 and 21:01 Aqtobe
    expect(weekEndFrom(new Date("2026-09-20T15:59:00Z")).toISOString()).toBe("2026-09-20T16:00:00.000Z");
    expect(weekEndFrom(new Date("2026-09-20T16:01:00Z")).toISOString()).toBe("2026-09-27T16:00:00.000Z");
  });

  it("takes its turn last in the round, by day only, and never with a guest in", () => {
    expect(carouselScenes(true, true)).toEqual(["face", "rating", "calendar", "team", "board"]);
    expect(weekInRound(state(week), DAY, false)).toBe(true);
    expect(weekInRound(state(week), new Date("2026-09-18T17:00:00Z"), false)).toBe(false);
    expect(weekInRound(state(week), DAY, true)).toBe(false);
    // «Показать гостю» opens the meeting's board, not the week (D-33)
    expect(weekInRound(state({ ...week, board_guest: true }), DAY, true)).toBe(false);
  });

  it("is the scene at its step of the round", () => {
    const round = state({ ...week, carousel: true });
    // the fifth step of the round with points: face, rating, calendar, team, board
    const at = new Date(Math.ceil(DAY.getTime() / (5 * CAROUSEL_MS)) * 5 * CAROUSEL_MS + 4 * CAROUSEL_MS + 1000);
    expect(sceneOf(round, at)).toBe("board");
    expect(sceneOf(state({ carousel: true }), at)).not.toBe("board");
  });

  it("takes the wall after the meeting's board ran out — the round, as the remote sees it too", () => {
    const ran = state({ ...week, scene: "board", board_id: "m1", board_until: "2026-09-18T08:00:00Z" });
    expect(roundOn(ran, DAY)).toBe(true);
    expect(carouselScenes(true, true)).toContain(sceneOf(ran, DAY));
    // a live meeting's board holds the wall; without a week board a run-out one is the face
    expect(roundOn(state({ ...week, scene: "board", board_id: "m1", board_until: "2026-09-18T12:00:00Z" }), DAY)).toBe(false);
    expect(roundOn(state({ scene: "board", board_id: "m1", board_until: "2026-09-18T08:00:00Z" }), DAY)).toBe(false);
    expect(sceneOf(state({ scene: "board", board_id: "m1", board_until: "2026-09-18T08:00:00Z" }), DAY)).toBe("face");
  });

  it("takes a meeting's board down to the round while a week board waits", () => {
    expect(afterBoard(state(week), DAY)).toEqual({ carousel: true });
    expect(afterBoard(state(), DAY)).toEqual({ scene: "face" });
  });
});
