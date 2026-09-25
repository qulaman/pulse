import { describe, expect, it } from "vitest";

import type { TvBoardItem, TvBoardLeaf } from "./board";
import { boxOf, elbow, MAP_LEAVES_MAX, mapCollisions, mapLayout, rectsOverlap, ribbon, splitSides, type MapLayout } from "./boardMap";

// the map field on 16:9: 74 − 4.4 − 1.4 tall, 92% of 177.8 wide
const FRAME = { width: 163.6, height: 68.2 };
const LONG =
  "Надо срочно решить вопрос с парковкой для гостей и сотрудников, потому что соседи жалуются уже третью неделю, а управляющая компания не отвечает на письма и звонки, и если мы ничего не сделаем до конца месяца, будет штраф от акимата и испорченные отношения со всем бизнес-центром и арендодателем";
const TEXTS = [
  "Отгрузка Казхром до пятницы",
  "Новый прайс на мерч — согласовать с бухгалтерией",
  "Отпуск бухгалтера в октябре",
  "Ремонт склада: смета к среде",
  "Кого берём на выставку в Алматы",
  "Проверить договор аренды второго офиса",
  "Закупка ноутбуков для отдела продаж",
  "Тренинг по технике безопасности",
  "Итоги квартала — к пятнице",
  "Новые визитки для команды",
  "Встреча с банком по кредитной линии",
  "Корпоратив: дата и место",
];

function leaf(id: string, text: string, patch: Partial<TvBoardLeaf> = {}): TvBoardLeaf {
  return { id, text, done: false, created_at: "2026-09-25T08:00:00Z", assignee: null, handed_done: false, ...patch };
}

function point(n: number, children: string[] = [], text = TEXTS[(n - 1) % TEXTS.length]): TvBoardItem {
  return { ...leaf(`p${n}`, text), children: children.map((t, i) => leaf(`p${n}.${i + 1}`, t)) };
}

function layoutOf(items: TvBoardItem[], title = "Планёрка · понедельник"): MapLayout {
  const layout = mapLayout(title, items, FRAME);
  expect(layout).not.toBeNull();
  return layout!;
}

function assertClean(layout: MapLayout, items: TvBoardItem[]) {
  expect(mapCollisions(layout)).toEqual([]);
  expect(layout.branches.map((branch) => branch.item.id)).toEqual(items.map((item) => item.id));
  expect(layout.branches.map((branch) => branch.n)).toEqual(items.map((_, i) => i + 1));
}

const SUBS = ["Сверить остатки", "Позвонить Марату", "Счёт от поставщика", "Проверить пропуска", "Фото с объекта", "Акт сверки"];

