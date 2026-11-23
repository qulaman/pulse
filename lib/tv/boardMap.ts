import { MAP_MAX_POINTS, mapText, tagOf, wallText, type TvBoardItem, type TvBoardLeaf } from "./board";
import { TV_TYPE } from "./boardList";
import { lineWidth, snugWidth, textLines } from "./boardText";

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
 * Scale steps go by the number of branches: 1–2, 3–4, 5–6. The fewer the branches, the larger
 * the nodes, the text and the centre and the longer the ribbons: two branches must fill the wall
 * as confidently as a list of two points, not huddle small in the middle. A step is a ceiling:
 * a heavy board (long points, many leaves) is dropped one step lower by its weight.
 *
 * Type comes only from the wall's scale (D-185): a branch is `tv-body` or `tv-small`, a leaf and «→ Марат»
 * are `tv-small`, the title `tv-lead`…`tv-small`; nothing is smaller, no line thinner than 0.4 vh. What does
 * not fit: the wall squeezes the air, then puts leaves on one line, then hides the extra leaves behind «+N».
 * Of the attempts the first with nothing cut is taken; if there is none — the one with the least loss. With
 * more than six branches the map is not drawn at all (`MAP_BRANCHES_MAX`): from 4–5 m a map of twelve nodes
 * is a scatter of small captions, a list reads better.
 */

/** With more than six branches the wall draws a list, even if the remote asked for the map (D-185). */
export const MAP_BRANCHES_MAX = MAP_MAX_POINTS;

/** The lines of the map — ribbons, stems — are never thinner than this, vh: thinner ones vanish from 4 m (D-185). */
export const MAP_LINE_MIN = 0.4;

export type MapRect = { x: number; y: number; w: number; h: number };

/** Название в центре на этой ступени: кегль, интерлиньяж, строк, наибольшая ширина узла. */
export type CenterFit = { size: number; lh: number; lines: number; maxW: number };

/** Кегль карты: ветвь, лист, промежутки, центр, связи. Те же числа рисует `TvBoardMap`. */
export type MapTier = {
  key: "xl" | "l" | "m" | "s";
  /** Ветвь: кегль, интерлиньяж, строк не больше, кружок номера, поля, скругление. */
  size: number;
  lh: number;
  lines: number;
  badge: number;
  gap: number;
  padX: number;
  padY: number;
  radius: number;
  /** «→ Марат» as a plate on a line of its own under a branch's or leaf's text: the top margin; size and padding are shared (`MAP_TAG`). */
  tagTop: number;
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
  /** Толщина стебля и радиус его поворота к листу. */
  stem: number;
  elbow: number;
  /** Лента центр → ветвь: длина по горизонтали — наименьшая и до какой она тянется, когда сторонам просторно. */
  link: number;
  linkMax: number;
  /** Толщина ленты у центра и у ветви. */
  ribbon: readonly [number, number];
  /** Промежуток между ветвями одной стороны: наименьший и наибольший (несколько ветвей — группа, а не россыпь). */
  blockGap: number;
  airMax: number;
  /** Название в центре: попытки от крупной к мелкой, поля узла, наименьшая ширина, скругление. */
  center: readonly CenterFit[];
  centerPadX: number;
  centerPadY: number;
  centerMinW: number;
  centerRadius: number;
};

const tier = (t: Omit<MapTier, "spine" | "indent">): MapTier => {
  // the spine drops from under the number; the leaf's dot sits a turn of the elbow further out
  const spine = t.padX + t.badge / 2;
  return { ...t, spine, indent: spine + t.elbow * 1.4 };
};

const { small: SMALL, body: BODY, lead: LEAD } = TV_TYPE;

/** «→ Марат» on the map: `tv-small` on a plate with this much room either side, vh. */
export const MAP_TAG = { size: SMALL.size, lh: SMALL.lh, pad: 1.2 } as const;

/** Every leaf is `tv-small`: the smallest the wall reads from across the room (D-185). */
const LEAF = { leaf: SMALL.size, leafLh: SMALL.lh } as const;

