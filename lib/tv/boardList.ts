import { tagOf, type TvBoardItem, type TvBoardLeaf } from "./board";
import { textLines } from "./boardText";

/**
 * «Список» доски на стене (D-121) — чистыми функциями. Пункт с подпунктами — ветка; её
 * высота («вес») считается заранее по длине текста и ширине колонки, и уже по весу, а не по
 * числу пунктов, решается раскладка:
 *  - одна колонка, пока доска влезает крупно (три кегля, от большого к среднему);
 *  - две колонки, сбалансированные по высоте — ветка не рвётся между колонками;
 *  - дальше страницы по две колонки, ветка целиком на одной странице, номера сквозные.
 * Кегль подбирается под объём: три пункта — крупно, четырнадцать — мельче, но подпункт не
 * мельче 2.6 vh (читается с 3–4 м на 55"). Все размеры — в vh: 1080p, 4K и 55" одинаковы.
 */

/** Кегль списка: всё, из чего складывается высота ветки, — те же числа рисует `TvBoardList`. */
export type ListTier = {
  key: "xl" | "l" | "m" | "s" | "xs";
  /** Пункт: кегль и интерлиньяж. */
  size: number;
  lh: number;
  /** Не больше строк у пункта, дальше многоточие. */
  lines: number;
  /** Кружок с номером и отступ от него до текста. */
  badge: number;
  gap: number;
  /** Поля подложки пункта (она же подсветка ведущего). */
  padX: number;
  padY: number;
  /** «→ Марат» под пунктом. */
  tag: number;
  tagLh: number;
  tagTop: number;
  /** Подпункт: кегль, интерлиньяж, строк не больше. */
  sub: number;
  subLh: number;
  subLines: number;
  /** От пункта до первого подпункта и между подпунктами. */
  subTop: number;
  subGap: number;
  /** Точка-маркер подпункта и отступ от неё. */
  dot: number;
  dotGap: number;
  /** Между ветками в колонке. */
  rowGap: number;
};

export const LIST_TIERS: Record<ListTier["key"], ListTier> = {
  xl: { key: "xl", size: 5.2, lh: 6.4, lines: 3, badge: 6.8, gap: 2.8, padX: 2.4, padY: 1.4, tag: 2.8, tagLh: 3.4, tagTop: 0.4, sub: 3.6, subLh: 4.6, subLines: 2, subTop: 1, subGap: 0.5, dot: 1.1, dotGap: 1.6, rowGap: 1.4 },
  l: { key: "l", size: 4.4, lh: 5.6, lines: 3, badge: 6.2, gap: 2.6, padX: 2.4, padY: 1.3, tag: 2.6, tagLh: 3.2, tagTop: 0.4, sub: 3.2, subLh: 4.2, subLines: 2, subTop: 0.8, subGap: 0.4, dot: 1, dotGap: 1.5, rowGap: 1.2 },
  m: { key: "m", size: 3.7, lh: 4.8, lines: 3, badge: 5.4, gap: 2.2, padX: 2, padY: 1.1, tag: 2.4, tagLh: 3, tagTop: 0.3, sub: 2.9, subLh: 3.8, subLines: 2, subTop: 0.7, subGap: 0.35, dot: 0.9, dotGap: 1.4, rowGap: 1 },
  s: { key: "s", size: 3.1, lh: 4.1, lines: 2, badge: 4.6, gap: 2, padX: 1.8, padY: 0.9, tag: 2.2, tagLh: 2.8, tagTop: 0.2, sub: 2.7, subLh: 3.5, subLines: 2, subTop: 0.5, subGap: 0.3, dot: 0.8, dotGap: 1.2, rowGap: 0.8 },
  xs: { key: "xs", size: 2.8, lh: 3.7, lines: 2, badge: 4.2, gap: 1.8, padX: 1.6, padY: 0.8, tag: 2.1, tagLh: 2.6, tagTop: 0.2, sub: 2.6, subLh: 3.3, subLines: 2, subTop: 0.4, subGap: 0.25, dot: 0.8, dotGap: 1.1, rowGap: 0.6 },
};

/** Промежуток между двумя колонками. */
export const COLUMN_GAP = 5;

/** Какие раскладки пробовать, от лучшей: одна колонка крупно, потом две, мельчая. */
const CANDIDATES: readonly (readonly [1 | 2, ListTier["key"]])[] = [
  [1, "xl"],
  [1, "l"],
  [1, "m"],
  [2, "l"],
  [2, "m"],
  [2, "s"],
  [2, "xs"],
];
/**
 * Страниц столько, сколько нужно этим кеглем: мельче незачем — всё равно есть следующая
 * страница. А сам кегль страниц — самый крупный из `PAGE_TIERS`, при котором страниц не больше.
 */
