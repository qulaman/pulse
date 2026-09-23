import { describe, expect, it } from "vitest";

import type { TvState } from "./queries";
import {
  awakeUntil,
  boardLive,
  boardUntilFrom,
  burnInShift,
  calendarViewOf,
  clockStyleOf,
  effectiveMode,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  sceneOf,
  shouldReload,
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
    board_id: null,
    board_until: null,
    board_guest: false,
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

  it("строки нет — эфир, и режим `task` пока тоже эфир", () => {
    expect(effectiveMode(null, NOW)).toBe("ether");
    expect(effectiveMode(state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T09:05:00Z" }), NOW)).toBe("ether");
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
});
