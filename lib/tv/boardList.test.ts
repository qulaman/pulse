import { describe, expect, it } from "vitest";

import type { TvBoardItem, TvBoardLeaf } from "./board";
import { balanceColumns, COLUMN_GAP, fillColumns, LIST_TIERS, listLayout, pageOfPoint, rowsAt, stackHeight, titleFit, type ListLayout } from "./boardList";

// the list body under a one-line title on 16:9: 74 − 4.4 − 1.4 − 8 − 2.6
const FRAME = { width: 163.6, height: 57.6 };

function leaf(id: string, text = `Подпункт ${id}`, patch: Partial<TvBoardLeaf> = {}): TvBoardLeaf {
  return { id, text, done: false, created_at: "2026-09-25T08:00:00Z", assignee: null, handed_done: false, ...patch };
}

function point(n: number, children = 0, text = `Пункт номер ${n}`): TvBoardItem {
  return { ...leaf(`p${n}`, text), children: Array.from({ length: children }, (_, i) => leaf(`p${n}.${i + 1}`)) };
}

const points = (count: number, children: (n: number) => number = () => 0) => Array.from({ length: count }, (_, i) => point(i + 1, children(i + 1)));

/** Every column of every page fits the body; branches keep the board order; numbers run through the pages. */
function assertSound(layout: ListLayout, items: readonly TvBoardItem[], height = FRAME.height) {
  const order: string[] = [];
  for (const page of layout.pages) {
    expect(page.length).toBeLessThanOrEqual(layout.columns);
    for (const column of page) {
      expect(stackHeight(column, layout.tier)).toBeLessThanOrEqual(height + 1e-6);
      for (const row of column) order.push(row.item.id);
    }
  }
  expect(order).toEqual(items.map((item) => item.id));
  const numbers = layout.pages.flat(2).map((row) => row.n);
  expect(numbers).toEqual(items.map((_, i) => i + 1));
}

