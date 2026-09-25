import { tagOf, type TvBoardItem, type TvBoardLeaf } from "./board";
import { lineWidth, textLines } from "./boardText";

/**
 * «Карта» доски на стене (D-121) — карта мыслей чистой функцией: название — узел в центре,
 * пункты — ветви вправо и влево на плавных лентах (кубические Безье), подпункты — листья
 * своей ветви: они висят под ней на «стебле» и расходятся наружу, от центра. Раскладка — в vh
 * внутри поля `width × height`, и она обязана влезть целиком: узлы не пересекаются, связи
 * идут в промежутках и не режут текст (проверка — `mapCollisions`, тесты — `boardMap.test.ts`).
 *
 * Почему листья под ветвью, а не сбоку, как в XMind: на стене пункт — фраза в 30–50 знаков, а
 * читать её надо с 3–4 м. Сбоку ветвь и её листья делят половину экрана на двоих, и обе
 * колонки рвутся по 10–12 знаков в строку. Под ветвью каждая получает всю сторону — фраза
 * встаёт в одну-две строки. Форма карты остаётся: центр, ленты влево и вправо, у ветви её
 * листья, всё растёт наружу.
 *
 * Порядок ветвей: правая сторона — первые пункты сверху вниз, левая — остальные тоже сверху
 * вниз. Так делают XMind и MindNode (первая ветвь — «на час дня»), и так естественнее для
 * русского текста: взгляд дочитывает название слева направо и попадает на пункт 1, а каждая
 * сторона читается как обычный список сверху вниз. «По часовой» левая сторона шла бы снизу
 * вверх — номера 7, 6, 5 сверху вниз читаются хуже, а номера у ветвей делают переход с правой
 * стороны на левую явным.
 *
 * Не влезает — стена мельчит кегль, потом листья в одну строку, потом прячет лишние листья за
 * «+N». Из попыток берётся первая, где ничего не обрезано; если такой нет — где потерь меньше
 * всего. Больше двенадцати ветвей карта не рисуется вовсе (`mapFits`).
 */

export type MapRect = { x: number; y: number; w: number; h: number };

/** Кегль карты: ветвь, лист, промежутки. Те же числа рисует `TvBoardMap`. */
export type MapTier = {
  key: "a" | "b" | "c";
  /** Ветвь: кегль, интерлиньяж, строк не больше, кружок номера, поля. */
  size: number;
  lh: number;
  lines: number;
  badge: number;
  gap: number;
  padX: number;
  padY: number;
  /** Лист: кегль, интерлиньяж, промежуток между листьями, отступ от ветви до первого. */
  leaf: number;
  leafLh: number;
  leafGap: number;
  leafTop: number;
  /** Точка листа (радиус) и отступ от неё до текста. */
  dot: number;
  dotGap: number;
  /** Стебель листьев — от внутреннего края ветви, под её номером; листья — отступом от края. */
  spine: number;
  indent: number;
  /** Лента центр → ветвь: длина по горизонтали. */
  link: number;
  /** Наименьший промежуток между ветвями одной стороны. */
  blockGap: number;
};

const tier = (t: Omit<MapTier, "spine" | "indent">): MapTier => {
  // the spine drops from under the number; the leaf's dot sits a turn of the elbow further out
  const spine = t.padX + t.badge / 2;
  return { ...t, spine, indent: spine + 1.4 };
};

export const MAP_TIERS: Record<MapTier["key"], MapTier> = {
  a: tier({ key: "a", size: 3.2, lh: 4, lines: 2, badge: 4.2, gap: 1.3, padX: 1.5, padY: 1, leaf: 2.7, leafLh: 3.4, leafGap: 0.45, leafTop: 0.9, dot: 0.5, dotGap: 1, link: 5.5, blockGap: 2.2 }),
  b: tier({ key: "b", size: 2.9, lh: 3.7, lines: 2, badge: 3.9, gap: 1.2, padX: 1.3, padY: 0.85, leaf: 2.6, leafLh: 3.2, leafGap: 0.35, leafTop: 0.7, dot: 0.5, dotGap: 0.9, link: 5, blockGap: 1.4 }),
  c: tier({ key: "c", size: 2.7, lh: 3.4, lines: 2, badge: 3.6, gap: 1.1, padX: 1.2, padY: 0.7, leaf: 2.5, leafLh: 3.1, leafGap: 0.25, leafTop: 0.5, dot: 0.45, dotGap: 0.8, link: 4.5, blockGap: 0.9 }),
};

/** Листьев у ветви на карте — не больше четырёх, дальше «+N». */
export const MAP_LEAVES_MAX = 4;

