import { describe, expect, it } from "vitest";

import { formatPoints, leadersView, ratingSpan, type LeadersView } from "./leaders";
import type { TvLeader, TvRatingScene } from "./queries";

/** Monday, 23 November 2026, 12:00 in Aqtobe. */
const NOW = new Date("2026-11-23T07:00:00Z");
const NBSP = "\u00a0";
const NNBSP = "\u202f";

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

/** The scene for a patch, on the fixed clock. */
function at(patch: Partial<TvRatingScene> = {}) {
  return ready(leadersView(scene(patch), NOW));
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
  it("лидер слева, места 2–5 строками; заголовок и даты, за которые счёт", () => {
    const view = at();
    expect(view.leader?.rank).toBe(1);
    expect(view.rest.map((row) => row.rank)).toEqual([2, 3, 4, 5]);
    expect([view.title, view.span]).toEqual(["Рейтинг недели", "17–23 ноября"]);
    const month = at({ period: "month" });
    expect(month.title).toBe("Рейтинг месяца");
    expect(month.span).toBe(ratingSpan("month", NOW));
    expect(printed(month)).not.toMatch(/последн/);
  });

  it("очки — числом без разрядки до 10 000 и словом; рост лидера — фразой сравнения", () => {
    const view = at({ top: [leader(1, { points: 1241, delta: 60 })] });
    expect([view.leader?.points, view.leader?.pointsWord, view.leader?.growth]).toEqual(["1241", "очко", "+60"]);
    expect(view.leaderGrowth?.replace(/\s/g, " ")).toBe("на 60 больше, чем неделю назад");
    expect(at({ period: "month", top: [leader(1, { delta: 90 })] }).leaderGrowth?.replace(/\s/g, " ")).toBe("на 90 больше, чем месяц назад");
    expect(at({ top: [leader(1, { points: 12400, delta: 12000 })] }).leader).toMatchObject({ points: `12${NNBSP}400`, growth: `+12${NNBSP}000` });
  });

  it("рост лидера — с неразрывными пробелами внутри «на 60» и «чем неделю назад»", () => {
    const growth = at({ top: [leader(1, { delta: 60 })] }).leaderGrowth!;
    expect(growth.startsWith(`на${NBSP}60`)).toBe(true);
    expect(growth.endsWith(`чем${NBSP}неделю${NBSP}назад`)).toBe(true);
    expect(at({ period: "month", top: [leader(1, { delta: 60 })] }).leaderGrowth!.endsWith(`чем${NBSP}месяц${NBSP}назад`)).toBe(true);
  });

  it("рост лидера не рвётся нигде: неразрывные пробелы между всеми словами", () => {
    expect(at({ top: [leader(1, { delta: 60 })] }).leaderGrowth).toBe(`на${NBSP}60${NBSP}больше,${NBSP}чем${NBSP}неделю${NBSP}назад`);
  });

  it("падение и ноль роста не печатаются ни у лидера, ни в строках (D-45)", () => {
    const view = at({ top: [leader(1, { delta: -30 }), leader(2, { delta: 0 }), leader(3, { delta: -5 })] });
    expect(view.leader?.growth).toBeNull();
    expect(view.leaderGrowth).toBeNull();
    expect(view.rest.map((row) => row.growth)).toEqual([null, null]);
    expect(printed(view)).not.toMatch(/-|−|▼|меньше/);
  });

  it("шестой и ниже на стену не попадают, даже если база их отдала (D-45)", () => {
    const view = at({ top: [1, 2, 3, 4, 5, 6].map((rank) => leader(rank)) });
    expect([view.leader, ...view.rest].map((row) => row?.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(printed(view)).not.toMatch(/Асель/);
  });

  it("ноль и минус очков — не место на стене", () => {
    const view = at({ top: [leader(1), leader(2, { points: 0 }), leader(3, { points: -40 })] });
    expect(view.rest).toEqual([]);
  });

  it("на стене нет ни «в срок», ни штрафов, ни наград строками (D-45, D-185)", () => {
    for (const period of ["week", "month"] as const) {
      const text = printed(leadersView(scene({ period }), NOW));
      expect(text).not.toMatch(/в срок|срок|штраф|опозд|просроч|отказ|минус/i);
      expect(text).not.toMatch(/сдал объект/);
    }
    expect(Object.keys(at())).not.toContain("awards");
  });

  it("итог команды — одним предложением хорошего: закрыла дела и заработала очки", () => {
    expect(at().team).toBe("За неделю команда закрыла 48 дел и заработала 1240 очков");
    expect(at({ period: "month" }).team).toBe("За месяц команда закрыла 48 дел и заработала 1240 очков");
    expect(at({ team: { done: 0, on_time: 0, earned: 21, people: 3 } }).team).toBe("За неделю команда заработала 21 очко");
    expect(at({ team: { done: 1, on_time: 1, earned: 0, people: 3 } }).team).toBe("За неделю команда закрыла 1 дело");
    expect(at({ team: { done: 3, on_time: 0, earned: 12400, people: 3 } }).team).toBe(`За неделю команда закрыла 3 дела и заработала 12${NNBSP}400 очков`);
    expect(at({ team: { done: 0, on_time: 0, earned: 0, people: 3 } }).team).toBeNull();
  });

  it("никто не набрал очков — без лидера, итог команды остаётся", () => {
    const view = at({ top: [], riser: null, awards: [] });
    expect(view.leader).toBeNull();
    expect(view.rest).toEqual([]);
    expect(view.team).not.toBeNull();
  });

  it("аватар — только настоящий адрес фото", () => {
    const view = at({ top: [leader(1, { avatar_url: "https://x/a.jpg" }), leader(2, { avatar_url: "" })] });
    expect(view.leader?.avatar).toBe("https://x/a.jpg");
    expect(view.rest[0].avatar).toBeNull();
  });

  it("гость в кабинете — скрыто; данных нет — скрыто; очки выключены — заставки нет", () => {
    expect(leadersView(scene({ hidden: true }), NOW).state).toBe("hidden");
    expect(leadersView(null, NOW).state).toBe("hidden");
    expect(leadersView(scene({ enabled: false }), NOW).state).toBe("off");
  });
});

describe("ratingSpan — даты, за которые счёт (Asia/Aqtobe)", () => {
  it("неделя в одном месяце — «17–23 ноября»", () => {
    expect(ratingSpan("week", NOW)).toBe("17–23 ноября");
  });

  it("неделя через границу месяца — «28 октября — 3 ноября»", () => {
    expect(ratingSpan("week", new Date("2026-11-03T07:00:00Z"))).toBe("28 октября — 3 ноября");
    expect(ratingSpan("week", new Date("2027-01-02T07:00:00Z"))).toBe("27 декабря — 2 января");
  });

  it("день — по часам Актобе: 20:00 UTC 22 ноября — уже 23-е", () => {
    expect(ratingSpan("week", new Date("2026-11-22T20:00:00Z"))).toBe("17–23 ноября");
    expect(ratingSpan("week", new Date("2026-11-22T18:59:00Z"))).toBe("16–22 ноября");
  });

  it("месяц — от прошлого месяца до сегодня, через тире с пробелами", () => {
    expect(ratingSpan("month", NOW)).toMatch(/^2[34] октября — 23 ноября$/);
    expect(ratingSpan("month", new Date("2026-01-15T07:00:00Z"))).toMatch(/^1[56] декабря — 15 января$/);
  });

  it("месяц — «24 октября — 23 ноября», как неделя «17–23»: семь дней — семь чисел", () => {
    expect(ratingSpan("month", NOW)).toBe("24 октября — 23 ноября");
  });

  it("месяц от 31 марта начинается в конце февраля, а не 3 марта", () => {
    expect(ratingSpan("month", new Date("2026-03-31T07:00:00Z"))).not.toBe("3–31 марта");
  });
});

describe("formatPoints", () => {
  it("до 10 000 — цифры вместе, без пробела: «1 680» на стене читается как «1-е место, 680»", () => {
    expect(formatPoints(420)).toBe("420");
    expect(formatPoints(1680)).toBe("1680");
    expect(formatPoints(1240)).toBe("1240");
    expect(formatPoints(9999)).toBe("9999");
    expect(formatPoints(80)).toBe("80");
  });

  it("с 10 000 — узкий неразрывный пробел U+202F: число на стене не рвётся по строкам", () => {
    expect(formatPoints(12400)).toBe(`12${NNBSP}400`);
    expect(formatPoints(10000)).toBe(`10${NNBSP}000`);
    expect(formatPoints(1234567)).toBe(`1${NNBSP}234${NNBSP}567`);
    // rounded first: 9999.6 is already five digits
    expect(formatPoints(9999.6)).toBe(`10${NNBSP}000`);
    for (const n of [420, 1680, 12400, 1234567]) expect(formatPoints(n)).not.toMatch(/[ \u00a0]/);
  });
});
