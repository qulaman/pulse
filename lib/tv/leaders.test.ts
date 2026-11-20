import { describe, expect, it } from "vitest";

import { formatPoints, leadersView, type LeadersView } from "./leaders";
import type { TvLeader, TvRatingScene } from "./queries";

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
      { name: "Ерлан Беков", amount: -10, reason: "штраф за опоздание", at: "2026-09-16T05:00:00Z" },
    ],
    team: { done: 48, on_time: 41, earned: 1240, people: 9 },
    ...patch,
  };
}

function ready(view: LeadersView) {
  if (view.state !== "ready") throw new Error(view.state);
  return view;
}

/** Everything the scene would print, joined: what a passer-by could read off the wall. */
function printed(view: LeadersView): string {
  const v = ready(view);
  const rows = [v.leader, ...v.rest].filter((row) => row !== null);
  return [v.title, v.span, v.leaderGrowth, v.team, ...rows.flatMap((row) => [row.name, row.points, row.pointsWord, row.growth])]
    .filter(Boolean)
    .join(" | ");
}

describe("leadersView — заставка «Рейтинг» (D-123, D-185)", () => {
  it("лидер слева, места 2–5 строками; заголовок и срок периода", () => {
    const view = ready(leadersView(scene()));
    expect(view.leader?.rank).toBe(1);
    expect(view.rest.map((row) => row.rank)).toEqual([2, 3, 4, 5]);
    expect([view.title, view.span]).toEqual(["Рейтинг недели", "последние 7 дней"]);
    const month = ready(leadersView(scene({ period: "month" })));
    expect([month.title, month.span]).toEqual(["Рейтинг месяца", "последний месяц"]);
  });

  it("очки — числом с пробелом тысяч и словом; рост лидера — со сравнением", () => {
    const view = ready(leadersView(scene({ top: [leader(1, { points: 1241, delta: 60 })] })));
    expect([view.leader?.points, view.leader?.pointsWord, view.leader?.growth]).toEqual(["1 241", "очко", "+60"]);
    expect(view.leaderGrowth).toBe("+60 к прошлой неделе");
    expect(ready(leadersView(scene({ period: "month", top: [leader(1, { delta: 90 })] }))).leaderGrowth).toBe("+90 к прошлому месяцу");
  });

  it("падение и ноль роста не печатаются ни у лидера, ни в строках (D-45)", () => {
    const view = ready(leadersView(scene({ top: [leader(1, { delta: -30 }), leader(2, { delta: 0 }), leader(3, { delta: -5 })] })));
    expect(view.leader?.growth).toBeNull();
    expect(view.leaderGrowth).toBeNull();
    expect(view.rest.map((row) => row.growth)).toEqual([null, null]);
    expect(printed(view)).not.toMatch(/-|−|▼/);
  });

  it("шестой и ниже на стену не попадают, даже если база их отдала (D-45)", () => {
    const view = ready(leadersView(scene({ top: [1, 2, 3, 4, 5, 6].map((rank) => leader(rank)) })));
    expect([view.leader, ...view.rest].map((row) => row?.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(printed(view)).not.toMatch(/Асель/);
  });

  it("ноль и минус очков — не место на стене", () => {
    const view = ready(leadersView(scene({ top: [leader(1), leader(2, { points: 0 }), leader(3, { points: -40 })] })));
    expect(view.rest).toEqual([]);
  });

  it("на стене нет ни «в срок», ни штрафов, ни наград строками (D-45, D-185)", () => {
    const text = printed(leadersView(scene()));
    expect(text).not.toMatch(/в срок|штраф|опозд|просроч|отказ|минус/i);
    expect(text).not.toMatch(/сдал объект/);
    expect(Object.keys(ready(leadersView(scene())))).not.toContain("awards");
  });

  it("итог команды — одной строкой хорошего: сделано и очки", () => {
    expect(ready(leadersView(scene())).team).toBe("Команда за неделю: сделано 48 · 1 240 очков");
    expect(ready(leadersView(scene({ period: "month" }))).team).toBe("Команда за месяц: сделано 48 · 1 240 очков");
    expect(ready(leadersView(scene({ team: { done: 0, on_time: 0, earned: 21, people: 3 } }))).team).toBe("Команда за неделю: 21 очко");
    expect(ready(leadersView(scene({ team: { done: 0, on_time: 0, earned: 0, people: 3 } }))).team).toBeNull();
  });

  it("никто не набрал очков — без лидера, итог команды остаётся", () => {
    const view = ready(leadersView(scene({ top: [], riser: null, awards: [] })));
    expect(view.leader).toBeNull();
    expect(view.rest).toEqual([]);
    expect(view.team).not.toBeNull();
  });

  it("аватар — только настоящий адрес фото", () => {
    const view = ready(leadersView(scene({ top: [leader(1, { avatar_url: "https://x/a.jpg" }), leader(2, { avatar_url: "" })] })));
    expect(view.leader?.avatar).toBe("https://x/a.jpg");
    expect(view.rest[0].avatar).toBeNull();
  });

  it("гость в кабинете — скрыто; данных нет — скрыто; очки выключены — заставки нет", () => {
    expect(leadersView(scene({ hidden: true })).state).toBe("hidden");
    expect(leadersView(null).state).toBe("hidden");
    expect(leadersView(scene({ enabled: false })).state).toBe("off");
  });
});

describe("formatPoints", () => {
  it("тысячи — с неразрывным пробелом: число на стене не рвётся по строкам", () => {
    expect(formatPoints(1240)).toBe("1 240");
    expect(formatPoints(12480)).not.toMatch(/ /);
    expect(formatPoints(80)).toBe("80");
  });
});
