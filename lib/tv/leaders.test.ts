import { describe, expect, it } from "vitest";

import { formatPoints, leadersView } from "./leaders";
import type { TvLeader, TvRatingScene } from "./queries";

const NOW = new Date("2026-09-18T09:00:00Z"); // пятница, 14:00 в Актобе

function leader(rank: number, patch: Partial<TvLeader> = {}): TvLeader {
  return {
    id: `p${rank}`,
    name: ["Айгерим Сапарова", "Марат Ахметов", "Динара Касымова", "Ерлан Беков", "Тимур Жаксылыков", "Асель Муратова"][rank - 1],
    position: null,
    avatar_url: null,
    points: 500 - rank * 60,
    rank,
    delta: 10 * rank,
    done: 5,
    on_time: 4,
    ...patch,
  };
}

function scene(patch: Partial<TvRatingScene> = {}): TvRatingScene {
  return {
    hidden: false,
    enabled: true,
    period: "week",
    top: [1, 2, 3, 4, 5].map((rank) => leader(rank)),
    riser: { id: "p4", name: "Ерлан Беков", avatar_url: null, delta: 90, points: 260 },
    awards: [
      { name: "Марат Ахметов", amount: 50, reason: "сдал объект раньше срока", at: "2026-09-18T07:20:00Z" },
      { name: "Динара Касымова", amount: 20, reason: "помогла новичку", at: "2026-09-16T05:00:00Z" },
    ],
    team: { done: 48, on_time: 41, earned: 1240, people: 9 },
    ...patch,
  };
}

describe("leadersView — заставка «Рейтинг» (D-123)", () => {
  it("пьедестал по-настоящему: второй, первый, третий; четвёртый и пятый — списком", () => {
    const view = leadersView(scene(), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.podium.map((card) => card.rank)).toEqual([2, 1, 3]);
    expect(view.rest.map((card) => card.rank)).toEqual([4, 5]);
    expect(view.title).toBe("Рейтинг недели");
    expect(view.span).toBe("последние 7 дней");
  });

  it("очки со словом, рост — только вверх, сданное — числом хорошего", () => {
    const view = leadersView(scene({ top: [leader(1, { points: 441, delta: -30, done: 3, on_time: 0 })] }), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    const [card] = view.podium;
    expect([card.points, card.pointsWord, card.delta, card.done]).toEqual([441, "очко", null, "сдано 3"]);
  });

  it("шестой и ниже на стену не попадают, даже если база их отдала (D-45)", () => {
    const view = leadersView(scene({ top: [1, 2, 3, 4, 5, 6].map((rank) => leader(rank)) }), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    expect([...view.podium, ...view.rest].map((card) => card.rank).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("гость в кабинете — скрыто; очки выключены — заставки нет", () => {
    expect(leadersView(scene({ hidden: true }), NOW).state).toBe("hidden");
    expect(leadersView(null, NOW).state).toBe("hidden");
    expect(leadersView(scene({ enabled: false }), NOW).state).toBe("off");
  });

  it("рост, награды и итог команды", () => {
    const view = leadersView(scene({ period: "month" }), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.riser?.delta).toBe("▲ +90 к прошлому месяцу");
    expect(view.awards.map((award) => [award.amount, award.time])).toEqual([
      ["+50", "12:20"],
      ["+20", "ср 10:00"],
    ]);
    expect(view.team).toEqual(["сдано 48", "в срок 41", "1 240 очков заработано"]);
  });

  it("никто не набрал очков — пустой рейтинг, но итог команды остаётся", () => {
    const view = leadersView(scene({ top: [], riser: null, awards: [] }), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.empty).toBe(true);
    expect(view.team.length).toBeGreaterThan(0);
  });

  it("штраф в наградах не печатается", () => {
    const view = leadersView(scene({ awards: [{ name: "Ерлан", amount: -10, reason: "штраф", at: NOW.toISOString() }] }), NOW);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.awards).toEqual([]);
  });
});

describe("formatPoints", () => {
  it("тысячи — с неразрывным пробелом", () => {
    expect(formatPoints(1240)).toBe("1 240");
    expect(formatPoints(80)).toBe("80");
  });
});