/** Что пробовать, от лучшего: кегль, сколько листьев у ветви, строк у листа. */
const ATTEMPTS: readonly { tier: MapTier["key"]; leaves: number; leafLines: number }[] = [
  { tier: "a", leaves: MAP_LEAVES_MAX, leafLines: 2 },
  { tier: "b", leaves: MAP_LEAVES_MAX, leafLines: 2 },
  { tier: "b", leaves: MAP_LEAVES_MAX, leafLines: 1 },
  { tier: "c", leaves: MAP_LEAVES_MAX, leafLines: 1 },
  { tier: "c", leaves: 3, leafLines: 1 },
  { tier: "c", leaves: 2, leafLines: 1 },
  { tier: "c", leaves: 1, leafLines: 1 },
  { tier: "c", leaves: 0, leafLines: 1 },
];
/** Спрятанный за «+N» лист хуже обрезанной строки. */
const HIDDEN_COST = 1.5;

/** Название в центре: крупно в две строки, длинное — мельче и шире. */
const CENTER_FITS: readonly { size: number; lh: number; lines: number; maxW: number }[] = [
  { size: 4.4, lh: 5.2, lines: 2, maxW: 30 },
  { size: 3.8, lh: 4.6, lines: 3, maxW: 32 },
  { size: 3.2, lh: 4, lines: 4, maxW: 34 },
];
export const CENTER_PAD_X = 2.4;
export const CENTER_PAD_Y = 1.8;
const CENTER_MIN_W = 20;

/** Толщина ленты связи центр → ветвь: у центра и у ветви. */
const RIBBON_FROM = 0.9;
const RIBBON_TO = 0.28;
/** Радиус поворота стебля к листу. */
const ELBOW = 1;

export type MapCenter = { rect: MapRect; size: number; lh: number; lines: number };

export type MapLeaf = {
  /** null — строка «+ ещё N». */
  leaf: TvBoardLeaf | null;
  more: number;
  rect: MapRect;
  lines: number;
  tag: string | null;
  /** Центр точки листа — у его внутреннего края, туда приходит стебель. */
  dotX: number;
  dotY: number;
  /** Стебель от ветви к листу. */
  path: string;
};

export type MapBranch = {
  item: TvBoardItem;
  /** Номер пункта на доске. */
  n: number;
  side: "right" | "left";
  /** Оттенок ветви: 0…3, по кругу (акцент и его приглушённые тона, не радуга). */
  tone: number;
  rect: MapRect;
  lines: number;
  tag: string | null;
  leaves: MapLeaf[];
  /** Лента от центра к ветви — залитый контур. */
  path: string;
};

export type MapLayout = {
  width: number;
  height: number;
  tier: MapTier;
  center: MapCenter;
  branches: MapBranch[];
};

const r2 = (value: number) => Math.round(value * 100) / 100;

/* -------------------------------------------------------------------------- */
/* Кривые                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Лента-кривая от (x0, y0) к (x1, y1), сужающаяся от `w0` к `w1`: две смещённые кубические
 * Безье с горизонтальными касательными на концах и замыкание. Касательные горизонтальны,
 * поэтому смещение по вертикали и есть смещение по нормали.
 */
export function ribbon(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): string {
  const k = (x1 - x0) / 2;
  const a = w0 / 2;
  const b = w1 / 2;
  return [
    `M${r2(x0)} ${r2(y0 - a)}`,
    `C${r2(x0 + k)} ${r2(y0 - a)} ${r2(x1 - k)} ${r2(y1 - b)} ${r2(x1)} ${r2(y1 - b)}`,
    `L${r2(x1)} ${r2(y1 + b)}`,
    `C${r2(x1 - k)} ${r2(y1 + b)} ${r2(x0 + k)} ${r2(y0 + a)} ${r2(x0)} ${r2(y0 + a)}Z`,
  ].join("");
}

/**
 * Стебель к листу: вниз от ветви по `x0` и плавным поворотом наружу к точке листа. Все пары
 * координат — «x y», чтобы путь можно было сдвинуть и измерить (`boxOf`).
 */
export function elbow(x0: number, y0: number, x1: number, y1: number): string {
  const dir = x1 >= x0 ? 1 : -1;
  const r = Math.max(0, Math.min(ELBOW, Math.abs(x1 - x0), y1 - y0));
  return `M${r2(x0)} ${r2(y0)}L${r2(x0)} ${r2(y1 - r)}Q${r2(x0)} ${r2(y1)} ${r2(x0 + dir * r)} ${r2(y1)}L${r2(x1)} ${r2(y1)}`;
}