const PAGE_TIER: ListTier["key"] = "s";
const PAGE_TIERS: readonly ListTier["key"][] = ["l", "m", "s"];

export type ListLeaf = { leaf: TvBoardLeaf; lines: number; tag: string | null };

/** Ветка в списке: пункт, его номер на доске, сколько строк ему дано, подпункты. */
export type ListRow = {
  item: TvBoardItem;
  n: number;
  lines: number;
  tag: string | null;
  children: ListLeaf[];
  /** Подпунктов не влезло — «+ ещё 3». */
  more: number;
  height: number;
};

export type ListLayout = {
  tier: ListTier;
  columns: 1 | 2;
  columnWidth: number;
  /** Страница → колонки → ветки. Одна страница — листать нечего. */
  pages: ListRow[][][];
};

/** Кружок с номером выше строки — текст опускается, чтобы первая строка встала по его центру. */
export function textTop(tier: ListTier): number {
  return Math.max(0, (tier.badge - tier.lh) / 2);
}

/** Ширина текста пункта и подпункта в колонке `width`. */
export function textWidths(tier: ListTier, width: number): { point: number; leaf: number } {
  const point = width - tier.padX * 2 - tier.badge - tier.gap;
  return { point, leaf: point - tier.dot - tier.dotGap };
}

/** Текст подпункта с его пометкой — они в одной строке. */
function leafText(leaf: TvBoardLeaf): string {
  const tag = tagOf(leaf);
  return tag ? `${leaf.text} ${tag}` : leaf.text;
}

/** Высота ветки, если показать `shown` подпунктов из `children`. */
function rowHeight(tier: ListTier, lines: number, tag: string | null, children: readonly ListLeaf[], more: number): number {
  const text = textTop(tier) + lines * tier.lh + (tag ? tier.tagTop + tier.tagLh : 0);
  let height = tier.padY * 2 + Math.max(tier.badge, text);
  const rows = children.length + (more > 0 ? 1 : 0);
  if (rows > 0) {
    height += tier.subTop + children.reduce((sum, child) => sum + child.lines * tier.subLh, 0) + (more > 0 ? tier.subLh : 0);
    height += tier.subGap * (rows - 1);
  }
  return height;
}

/**
 * Ветки в колонке шириной `width`. `cap` — самая высокая ветка, какую можно поставить: у
 * длинной ветки подпункты обрезаются снизу, последняя строка — «+ ещё N».
 */
export function rowsAt(items: readonly TvBoardItem[], tier: ListTier, width: number, cap = Infinity): ListRow[] {
  const widths = textWidths(tier, width);
  return items.map((item, index) => {
    const tag = tagOf(item);
    const lines = textLines(item.text, widths.point, tier.size, tier.lines, "point").lines;
    const all = item.children.map((leaf) => ({ leaf, lines: textLines(leafText(leaf), widths.leaf, tier.sub, tier.subLines, "leaf").lines, tag: tagOf(leaf) }));
    let shown = all.length;
    let height = rowHeight(tier, lines, tag, all, 0);
    while (height > cap && shown > 0) {
      shown -= 1;
      height = rowHeight(tier, lines, tag, all.slice(0, shown), all.length - shown);
    }
    return { item, n: index + 1, lines, tag, children: all.slice(0, shown), more: all.length - shown, height };
  });
}

/** Высота колонки из веток. */
export function stackHeight(rows: readonly ListRow[], tier: ListTier): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.height, 0) + tier.rowGap * (rows.length - 1);
}

/** Ветки подряд по колонкам высотой не больше `capacity` — жадно, порядок сохраняется. */
export function fillColumns(rows: readonly ListRow[], tier: ListTier, capacity: number): ListRow[][] {
  const columns: ListRow[][] = [];
  let column: ListRow[] = [];
  let used = 0;
  for (const row of rows) {
    const next = column.length === 0 ? row.height : used + tier.rowGap + row.height;
    if (column.length > 0 && next > capacity) {
      columns.push(column);
      column = [row];
      used = row.height;
    } else {
      column.push(row);
      used = next;
    }
  }
  if (column.length > 0) columns.push(column);
  return columns;
}