describe("mapLayout", () => {
  it("пять ветвей: первые — справа сверху вниз, остальные — слева сверху вниз, ничего не пересекается и не обрезано", () => {
    const items = [point(1, SUBS.slice(0, 3)), point(2), point(3, SUBS.slice(0, 2)), point(4), point(5)];
    const layout = layoutOf(items);
    assertClean(layout, items);
    // five short points with a few leaves: the biggest size, every leaf on the map
    expect(layout.tier.key).toBe("a");
    expect(layout.branches.flatMap((b) => b.leaves).every((l) => l.leaf !== null)).toBe(true);
    const right = layout.branches.filter((b) => b.side === "right");
    const left = layout.branches.filter((b) => b.side === "left");
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    // board order: all right branches come before the left ones, each side top to bottom
    expect(right.every((b) => left.every((l) => b.n < l.n))).toBe(true);
    for (const side of [right, left]) for (let i = 1; i < side.length; i++) expect(side[i].rect.y).toBeGreaterThan(side[i - 1].rect.y);
    // sides sit on their sides of the title
    const cx = layout.center.rect.x + layout.center.rect.w / 2;
    expect(right.every((b) => b.rect.x > cx)).toBe(true);
    expect(left.every((b) => b.rect.x + b.rect.w < cx)).toBe(true);
  });

  it("одна ветвь — справа, карта отцентрована по ширине", () => {
    const items = [point(1, SUBS.slice(0, 2))];
    const layout = layoutOf(items);
    assertClean(layout, items);
    expect(layout.branches[0].side).toBe("right");
    const rects = [layout.center.rect, layout.branches[0].rect, ...layout.branches[0].leaves.map((l) => l.rect)];
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    expect(Math.abs(minX - (FRAME.width - maxX))).toBeLessThan(0.1);
  });

  it("листья висят под своей ветвью и растут наружу", () => {
    const items = [point(1, SUBS.slice(0, 2)), point(2, SUBS.slice(0, 3))];
    const layout = layoutOf(items);
    for (const branch of layout.branches) {
      for (const leaf of branch.leaves) {
        expect(leaf.rect.y).toBeGreaterThanOrEqual(branch.rect.y + branch.rect.h);
        if (branch.side === "right") expect(leaf.rect.x).toBeGreaterThan(branch.rect.x);
        else expect(leaf.rect.x + leaf.rect.w).toBeLessThan(branch.rect.x + branch.rect.w);
      }
    }
  });

  it("одна ветвь с восемью подпунктами — четыре листа и «+ ещё 4»", () => {
    const items = [point(1, [...SUBS, "Ещё один", "И последний"])];
    const layout = layoutOf(items);
    assertClean(layout, items);
    const leaves = layout.branches[0].leaves;
    expect(leaves.filter((l) => l.leaf !== null)).toHaveLength(MAP_LEAVES_MAX);
    expect(leaves[leaves.length - 1]).toMatchObject({ leaf: null, more: 4 });
  });

  it("двенадцать ветвей, у многих листья, — влезает, по шесть на сторону", () => {
    const items = Array.from({ length: 12 }, (_, i) => point(i + 1, i % 2 === 0 ? SUBS.slice(0, 1 + (i % 4)) : []));
    const layout = layoutOf(items);
    assertClean(layout, items);
    expect(layout.branches.filter((b) => b.side === "right")).toHaveLength(6);
  });

  it("двенадцать ветвей по четыре листа — мельчит и прячет листья за «+N», но влезает", () => {
    const items = Array.from({ length: 12 }, (_, i) => point(i + 1, SUBS.slice(0, 4)));
    const layout = layoutOf(items);
    assertClean(layout, items);
    for (const branch of layout.branches) {
      const shown = branch.leaves.filter((l) => l.leaf !== null).length;
      const more = branch.leaves.find((l) => l.leaf === null)?.more ?? 0;
      expect(shown + more).toBe(4);
    }
  });

  it("длинные тексты и длинное название — зажаты по строкам, не вылезают", () => {
    const title = "Планёрка по итогам квартала: продажи, склад, новые объекты, кадровые вопросы, бюджет на осень и подготовка к выставке в Алматы";
    const items = [point(1, [LONG, "Коротко"], LONG), point(2, [LONG]), point(3), point(4, [], LONG)];
    const layout = layoutOf(items, title);
    assertClean(layout, items);
    expect(layout.center.lines).toBeLessThanOrEqual(4);
    for (const branch of layout.branches) expect(branch.lines).toBeLessThanOrEqual(layout.tier.lines);
  });

  it("поле 16:10 — уже, но карта всё равно влезает", () => {
    const items = Array.from({ length: 8 }, (_, i) => point(i + 1, i < 3 ? SUBS.slice(0, 3) : []));
    const layout = mapLayout("Доска · 25 сент.", items, { width: 147, height: 68.2 });
    expect(layout).not.toBeNull();
    expect(mapCollisions(layout!)).toEqual([]);
  });
});

describe("splitSides", () => {
  it("делит по весу: тяжёлая первая ветвь одна справа против лёгких слева", () => {
    expect(splitSides([30, 5, 5, 5, 5], 2)).toBe(1);
  });

  it("равные ветви — поровну, при нечётном числе справа на одну больше", () => {
    expect(splitSides([8, 8, 8, 8], 2)).toBe(2);
    expect(splitSides([8, 8, 8, 8, 8], 2)).toBe(3);
    expect(splitSides([8], 2)).toBe(1);
    expect(splitSides([], 2)).toBe(0);
  });
});

describe("кривые и проверка", () => {
  it("лента — замкнутая Безье, стебель — вниз и плавно наружу", () => {
    expect(ribbon(0, 10, 10, 20, 2, 1)).toBe("M0 9C5 9 5 19.5 10 19.5L10 20.5C5 20.5 5 11 0 11Z");
    expect(elbow(0, 0, 5, 10)).toBe("M0 0L0 9Q0 10 1 10L5 10");
    // on the left side the stem turns the other way
    expect(elbow(10, 0, 5, 10)).toBe("M10 0L10 9Q10 10 9 10L5 10");
    expect(boxOf(elbow(0, 0, 5, 10))).toEqual({ x: 0, y: 0, w: 5, h: 10 });
  });

  it("находит пересечение и выход за край", () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    const items = [point(1), point(2)];
    const layout = layoutOf(items);
    const broken = { ...layout, branches: layout.branches.map((b, i) => (i === 1 ? { ...b, rect: { ...layout.branches[0].rect } } : b)) };
    expect(mapCollisions(broken).length).toBeGreaterThan(0);
    const off = { ...layout, center: { ...layout.center, rect: { ...layout.center.rect, x: -5 } } };
    expect(mapCollisions(off).some((p) => p.includes("off the field"))).toBe(true);
  });
});