export const MAP_TIERS: Record<MapTier["key"], MapTier> = {
  // 1–2 branches: big nodes, the runs stretch across the wall
  xl: tier({
    key: "xl",
    size: BODY.size,
    lh: BODY.lh,
    lines: 4,
    badge: 6.2,
    gap: 2,
    padX: 2.4,
    padY: 1.6,
    radius: 1.4,
    tagTop: 0.8,
    ...LEAF,
    leafGap: 0.9,
    leafTop: 1.4,
    dot: 0.8,
    dotGap: 1.4,
    stem: 0.5,
    elbow: 1.6,
    link: 8,
    linkMax: 18,
    ribbon: [2, 0.7],
    blockGap: 3,
    airMax: 12,
    center: [
      { ...LEAD, lines: 2, maxW: 50 },
      { ...BODY, lines: 3, maxW: 46 },
      { ...SMALL, lines: 4, maxW: 44 },
    ],
    centerPadX: 3.2,
    centerPadY: 2.4,
    centerMinW: 28,
    centerRadius: 1.8,
  }),
  // 3–4 branches
  l: tier({
    key: "l",
    size: BODY.size,
    lh: BODY.lh,
    lines: 3,
    badge: 5.8,
    gap: 1.8,
    padX: 2.2,
    padY: 1.4,
    radius: 1.3,
    tagTop: 0.7,
    ...LEAF,
    leafGap: 0.7,
    leafTop: 1.2,
    dot: 0.75,
    dotGap: 1.3,
    stem: 0.46,
    elbow: 1.4,
    link: 7,
    linkMax: 14,
    ribbon: [1.8, 0.6],
    blockGap: 2.6,
    airMax: 9,
    center: [
      { ...BODY, lines: 2, maxW: 40 },
      { ...BODY, lines: 3, maxW: 42 },
      { ...SMALL, lines: 4, maxW: 40 },
    ],
    centerPadX: 2.8,
    centerPadY: 2.2,
    centerMinW: 24,
    centerRadius: 1.6,
  }),
  // 5–6 branches
  m: tier({
    key: "m",
    size: SMALL.size,
    lh: SMALL.lh,
    lines: 3,
    badge: 5.2,
    gap: 1.6,
    padX: 2,
    padY: 1.2,
    radius: 1.2,
    tagTop: 0.6,
    ...LEAF,
    leafGap: 0.5,
    leafTop: 1,
    dot: 0.7,
    dotGap: 1.2,
    stem: 0.44,
    elbow: 1.2,
    link: 6,
    linkMax: 11,
    ribbon: [1.6, 0.5],
    blockGap: 2.2,
    airMax: 7,
    center: [
      { ...BODY, lines: 2, maxW: 36 },
      { ...SMALL, lines: 3, maxW: 36 },
      { ...SMALL, lines: 4, maxW: 38 },
    ],
    centerPadX: 2.6,
    centerPadY: 2,
    centerMinW: 22,
    centerRadius: 1.4,
  }),
  // the fallback of every heavy board: the same type, less air
  s: tier({
    key: "s",
    size: SMALL.size,
    lh: SMALL.lh,
    lines: 2,
    badge: 4.8,
    gap: 1.4,
    padX: 1.6,
    padY: 0.9,
    radius: 1.1,
    tagTop: 0.5,
    ...LEAF,
    leafGap: 0.35,
    leafTop: 0.7,
    dot: 0.65,
    dotGap: 1,
    stem: MAP_LINE_MIN,
    elbow: 1,
    link: 5,
    linkMax: 8,
    ribbon: [1.4, 0.45],
    blockGap: 1.4,
    airMax: 6,
    center: [
      { ...SMALL, lines: 2, maxW: 32 },
      { ...SMALL, lines: 3, maxW: 34 },
      { ...SMALL, lines: 4, maxW: 36 },
    ],
    centerPadX: 2.2,
    centerPadY: 1.6,
    centerMinW: 20,
    centerRadius: 1.2,
  }),
};