/**
 * Ветки по не более чем `count` колонкам так, чтобы самая высокая была как можно ниже:
 * двоичный поиск по высоте колонки, жадная раскладка при найденной высоте. Колонки выходят
 * ровными, ветки — по порядку доски. Не влезает в `height` — null.
 */
export function balanceColumns(rows: readonly ListRow[], tier: ListTier, count: number, height: number): ListRow[][] | null {
  if (rows.length === 0) return [];
  let low = Math.max(...rows.map((row) => row.height));
  let high = stackHeight(rows, tier);
  if (low > height) return null;
  if (fillColumns(rows, tier, Math.min(high, height)).length > count) return null;
  high = Math.min(high, height);
  for (let step = 0; step < 32 && high - low > 0.01; step++) {
    const mid = (low + high) / 2;
    if (fillColumns(rows, tier, mid).length <= count) high = mid;
    else low = mid;
  }
  return fillColumns(rows, tier, high);
}

/**
 * Раскладка списка в поле `width × height` (vh): первая подходящая из кандидатов, иначе —
 * страницы. Одна ветка на весь экран (пункт и тридцать подпунктов) обрезается снизу.
 */
export function listLayout(items: readonly TvBoardItem[], frame: { width: number; height: number }): ListLayout {
  const half = (frame.width - COLUMN_GAP) / 2;
  for (const [columns, key] of CANDIDATES) {
    const tier = LIST_TIERS[key];
    if (columns === 1) {
      const rows = rowsAt(items, tier, frame.width);
      if (stackHeight(rows, tier) <= frame.height) return { tier, columns: 1, columnWidth: frame.width, pages: [[rows]] };
      continue;
    }
    if (items.length < 2) continue;
    const split = balanceColumns(rowsAt(items, tier, half), tier, 2, frame.height);
    if (split) return { tier, columns: 2, columnWidth: half, pages: [split] };
  }

  const tier = LIST_TIERS[PAGE_TIER];
  const rows = rowsAt(items, tier, half, frame.height);
  const least = fillColumns(rows, tier, frame.height).length;
  if (least <= 1) {
    // one branch taller than the wall: one column at full width, its sub-points cut from below
    return { tier, columns: 1, columnWidth: frame.width, pages: [[rowsAt(items, tier, frame.width, frame.height)]] };
  }
  const pages = Math.ceil(least / 2);
  // as many pages as the small size needs, but set as large as those pages allow: two pages
  // of a bigger size read better than two half-empty pages of a small one
  for (const key of PAGE_TIERS) {
    const big = LIST_TIERS[key];
    const bigRows = rowsAt(items, big, half, frame.height);
    if (key !== PAGE_TIER && bigRows.some((row) => row.more > 0)) continue;
    const columns = balanceColumns(bigRows, big, pages * 2, frame.height);
    if (columns) return { tier: big, columns: 2, columnWidth: half, pages: pairs(columns) };
  }
  return { tier, columns: 2, columnWidth: half, pages: pairs(fillColumns(rows, tier, frame.height)) };
}

function pairs(columns: ListRow[][]): ListRow[][][] {
  const grouped: ListRow[][][] = [];
  for (let at = 0; at < columns.length; at += 2) grouped.push(columns.slice(at, at + 2));
  return grouped;
}

/** На какой странице пункт (ведущий подсветил его — стена сама встаёт на неё); нет его — null. */
export function pageOfPoint(layout: ListLayout, id: string | null): number | null {
  if (!id) return null;
  const at = layout.pages.findIndex((page) => page.some((column) => column.some((row) => row.item.id === id)));
  return at < 0 ? null : at;
}

/* -------------------------------------------------------------------------- */
/* Название                                                                   */
/* -------------------------------------------------------------------------- */

export type TitleFit = { size: number; lh: number; lines: number };

const TITLE_FITS: readonly { size: number; lh: number; lines: number }[] = [
  { size: 7, lh: 8, lines: 1 },
  { size: 5.6, lh: 6.6, lines: 2 },
  { size: 4.6, lh: 5.6, lines: 2 },
];

/** Название во всю ширину: одной строкой крупно, длинное — мельче в две, дальше многоточие. */
export function titleFit(title: string, width: number): TitleFit {
  for (const fit of TITLE_FITS) {
    const { lines, clamped } = textLines(title, width, fit.size, fit.lines, "title");
    if (!clamped) return { ...fit, lines };
  }
  const last = TITLE_FITS[TITLE_FITS.length - 1];
  return { ...last, lines: last.lines };
}