/* -------------------------------------------------------------------------- */
/* Раскладка                                                                  */
/* -------------------------------------------------------------------------- */

function leafText(leaf: TvBoardLeaf): string {
  const tag = tagOf(leaf);
  return tag ? `${leaf.text} ${tag}` : leaf.text;
}

function centerFit(title: string): MapCenter {
  const text = title.trim() || "Доска";
  for (const [index, fit] of CENTER_FITS.entries()) {
    const inner = fit.maxW - CENTER_PAD_X * 2;
    const { lines, clamped } = textLines(text, inner, fit.size, fit.lines, "title");
    if (clamped && index < CENTER_FITS.length - 1) continue;
    // as narrow as the lines allow: a short title is a compact node, not a wide slab
    const natural = lineWidth(text, fit.size, "title");
    let w = lines === 1 ? Math.min(fit.maxW, natural + CENTER_PAD_X * 2 + 0.6) : fit.maxW;
    if (lines > 1) {
      const narrow = Math.min(fit.maxW, natural / lines + fit.size * 2 + CENTER_PAD_X * 2);
      if (textLines(text, narrow - CENTER_PAD_X * 2, fit.size, fit.lines, "title").lines <= lines) w = narrow;
    }
    w = Math.max(CENTER_MIN_W, w);
    return { rect: { x: -w / 2, y: 0, w, h: CENTER_PAD_Y * 2 + lines * fit.lh }, size: fit.size, lh: fit.lh, lines };
  }
  throw new Error("unreachable");
}

type Block = {
  item: TvBoardItem;
  n: number;
  tag: string | null;
  w: number;
  h: number;
  lines: number;
  leaves: { leaf: TvBoardLeaf | null; more: number; w: number; h: number; lines: number; tag: string | null }[];
  /** Ветвь вместе с листьями под ней. */
  blockH: number;
  /** Цена потерь: обрезанные тексты и спрятанные листья. */
  cost: number;
};

/** Ветвь без позиции: ширина узла, строки, листья под ним и высота всей ветви. */
function blockOf(item: TvBoardItem, n: number, t: MapTier, sideW: number, leavesMax: number, leafLines: number): Block {
  const tag = tagOf(item);
  const text = tag ? `${item.text} ${tag}` : item.text;
  const chrome = t.padX * 2 + t.badge + t.gap;
  const natural = chrome + lineWidth(text, t.size, "point") + 0.6;
  const w = Math.max(chrome + t.size * 3, Math.min(natural, sideW, 60));
  const fit = textLines(text, w - chrome, t.size, t.lines, "point");
  const h = t.padY * 2 + Math.max(t.badge, fit.lines * t.lh);
  let cost = fit.clamped ? 1 : 0;

  const shown = Math.min(item.children.length, leavesMax);
  const more = item.children.length - shown;
  const leafW = sideW - t.indent;
  const leafChrome = t.dot * 2 + t.dotGap;
  const leaves: Block["leaves"] = item.children.slice(0, shown).map((leaf) => {
    const words = leafText(leaf);
    const lf = textLines(words, leafW - leafChrome, t.leaf, leafLines, "leaf");
    if (lf.clamped) cost += 1;
    const one = lineWidth(words, t.leaf, "leaf") + leafChrome + 0.6;
    // a leaf of several lines is as wide as its lines need, not as the whole side
    let lw = lf.lines === 1 ? Math.min(leafW, one) : leafW;
    if (lf.lines > 1 && !lf.clamped) {
      const narrow = Math.min(leafW, (one - leafChrome) / lf.lines + t.leaf * 2.5 + leafChrome);
      if (textLines(words, narrow - leafChrome, t.leaf, leafLines, "leaf").lines <= lf.lines) lw = narrow;
    }
    return { leaf, more: 0, w: lw, h: lf.lines * t.leafLh, lines: lf.lines, tag: tagOf(leaf) };
  });
  if (more > 0) {
    cost += more * HIDDEN_COST;
    const label = `+ ещё ${more}`;
    leaves.push({ leaf: null, more, w: Math.min(leafW, lineWidth(label, t.leaf, "leaf") + leafChrome + 0.6), h: t.leafLh, lines: 1, tag: null });
  }
  const leavesH = leaves.length === 0 ? 0 : leaves.reduce((sum, leaf) => sum + leaf.h, 0) + t.leafGap * (leaves.length - 1);
  const blockH = h + (leaves.length > 0 ? t.leafTop + leavesH : 0);
  return { item, n, tag, w, h, lines: fit.lines, leaves, blockH, cost };
}

