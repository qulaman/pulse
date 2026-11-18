import { describe, expect, it } from "vitest";

import {
  CHEER_GAP_MS,
  CHEER_MAX_AGE_MS,
  cheerBlocked,
  cheerNext,
  cheerOf,
  cheerQueue,
  momentBlocked,
  momentDue,
  momentSettles,
  momentWords,
  wallDay,
} from "./celebrate";
import type { TvEvent } from "./feed";

const NOW = Date.parse("2026-11-18T07:00:00Z"); // 12:00 Aqtobe

function event(kind: TvEvent["kind"], minutesAgo: number, patch: Partial<TvEvent["payload"]> = {}, id = `${kind}-${minutesAgo}`): TvEvent {
  return {
    id,
    kind,
    created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    payload: { name: "Марат Ахметов", title: "Сверка с бухгалтерией", amount: null, ...patch },
    payload_guest: { name: "Марат", title: null, amount: null },
  };
}

describe("cheerOf — плашка признания", () => {
  it("очки: имя, «+50», причина", () => {
    const cheer = cheerOf(event("points", 1, { amount: 50, title: "Сдал объект на день раньше" }), false);
    expect(cheer).toMatchObject({ kind: "points", name: "Марат Ахметов", amount: 50, detail: "Сдал объект на день раньше" });
  });

  it("принятая работа и награда — по-доброму, с заголовком", () => {
    expect(cheerOf(event("task_done", 1), false)?.detail).toBe("Принято: Сверка с бухгалтерией");
    expect(cheerOf(event("merch", 1, { title: "Худи" }), false)?.detail).toBe("Забирает награду: Худи");
  });

  it("гостю — имя без фамилии, без очков и без заголовка поручения (D-33)", () => {
    const cheer = cheerOf(event("points", 1, { amount: 50 }), true)!;
    expect(cheer.name).toBe("Марат");
    expect(cheer.amount).toBeNull();
    expect(cheerOf(event("task_done", 1), true)?.detail).toBe("Работа принята");
  });

  it("другие события и событие без имени — не плашка", () => {
    expect(cheerOf(event("task_sent", 1), false)).toBeNull();
    expect(cheerOf(event("task_accepted", 1), false)).toBeNull();
    expect(cheerOf(event("announcement", 1), false)).toBeNull();
    expect(cheerOf(event("points", 1, { name: "  " }), false)).toBeNull();
  });

  it("ноль и минус очков — без числа (D-45)", () => {
    expect(cheerOf(event("points", 1, { amount: 0 }), false)?.amount).toBeNull();
    expect(cheerOf(event("points", 1, { amount: -10 }), false)?.amount).toBeNull();
  });
});

describe("cheerQueue — очередь плашек", () => {
  it("свежие по порядку, старше 10 минут — выбрасываются, показанные — не повторяются", () => {
    const events = [event("task_done", 1), event("points", 4, { amount: 20 }), event("merch", 11)];
    const { queue } = cheerQueue(events, new Set(["task_done-1"]), NOW, false);
    expect(queue.map((c) => c.id)).toEqual(["points-4"]);
    expect(cheerQueue([event("task_done", CHEER_MAX_AGE_MS / 60_000 + 0.1)], new Set(), NOW, false).queue).toEqual([]);
  });

  it("не больше трёх; старшие лишние выпадают и больше не вернутся", () => {
    const events = [1, 2, 3, 4, 5].map((m) => event("task_done", m, {}, `e${m}`));
    const { queue, dropped } = cheerQueue(events, new Set(), NOW, false);
    expect(queue.map((c) => c.id)).toEqual(["e3", "e2", "e1"]);
    expect(dropped.sort()).toEqual(["e4", "e5"]);
  });

  it("только принятая работа, очки и награды", () => {
    const events = [event("task_sent", 1), event("task_review", 2), event("event", 3)];
    expect(cheerQueue(events, new Set(), NOW, false).queue).toEqual([]);
  });
});

describe("cheerNext — не чаще раза в 2 минуты", () => {
  const queue = cheerQueue([event("task_done", 1)], new Set(), NOW, false).queue;

  it("первая — сразу; следующая — через две минуты после прошлой", () => {
    expect(cheerNext(queue, null, NOW, false)?.id).toBe("task_done-1");
    expect(cheerNext(queue, NOW - CHEER_GAP_MS + 1000, NOW, false)).toBeNull();
    expect(cheerNext(queue, NOW - CHEER_GAP_MS, NOW, false)?.id).toBe("task_done-1");
  });

  it("ночью, поверх надписи, при подсвеченном пункте доски и во время момента — ждёт", () => {
    const off = { night: false, banner: false, boardPoint: false, moment: false };
    expect(cheerBlocked(off)).toBe(false);
    expect(cheerBlocked({ ...off, night: true })).toBe(true);
    expect(cheerBlocked({ ...off, banner: true })).toBe(true);
    expect(cheerBlocked({ ...off, boardPoint: true })).toBe(true);
    expect(cheerBlocked({ ...off, moment: true })).toBe(true);
    expect(cheerNext(queue, null, NOW, true)).toBeNull();
  });
});

describe("момент — рекорд дня и обычный день", () => {
  const pace = { done: 12, usual_now: 6, usual_day: 12, best_day: 15 };

  it("обычный день — когда принято столько, сколько обычно за день, раз в день", () => {
    expect(momentDue({ ...pace, done: 11 }, new Set())).toBeNull();
    expect(momentDue(pace, new Set())).toBe("usual");
    expect(momentDue(pace, new Set(["usual"]))).toBeNull();
  });

  it("рекорд — больше лучшего дня; рекорд закрывает и обычный день", () => {
    expect(momentDue({ ...pace, done: 15 }, new Set(["usual"]))).toBeNull();
    expect(momentDue({ ...pace, done: 16 }, new Set(["usual"]))).toBe("record");
    expect(momentDue({ ...pace, done: 16 }, new Set())).toBe("record");
    expect(momentSettles("record", { ...pace, done: 16 })).toEqual(["record", "usual"]);
    expect(momentSettles("usual", pace)).toEqual(["usual"]);
  });

  it("без истории (нули) и без сводки — моментов нет", () => {
    expect(momentDue({ done: 5, usual_now: 0, usual_day: 0, best_day: 0 }, new Set())).toBeNull();
    expect(momentDue(null, new Set())).toBeNull();
    expect(momentDue({ ...pace, done: 0 }, new Set())).toBeNull();
  });

  it("не поверх доски, человека, надписи, ночи, гостя и плашки", () => {
    const off = { night: false, guest: false, banner: false, focus: false, board: false, cheer: false };
    expect(momentBlocked(off)).toBe(false);
    for (const key of Object.keys(off) as (keyof typeof off)[]) expect(momentBlocked({ ...off, [key]: true })).toBe(true);
  });

  it("слова — только хорошие, без «из N» и процентов", () => {
    for (const kind of ["record", "usual"] as const) {
      const words = momentWords(kind);
      expect(`${words.title} ${words.line}`).not.toMatch(/из \d|%|меньше|хуже|отста/);
    }
  });

  it("день стены — по Актобе", () => {
    expect(wallDay(new Date("2026-11-18T18:59:00Z"))).toBe("2026-11-18");
    expect(wallDay(new Date("2026-11-18T19:00:00Z"))).toBe("2026-11-19");
  });
});