/** Листьев у ветви на карте — не больше четырёх, дальше «+N». */
export const MAP_LEAVES_MAX = 4;

/** The map's step by the number of branches — its type-size ceiling: 1–2 → xl, 3–4 → l, 5–6 → m. */
export function mapStage(branches: number): MapTier["key"] {
  if (branches <= 2) return "xl";
  if (branches <= 4) return "l";
  return "m";
}

const TIER_ORDER: readonly MapTier["key"][] = ["xl", "l", "m", "s"];
type Attempt = { tier: MapTier["key"]; leaves: number; leafLines: number };

/**
 * What to try, best first: type size, how many leaves a branch keeps, lines per leaf. It starts at the board's
 * step; at each size first all leaves in three lines, then in two, then fewer leaves; at the very end, leaves on
 * one line. A leaf is a phrase of 30–40 characters and a side of the map is 40–50 vh: in `tv-small` that is two
 * or three lines.
 */
function attemptsFrom(stage: MapTier["key"]): Attempt[] {
  const tiers = TIER_ORDER.slice(TIER_ORDER.indexOf(stage));
  const counts = Array.from({ length: MAP_LEAVES_MAX + 1 }, (_, i) => MAP_LEAVES_MAX - i);
  return [
    ...tiers.flatMap((tier) => counts.flatMap((leaves) => [3, 2].map((leafLines) => ({ tier, leaves, leafLines })))),
    ...counts.map((leaves) => ({ tier: "s" as const, leaves, leafLines: 1 })),
  ];
}

/**
 * The cost of losses: a cut phrase reads as a different phrase («Сверить остатки по») — it is worse than a
 * leaf honestly hidden behind «+ ещё N».
 */
const CLAMP_COST = 2;
const HIDDEN_COST = 1;

export type MapCenter = { rect: MapRect; size: number; lh: number; lines: number; padX: number };

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
  rect: MapRect;
  lines: number;
  tag: string | null;
  leaves: MapLeaf[];
  /** Лента от центра к ветви — залитый контур. */
  path: string;
  /**
   * Где лежат связи ветви — лента, стебли, точки листьев — с запасом на толщину линий. Стена
   * рисует их своим слоем этого размера: ведущий гасит ветвь прозрачностью слоя, а не
   * перерисовкой общего SVG на каждом кадре.
   */
  links: MapRect;
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
 * Стебель к листу: вниз от ветви по `x0` и плавным поворотом радиуса `radius` наружу к точке
 * листа. Все пары координат — «x y», чтобы путь можно было сдвинуть и измерить (`boxOf`).
 */
export function elbow(x0: number, y0: number, x1: number, y1: number, radius = 1): string {
  const dir = x1 >= x0 ? 1 : -1;
  const r = Math.max(0, Math.min(radius, Math.abs(x1 - x0), y1 - y0));
  return `M${r2(x0)} ${r2(y0)}L${r2(x0)} ${r2(y1 - r)}Q${r2(x0)} ${r2(y1)} ${r2(x0 + dir * r)} ${r2(y1)}L${r2(x1)} ${r2(y1)}`;
}

/* -------------------------------------------------------------------------- */
/* Раскладка                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The tag of a point on the map: «→ Марат · в работе» when it stands on one line of a column `width` wide, else
 * the name alone, «→ Марат» — the plate never breaks between the name and its stage.
 */
export function mapTag(item: Pick<TvBoardLeaf, "assignee" | "handed_done" | "stage">, width: number): string | null {
  const full = tagOf(item);
  if (!full || !item.assignee) return full;
  return lineWidth(full, MAP_TAG.size, "point") + MAP_TAG.pad * 2 + 0.4 <= width ? full : `→\u00a0${item.assignee}`;
}

/**
 * «→ Марат · в работе» as a plate on a line of its own, in a column `width` wide: how wide the plate is and how tall
 * (a long name in a narrow leaf wraps once). Zero — no tag.
 */