describe("listLayout", () => {
  it("три пункта — одна колонка самым крупным кеглем", () => {
    const items = points(3);
    const layout = listLayout(items, FRAME);
    expect(layout.columns).toBe(1);
    expect(layout.tier.key).toBe("xl");
    expect(layout.pages).toHaveLength(1);
    assertSound(layout, items);
  });

  it("кегль мельчает с объёмом, пока хватает одной колонки; дальше — две", () => {
    const three = listLayout(points(3), FRAME);
    const six = listLayout(points(6), FRAME);
    const eight = listLayout(points(8), FRAME);
    expect(six.columns).toBe(1);
    expect(six.tier.size).toBeLessThan(three.tier.size);
    expect(eight.columns).toBe(2);
  });

  it("решает по весу, а не по числу: пять пунктов с подпунктами уходят в две колонки", () => {
    const light = listLayout(points(5), FRAME);
    const heavy = listLayout(points(5, () => 4), FRAME);
    expect(light.columns).toBe(1);
    expect(heavy.columns).toBe(2);
    assertSound(heavy, points(5, () => 4));
  });

  it("две колонки ровные по высоте, ветка целиком в одной колонке", () => {
    const items = points(11, (n) => (n === 2 ? 3 : n === 7 ? 2 : 0));
    const layout = listLayout(items, FRAME);
    expect(layout.columns).toBe(2);
    expect(layout.pages).toHaveLength(1);
    const [left, right] = layout.pages[0];
    const diff = Math.abs(stackHeight(left, layout.tier) - stackHeight(right, layout.tier));
    // no better contiguous split exists than the chosen one
    const tallest = Math.max(stackHeight(left, layout.tier), stackHeight(right, layout.tier));
    for (let k = 1; k < items.length; k++) {
      const rows = [...left, ...right];
      const a = stackHeight(rows.slice(0, k), layout.tier);
      const b = stackHeight(rows.slice(k), layout.tier);
      expect(Math.max(a, b)).toBeGreaterThanOrEqual(tallest - 1e-6);
    }
    expect(diff).toBeLessThan(12);
    assertSound(layout, items);
  });

  it("четырнадцать пунктов — одна страница, читаемо (подпункт не мельче 2.6 vh)", () => {
    const layout = listLayout(points(14), FRAME);
    expect(layout.pages).toHaveLength(1);
    expect(layout.tier.sub).toBeGreaterThanOrEqual(2.6);
    expect(layout.tier.size).toBeGreaterThanOrEqual(2.8);
  });

  it("тридцать пунктов с подпунктами — страницы, ветки не рвутся, номера сквозные", () => {
    const items = points(30, (n) => (n % 3 === 0 ? 2 : n % 5 === 0 ? 3 : 0));
    const layout = listLayout(items, FRAME);
    expect(layout.pages.length).toBeGreaterThan(1);
    assertSound(layout, items);
    // pages even out: the last one is not a lonely leftover
    const heights = layout.pages.flatMap((page) => page.map((column) => stackHeight(column, layout.tier)));
    expect(Math.min(...heights)).toBeGreaterThan(FRAME.height * 0.4);
  });

  it("страниц столько, сколько нужно мелким кеглем, а кегль — самый крупный при том же числе страниц", () => {
    const items = points(13, (n) => (n === 2 ? 3 : n === 4 ? 4 : n % 3 === 0 ? 2 : 0));
    const layout = listLayout(items, FRAME);
    const s = LIST_TIERS.s;
    const least = Math.ceil(fillColumns(rowsAt(items, s, (FRAME.width - COLUMN_GAP) / 2, FRAME.height), s, FRAME.height).length / 2);
    expect(layout.pages.length).toBeGreaterThan(1);
    // exactly as many pages as the small size needs — no more
    expect(layout.pages.length).toBe(least);
    expect(["l", "m", "s"]).toContain(layout.tier.key);
    expect(layout.tier.size).toBeGreaterThanOrEqual(LIST_TIERS.s.size);
    assertSound(layout, items);
  });

  it("один пункт с восемью подпунктами — одна колонка, все подпункты видны", () => {
    const items = points(1, () => 8);
    const layout = listLayout(items, FRAME);
    expect(layout.columns).toBe(1);
    const row = layout.pages[0][0][0];
    expect(row.children).toHaveLength(8);
    expect(row.more).toBe(0);
    assertSound(layout, items);
  });

  it("ветка выше стены обрезается снизу — «+ ещё N», не вылезает за край", () => {
    const items = points(1, () => 40);
    const layout = listLayout(items, FRAME);
    const row = layout.pages[0][0][0];
    expect(row.more).toBeGreaterThan(0);
    expect(row.children.length + row.more).toBe(40);
    assertSound(layout, items);
  });

  it("длинный пункт — не больше трёх строк, стена не переполняется", () => {
    const long = "Надо срочно решить вопрос с парковкой для гостей и сотрудников, потому что соседи жалуются уже третью неделю, а управляющая компания не отвечает на письма и звонки, и если мы ничего не сделаем до конца месяца, будет штраф от акимата и испорченные отношения со всем бизнес-центром и арендодателем";
    const items = [point(1, 0, long), ...points(4).map((item, i) => ({ ...item, id: `q${i}` }))];
    const layout = listLayout(items, FRAME);
    const row = layout.pages.flat(2).find((r) => r.item.id === "p1");
    expect(row?.lines).toBeLessThanOrEqual(layout.tier.lines);
    assertSound(layout, items);
  });

  it("пусто — одна пустая страница", () => {
    const layout = listLayout([], FRAME);
    expect(layout.pages).toEqual([[[]]]);
  });
});

describe("balanceColumns", () => {
  it("не влезает — null, влезает — не больше колонок, чем просили", () => {
    const tier = LIST_TIERS.s;
    const rows = rowsAt(points(40), tier, 79);
    expect(balanceColumns(rows, tier, 2, FRAME.height)).toBeNull();
    const six = balanceColumns(rows, tier, 6, FRAME.height);
    expect(six).not.toBeNull();
    expect(six!.length).toBeLessThanOrEqual(6);
    expect(six!.flat()).toHaveLength(40);
  });
});

describe("pageOfPoint", () => {
  it("находит страницу подсвеченного пункта", () => {
    const items = points(40);
    const layout = listLayout(items, FRAME);
    expect(pageOfPoint(layout, "p1")).toBe(0);
    expect(pageOfPoint(layout, "p40")).toBe(layout.pages.length - 1);
    expect(pageOfPoint(layout, "nope")).toBeNull();
    expect(pageOfPoint(layout, null)).toBeNull();
  });
});

describe("titleFit", () => {
  it("короткое — крупно в строку, длинное — мельче в две", () => {
    expect(titleFit("Планёрка · понедельник", 163.6)).toMatchObject({ size: 7, lines: 1 });
    const long = "Планёрка по итогам квартала: продажи, склад, новые объекты, кадровые вопросы, бюджет на осень и подготовка к выставке в Алматы";
    const fit = titleFit(long, 163.6);
    expect(fit.size).toBeLessThan(7);
    expect(fit.lines).toBe(2);
  });
});