function sideHeight(blocks: readonly Block[], gap: number): number {
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, block) => sum + block.blockH, 0) + gap * (blocks.length - 1);
}

/**
 * Сколько первых ветвей ставить направо: стороны ровные по высоте, при равенстве — ровнее по
 * числу, направо не меньше, чем налево.
 */
export function splitSides(heights: readonly number[], gap: number): number {
  const n = heights.length;
  if (n <= 1) return n;
  const total = (part: readonly number[]) => (part.length === 0 ? 0 : part.reduce((a, b) => a + b, 0) + gap * (part.length - 1));
  const half = Math.ceil(n / 2);
  let best = half;
  let bestScore = Infinity;
  for (let k = 1; k < n; k++) {
    const score = Math.round(Math.max(total(heights.slice(0, k)), total(heights.slice(k))) * 100);
    const nearer = Math.abs(k - half) < Math.abs(best - half) || (Math.abs(k - half) === Math.abs(best - half) && k > best);
    if (score < bestScore || (score === bestScore && nearer)) {
      best = k;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Карта в поле `width × height` (vh). Не влезает даже с одним «+N» у каждой ветви — null
 * (при двенадцати ветвях по две строки такого не бывает; `mapFits` отсекает больше).
 */
export function mapLayout(title: string, items: readonly TvBoardItem[], frame: { width: number; height: number }): MapLayout | null {
  const center = centerFit(title);
  if (center.rect.h > frame.height) return null;
  let best: { cost: number; draw: () => MapLayout } | null = null;
  for (const attempt of ATTEMPTS) {
    const t = MAP_TIERS[attempt.tier];
    const half = (frame.width - center.rect.w) / 2 - t.link;
    // a lone branch has no left side to share with: it takes more room, the map is centred later
    const sideW = items.length === 1 ? half * 1.5 : half;
    const blocks = items.map((item, index) => blockOf(item, index + 1, t, sideW, attempt.leaves, attempt.leafLines));
    const k = splitSides(
      blocks.map((block) => block.blockH),
      t.blockGap,
    );
    const right = blocks.slice(0, k);
    const left = blocks.slice(k);
    if (sideHeight(right, t.blockGap) > frame.height || sideHeight(left, t.blockGap) > frame.height) continue;
    const cost = blocks.reduce((sum, block) => sum + block.cost, 0);
    if (cost === 0) return place(center, right, left, t, frame);
    if (!best || cost < best.cost) best = { cost, draw: () => place(center, right, left, t, frame) };
  }
  return best ? best.draw() : null;
}

/** Ставит ветви по сторонам, ровно по высоте поля, и центрирует всю карту по ширине. */
function place(center: MapCenter, right: Block[], left: Block[], t: MapTier, frame: { width: number; height: number }): MapLayout {
  const cy = frame.height / 2;
  const c = { ...center.rect, y: cy - center.rect.h / 2 };
  const branches: MapBranch[] = [];

  const stack = (blocks: Block[], side: "right" | "left") => {
    if (blocks.length === 0) return;
    const content = blocks.reduce((sum, block) => sum + block.blockH, 0);
    const free = frame.height - content;
    // air between branches grows with the room, but a few branches stay a group, not a scatter
    const gap = blocks.length === 1 ? 0 : Math.min(Math.max(t.blockGap, free / (blocks.length + 1)), 6);
    let top = cy - (content + gap * (blocks.length - 1)) / 2;
    // the inner edge of the side: nodes start (right) or end (left) there
    const inner = side === "right" ? c.x + c.w + t.link : c.x - t.link;
    const out = side === "right" ? 1 : -1;
    for (const block of blocks) {
      const nodeX = side === "right" ? inner : inner - block.w;
      const rect = { x: nodeX, y: top, w: block.w, h: block.h };
      const midY = top + block.h / 2;
      // the ribbons leave the title's edge fanned a little, not from a single point
      const spread = Math.max(-(c.h / 2 - 1.2), Math.min(c.h / 2 - 1.2, (midY - cy) * 0.22));
      const x0 = side === "right" ? c.x + c.w - 0.6 : c.x + 0.6;
      const path = ribbon(x0, cy + spread, inner - out * 0.3, midY, RIBBON_FROM, RIBBON_TO);

      const spineX = inner + out * t.spine;
      let leafTop = top + block.h + t.leafTop;
      const leaves: MapLeaf[] = block.leaves.map((leaf) => {
        const lx = side === "right" ? inner + t.indent : inner - t.indent - leaf.w;
        const lrect = { x: lx, y: leafTop, w: leaf.w, h: leaf.h };
        leafTop += leaf.h + t.leafGap;
        const dotX = side === "right" ? lx + t.dot : lx + leaf.w - t.dot;
        const dotY = lrect.y + t.leafLh / 2;
        const stem = elbow(spineX, top + block.h - 0.3, dotX - out * t.dot, dotY);
        return { leaf: leaf.leaf, more: leaf.more, rect: lrect, lines: leaf.lines, tag: leaf.tag, dotX, dotY, path: stem };
      });

      branches.push({ item: block.item, n: block.n, side, tone: (block.n - 1) % 4, rect, lines: block.lines, tag: block.tag, leaves, path });
      top += block.blockH + gap;
    }
  };
  stack(right, "right");
  stack(left, "left");

  // centre the whole composition: a map with short left branches must not hug the left edge
  const rects = [c, ...branches.flatMap((branch) => [branch.rect, ...branch.leaves.map((leaf) => leaf.rect)])];
  const minX = Math.min(...rects.map((rect) => rect.x));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const dx = frame.width / 2 - (minX + maxX) / 2;
  const shift = (rect: MapRect): MapRect => ({ x: r2(rect.x + dx), y: r2(rect.y), w: r2(rect.w), h: r2(rect.h) });

  return {
    width: frame.width,
    height: frame.height,
    tier: t,
    center: { ...center, rect: shift(c) },
    branches: branches.map((branch) => ({
      ...branch,
      rect: shift(branch.rect),
      path: movePath(branch.path, dx),
      leaves: branch.leaves.map((leaf) => ({ ...leaf, rect: shift(leaf.rect), dotX: r2(leaf.dotX + dx), dotY: r2(leaf.dotY), path: movePath(leaf.path, dx) })),
    })),
  };
}

/** Сдвигает путь по горизонтали: все пары «x y» в нём. */
function movePath(path: string, dx: number): string {
  return path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${r2(Number(x) + dx)} ${y}`);
}

/* -------------------------------------------------------------------------- */
/* Проверка                                                                   */
/* -------------------------------------------------------------------------- */

/** Пересекаются ли прямоугольники, с зазором `pad` (касание — не пересечение). */
export function rectsOverlap(a: MapRect, b: MapRect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

/**
 * Всё, что на карте не так: узел за краем поля, два узла внахлёст, связь через чужой текст.
 * Пусто — карта чистая. Для тестов и для песочницы.
 */
export function mapCollisions(layout: MapLayout): string[] {
  const problems: string[] = [];
  const nodes: { name: string; rect: MapRect }[] = [
    { name: "center", rect: layout.center.rect },
    ...layout.branches.flatMap((branch) => [
      { name: `branch ${branch.n}`, rect: branch.rect },
      ...branch.leaves.map((leaf, index) => ({ name: `leaf ${branch.n}.${index + 1}`, rect: leaf.rect })),
    ]),
  ];
  const eps = 0.02;
  for (const node of nodes) {
    const { x, y, w, h } = node.rect;
    if (x < -eps || y < -eps || x + w > layout.width + eps || y + h > layout.height + eps) problems.push(`${node.name} is off the field`);
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (rectsOverlap(nodes[i].rect, nodes[j].rect, -eps)) problems.push(`${nodes[i].name} overlaps ${nodes[j].name}`);
    }
  }
  // a link runs between its two ends; its box, trimmed by a hair at the ends, must not touch
  // any other text (a stem passes the leaves above its own on their inner side, left of them)
  for (const branch of layout.branches) {
    const links: { name: string; box: MapRect; ends: MapRect[] }[] = [
      { name: `link ${branch.n}`, box: boxOf(branch.path), ends: [layout.center.rect, branch.rect] },
      ...branch.leaves.map((leaf, index) => ({ name: `link ${branch.n}.${index + 1}`, box: boxOf(leaf.path), ends: [branch.rect, leaf.rect] })),
    ];
    for (const link of links) {
      const inner = { x: link.box.x + 0.7, y: link.box.y, w: Math.max(0, link.box.w - 1.4), h: link.box.h };
      for (const node of nodes) {
        if (link.ends.includes(node.rect)) continue;
        if (rectsOverlap(inner, node.rect, -eps)) problems.push(`${link.name} crosses ${node.name}`);
      }
    }
  }
  return problems;
}

/** Охватывающий прямоугольник пути по его точкам (у наших кривых он и есть граница). */
export function boxOf(path: string): MapRect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const match of path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    xs.push(Number(match[1]));
    ys.push(Number(match[2]));
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