export function tagBox(tag: string | null, width: number): { w: number; h: number } {
  if (!tag) return { w: 0, h: 0 };
  const inner = Math.max(1, width - MAP_TAG.pad * 2);
  const lines = textLines(tag, inner, MAP_TAG.size, 2, "point").lines;
  return { w: Math.min(width, lineWidth(tag, MAP_TAG.size, "point") + MAP_TAG.pad * 2 + 0.4), h: lines * MAP_TAG.lh };
}

function centerFit(title: string, t: MapTier): MapCenter {
  const text = title.trim() || "Доска";
  const pad = t.centerPadX;
  for (const [index, fit] of t.center.entries()) {
    const inner = fit.maxW - pad * 2;
    const { lines, clamped } = textLines(text, inner, fit.size, fit.lines, "title");
    if (clamped && index < t.center.length - 1) continue;
    // as narrow as the lines allow: a short title is a compact node, not a wide slab
    const w = Math.max(t.centerMinW, Math.min(fit.maxW, snugWidth(text, inner, fit.size, fit.lines, "title") + pad * 2 + 0.6));
    return { rect: { x: -w / 2, y: 0, w, h: t.centerPadY * 2 + lines * fit.lh }, size: fit.size, lh: fit.lh, lines, padX: pad };
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
  /**
   * Сколько ширины стороны ветви нужно: узел и листья в одну строку — их ширина; в несколько
   * строк — вся сторона (им тесно, лента тянуться не должна).
   */
  span: number;
  /** Цена потерь: обрезанные тексты и спрятанные листья. */
  cost: number;
};

/** Ветвь без позиции: ширина узла, строки, листья под ним и высота всей ветви. */
function blockOf(item: TvBoardItem, n: number, t: MapTier, sideW: number, leavesMax: number, leafLines: number): Block {
  const text = mapText(item);
  const chrome = t.padX * 2 + t.badge + t.gap;
  const tag = mapTag(item, Math.min(sideW, 60) - chrome);
  // the tag's plate stands under the words: the node is as wide as the wider of the two
  const tagNatural = tag ? lineWidth(tag, MAP_TAG.size, "point") + MAP_TAG.pad * 2 + 0.4 : 0;
  const natural = chrome + Math.max(lineWidth(text, t.size, "point"), tagNatural) + 0.6;
  const room = Math.max(chrome + t.size * 3, Math.min(natural, sideW, 60));
  const fit = textLines(text, room - chrome, t.size, t.lines, "point");
  const plate = tagBox(tag, room - chrome);
  // a node of several lines is as wide as its lines, not as the whole side
  const w =
    fit.lines === 1
      ? room
      : Math.max(chrome + t.size * 3, Math.min(room, chrome + Math.max(snugWidth(text, room - chrome, t.size, t.lines, "point"), plate.w) + 0.6));
  const h = t.padY * 2 + Math.max(t.badge, fit.lines * t.lh + (tag ? t.tagTop + plate.h : 0));
  let cost = fit.clamped ? CLAMP_COST : 0;

  const shown = Math.min(item.children.length, leavesMax);
  const more = item.children.length - shown;
  const leafW = sideW - t.indent;
  const leafChrome = t.dot * 2 + t.dotGap;
  // when some leaves must wait behind «+ ещё N», the handed ones stay: whom a line went to is what the room reads
  // first (D-185); the shown ones keep the board's order
  const kept = item.children
    .map((leaf, index) => ({ leaf, index, handed: tagOf(leaf) !== null }))
    .sort((a, b) => Number(b.handed) - Number(a.handed) || a.index - b.index)
    .slice(0, shown)
    .sort((a, b) => a.index - b.index);
  const hiddenHanded = item.children.filter((leaf) => tagOf(leaf) !== null).length - kept.filter((entry) => entry.handed).length;
  const leaves: Block["leaves"] = kept.map(({ leaf }) => {
    const words = wallText(leaf);
    const leafTag = mapTag(leaf, leafW - leafChrome);
    const lf = textLines(words, leafW - leafChrome, t.leaf, leafLines, "leaf");
    const leafPlate = tagBox(leafTag, leafW - leafChrome);
    if (lf.clamped) cost += CLAMP_COST;
    // a leaf of several lines is as wide as its lines need, not as the whole side
    const lw = Math.min(leafW, Math.max(snugWidth(words, leafW - leafChrome, t.leaf, leafLines, "leaf"), leafPlate.w) + leafChrome + 0.6);
    const lh = lf.lines * t.leafLh + (leafTag ? t.tagTop + leafPlate.h : 0);
    return { leaf, more: 0, w: lw, h: lh, lines: lf.lines, tag: leafTag };
  });
  if (more > 0) {
    // a handed leaf out of sight costs twice: its name is gone with it
    cost += (more + hiddenHanded) * HIDDEN_COST;
    const label = `+ ещё ${more}`;
    leaves.push({ leaf: null, more, w: Math.min(leafW, lineWidth(label, t.leaf, "leaf") + leafChrome + 0.6), h: t.leafLh, lines: 1, tag: null });
  }
  const leavesH = leaves.length === 0 ? 0 : leaves.reduce((sum, leaf) => sum + leaf.h, 0) + t.leafGap * (leaves.length - 1);
  const blockH = h + (leaves.length > 0 ? t.leafTop + leavesH : 0);
  // the room the branch wants: a line of text wants its width, several lines want the whole side
  const span = Math.max(room, ...leaves.map((leaf) => t.indent + (leaf.lines === 1 ? leaf.w : leafW)));
  return { item, n, tag, w, h, lines: fit.lines, leaves, blockH, span, cost };
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
 * The map in a `width × height` field (vh). More than six branches (`MAP_BRANCHES_MAX`), or it does not
 * fit even with one «+N» on every branch — null: the wall draws a list. Attempts start at the board's step
 * (`mapStage`): fewer branches — larger.
 */
export function mapLayout(title: string, items: readonly TvBoardItem[], frame: { width: number; height: number }): MapLayout | null {
  if (items.length > MAP_BRANCHES_MAX) return null;
  let best: { cost: number; layout: MapLayout } | null = null;
  const stage = mapStage(items.length);
  for (const attempt of attemptsFrom(stage)) {
    const t = MAP_TIERS[attempt.tier];
    const center = centerFit(title, t);
    if (center.rect.h > frame.height) continue;
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
    if (best && cost >= best.cost) continue;
    const layout = place(center, right, left, t, frame, sideW);
    // big type on a narrow wall (4:3) can push a node past the edge: then the next, smaller attempt
    if (!inField(layout)) continue;
    if (cost === 0) return layout;
    best = { cost, layout };
  }
  return best ? best.layout : null;
}

/** Every node of the map inside its field. */
function inField(layout: MapLayout): boolean {
  const eps = 0.02;
  const rects = [layout.center.rect, ...layout.branches.flatMap((branch) => [branch.rect, ...branch.leaves.map((leaf) => leaf.rect)])];
  return rects.every(({ x, y, w, h }) => x >= -eps && y >= -eps && x + w <= layout.width + eps && y + h <= layout.height + eps);
}

/**
 * Ставит ветви по сторонам, ровно по высоте поля, и центрирует всю карту по ширине. Лента
 * тянется, пока стороне просторно (до `linkMax`): короткие ветви не жмутся к названию, карта
 * расходится по стене.
 */
function place(center: MapCenter, right: Block[], left: Block[], t: MapTier, frame: { width: number; height: number }, sideW: number): MapLayout {
  const cy = frame.height / 2;
  const c = { ...center.rect, y: cy - center.rect.h / 2 };
  const branches: Omit<MapBranch, "links">[] = [];

  const stack = (blocks: Block[], side: "right" | "left") => {
    if (blocks.length === 0) return;
    const content = blocks.reduce((sum, block) => sum + block.blockH, 0);
    const free = frame.height - content;
    // air between branches grows with the room, but a few branches stay a group, not a scatter
    const gap = blocks.length === 1 ? 0 : Math.min(Math.max(t.blockGap, free / (blocks.length + 1)), t.airMax);
    let top = cy - (content + gap * (blocks.length - 1)) / 2;
    // the run from the title stretches over the room the side does not need; a side of
    // several-line branches needs all of it, and its run stays short
    const span = Math.max(...blocks.map((block) => block.span));
    const link = t.link + Math.max(0, Math.min(t.linkMax - t.link, sideW - span));
    // the inner edge of the side: nodes start (right) or end (left) there
    const inner = side === "right" ? c.x + c.w + link : c.x - link;
    const out = side === "right" ? 1 : -1;
    for (const block of blocks) {
      const nodeX = side === "right" ? inner : inner - block.w;
      const rect = { x: nodeX, y: top, w: block.w, h: block.h };
      const midY = top + block.h / 2;
      // the ribbons leave the title's edge fanned a little, not from a single point
      const fan = c.h / 2 - t.centerRadius / 2;
      const spread = Math.max(-fan, Math.min(fan, (midY - cy) * 0.22));
      const x0 = side === "right" ? c.x + c.w - 0.6 : c.x + 0.6;
      const path = ribbon(x0, cy + spread, inner - out * 0.3, midY, t.ribbon[0], t.ribbon[1]);

      const spineX = inner + out * t.spine;
      let leafTop = top + block.h + t.leafTop;
      const leaves: MapLeaf[] = block.leaves.map((leaf) => {
        const lx = side === "right" ? inner + t.indent : inner - t.indent - leaf.w;
        const lrect = { x: lx, y: leafTop, w: leaf.w, h: leaf.h };
        leafTop += leaf.h + t.leafGap;
        const dotX = side === "right" ? lx + t.dot : lx + leaf.w - t.dot;
        const dotY = lrect.y + t.leafLh / 2;
        const stem = elbow(spineX, top + block.h - 0.3, dotX - out * t.dot, dotY, t.elbow);
        return { leaf: leaf.leaf, more: leaf.more, rect: lrect, lines: leaf.lines, tag: leaf.tag, dotX, dotY, path: stem };
      });

      branches.push({ item: block.item, n: block.n, side, rect, lines: block.lines, tag: block.tag, leaves, path });
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
    branches: branches.map((branch) => {
      const path = movePath(branch.path, dx);
      const leaves = branch.leaves.map((leaf) => ({ ...leaf, rect: shift(leaf.rect), dotX: r2(leaf.dotX + dx), dotY: r2(leaf.dotY), path: movePath(leaf.path, dx) }));
      return { ...branch, rect: shift(branch.rect), path, leaves, links: linksOf(path, leaves, t) };
    }),
  };
}

/** Охват связей ветви: лента, стебли и точки листьев, с запасом на толщину линий и сглаживание. */
function linksOf(path: string, leaves: readonly MapLeaf[], t: MapTier): MapRect {
  const boxes = [
    boxOf(path),
    ...leaves.flatMap((leaf) => [boxOf(leaf.path), { x: leaf.dotX - t.dot, y: leaf.dotY - t.dot, w: t.dot * 2, h: t.dot * 2 }]),
  ];
  const pad = t.stem + 0.4;
  const x = Math.floor((Math.min(...boxes.map((b) => b.x)) - pad) * 100) / 100;
  const y = Math.floor((Math.min(...boxes.map((b) => b.y)) - pad) * 100) / 100;
  const right = Math.ceil((Math.max(...boxes.map((b) => b.x + b.w)) + pad) * 100) / 100;
  const bottom = Math.ceil((Math.max(...boxes.map((b) => b.y + b.h)) + pad) * 100) / 100;
  return { x, y, w: r2(right - x), h: r2(bottom - y) };
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
