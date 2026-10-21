import { SKETCH_FIXTURE, SKETCH_UPRIGHT } from "@/app/dev/board/fixtures";
import { sketchFrom } from "@/lib/mindboard/sketch";
import type { HandedStage, TvBoard, TvBoardData, TvBoardItem, TvBoardLeaf } from "@/lib/tv/board";

/**
 * Доска v2 на фикстурах (D-121) — случаи песочницы `/dev/tv?case=…`: ветки, подсветка
 * ведущего, карта (и с одной–четырьмя ветвями — крупные ступени), двенадцать и тринадцать
 * ветвей, длинные тексты, страницы, пусто.
 * Фикстуры строятся один раз на случай и минуту: стена не перерисовывает доску каждую
 * секунду часов, как и на киоске, где запрос отдаёт те же объекты.
 */

export const BOARD_CASES = [
  "board-branches",
  "board-focus",
  "board-map",
  "board-map-focus",
  "board-map-1",
  "board-map-2",
  "board-map-3",
  "board-map-4",
  "board-map-12",
  "board-map-13",
  "board-long",
  "board-pages-branches",
  "board-empty",
  "board-sketch",
  "board-sketch-focus",
  "board-sketch-map",
  "board-sketch-upright",
  "board-sketch-upright-focus",
  "board-sketch-standing",
  "board-live",
  "board-live-branch",
  "board-live-branch-many",
  "board-week",
] as const;

export type BoardCase = (typeof BOARD_CASES)[number];

const MIN = 60_000;

/** A drawing of the seed: the warehouse on the wide sheet, the office drawn upright and laid along the wall, or left standing. */
type Drawn = true | "upright" | "standing";

const DRAWINGS: Record<"wide" | "upright" | "standing", unknown> = {
  wide: SKETCH_FIXTURE,
  upright: SKETCH_UPRIGHT,
  standing: { ...SKETCH_UPRIGHT, r: 0 },
};

type Seed = {
  text: string;
  done?: boolean;
  who?: string;
  handed?: boolean;
  /** How far the handed line went (D-144). */
  stage?: HandedStage;
  fresh?: boolean;
  drawn?: Drawn;
  sub?: (string | { text: string; done?: boolean; who?: string; stage?: HandedStage; fresh?: boolean })[];
};

/** The meeting after «Раздать поручения» (D-144): names and stages on the map, a branch to zoom. */
const LIVE: Seed[] = [
  { text: "Отгрузка Казхром до пятницы", who: "Марат", stage: "work" },
  {
    text: "Ремонт склада: смета к среде",
    sub: [
      { text: "Сверить остатки по стройматериалам", who: "Динара", stage: "sent" },
      { text: "Счёт от подрядчика — на согласование", who: "Тимур", stage: "review" },
      { text: "Фото кровли", done: true, who: "Ерлан", stage: "done" },
      { text: "Вывезти мусор со двора", who: "Айгуль", stage: "work" },
      "Договориться о кране на четверг",
      { text: "Проверить пожарные выходы", who: "Марат" },
    ],
  },
  { text: "Кого берём на выставку в Алматы", who: "Асель", stage: "sent" },
  { text: "Новый прайс на мерч", sub: ["Толстовки и кепки", { text: "Цены у двух поставщиков", who: "Асель", stage: "review" }] },
  { text: "Отпуск бухгалтера в октябре", done: true },
];

const BRANCHES: Seed[] = [
  { text: "Отгрузка Казхром до пятницы", who: "Марат" },
  { text: "Ремонт склада: смета к среде", sub: ["Сверить остатки по стройматериалам", "Счёт от подрядчика — на согласование", { text: "Фото кровли", done: true }] },
  { text: "Кого берём на выставку в Алматы" },
  {
    text: "Новый прайс на мерч — согласовать с бухгалтерией",
    sub: ["Толстовки и кепки", { text: "Цены у двух поставщиков", who: "Асель" }, "Макет каталога", { text: "Бюджет на осень", fresh: true }],
  },
  { text: "Отпуск бухгалтера в октябре", done: true },
];

const MORE = [
  "Проверить договор аренды второго офиса",
  "Закупка ноутбуков для отдела продаж",
  "Тренинг по технике безопасности",
  "Итоги квартала — к пятнице",
  "Новые визитки для команды",
  "Встреча с банком по кредитной линии",
  "Корпоратив: дата и место",
  "Перевести склад на новую систему учёта",
  "Обновить сайт компании",
  "Сверка с поставщиками бетона",
  "План продаж на ноябрь",
  "Парковка для гостей",
  "Отчёт инвестору",
  "Кондиционеры в переговорной",
  "Стажёры на зиму",
  "Пропуска на объект «Север»",
  "Страховка техники",
  "Спецодежда на зиму",
  "Сайт: раздел вакансий",
  "Юбилей компании",
  "Новый поставщик арматуры",
  "Ремонт кухни в офисе",
  "Обучение прорабов",
  "Сдача второй очереди ЖК",
  "Проверка пожарной безопасности",
];

const SUBS = ["Позвонить до обеда", "Счёт на оплату", "Фото с объекта", "Сверить с договором", "Ответ заказчику"];

const LONG_TITLE = "Планёрка по итогам квартала: продажи, склад, новые объекты, кадровые вопросы, бюджет на осень и выставка в Алматы";
const LONG_POINT =
  "Надо срочно решить вопрос с парковкой для гостей и сотрудников, потому что соседи жалуются уже третью неделю, а управляющая компания не отвечает на письма и звонки, и если мы ничего не сделаем до конца месяца, будет штраф от акимата и испорченные отношения со всем бизнес-центром и арендодателем";

function seedsFor(wallCase: BoardCase): Seed[] {
  switch (wallCase) {
    case "board-branches":
    case "board-focus":
    case "board-map":
    case "board-map-focus":
      return BRANCHES;
    case "board-map-1":
      return [BRANCHES[1]];
    case "board-map-2":
      return [BRANCHES[0], BRANCHES[1]];
    case "board-map-3":
      return [BRANCHES[0], BRANCHES[1], BRANCHES[3]];
    case "board-map-4":
      return BRANCHES.slice(0, 4);
    case "board-map-12":
    case "board-map-13":
      return [...BRANCHES, ...MORE.slice(0, wallCase === "board-map-12" ? 7 : 8).map((text, i) => ({ text, sub: i % 3 === 1 ? SUBS.slice(0, 2) : [] }))];
    case "board-long":
      return [
        { text: LONG_POINT, sub: ["Коротко: позвонить в управляющую", LONG_POINT.slice(0, 160)] },
        BRANCHES[0],
        { text: "Итоги квартала — к пятнице", sub: SUBS.slice(0, 3) },
        BRANCHES[4],
      ];
    case "board-pages-branches":
      return [...BRANCHES, ...MORE.map((text, i) => ({ text, sub: i % 4 === 0 ? SUBS.slice(0, 2 + (i % 3)) : [] }))].slice(0, 30);
    case "board-empty":
      return [];
    // a drawing without words and one with them (D-141)
    case "board-sketch":
    case "board-sketch-focus":
    case "board-sketch-map":
      return [BRANCHES[0], { text: "", drawn: true }, { text: "Ворота — с южной стороны", drawn: true }, BRANCHES[4]];
    // a drawing made on the phone held upright: laid along the wall, or left standing (D-141 amendment)
    case "board-sketch-upright":
    case "board-sketch-upright-focus":
      return [BRANCHES[0], { text: "Офис — три этажа", drawn: "upright" }, { text: "Ворота — с южной стороны", drawn: true }, BRANCHES[4]];
    case "board-live":
    case "board-live-branch":
    case "board-week":
      return LIVE;
    // the worst the zoom meets: a two-line point with its tag, fifteen long handed sub-points
    case "board-live-branch-many":
      return [
        LIVE[0],
        {
          text: LONG_POINT.slice(0, 120),
          who: "Динара",
          stage: "work",
          sub: MORE.slice(0, 15).map((text, i) => ({ text: `${text} — с подробностями для прораба и бухгалтерии`, who: ["Марат", "Асель", "Тимур"][i % 3], stage: (["sent", "work", "review"] as const)[i % 3] })),
        },
        ...LIVE.slice(2),
      ];
    case "board-sketch-standing":
      return [BRANCHES[0], { text: "Офис — три этажа", drawn: "standing" }, { text: "Ворота — с южной стороны", drawn: true }, BRANCHES[4]];
  }
}

function build(wallCase: BoardCase, base: number, guest: boolean): TvBoard {
  const seeds = seedsFor(wallCase);
  const leaf = (id: string, text: string, index: number, patch: { done?: boolean; who?: string; handed?: boolean; stage?: HandedStage; fresh?: boolean; drawn?: Drawn }): TvBoardLeaf => ({
    id,
    text,
    done: patch.done === true,
    created_at: new Date(patch.fresh ? base : base - 60 * MIN + index * MIN).toISOString(),
    // a guest gets no names in the tags (D-33)
    assignee: guest ? null : (patch.who ?? null),
    handed_done: patch.handed === true || patch.stage === "done",
    // a guest gets no stages either (D-33)
    stage: guest ? null : (patch.stage ?? null),
    sketch: patch.drawn ? sketchFrom(DRAWINGS[patch.drawn === true ? "wide" : patch.drawn]) : null,
  });
  const items: TvBoardItem[] = seeds.map((seed, i) => ({
    ...leaf(`p${i + 1}`, seed.text, i, seed),
    children: (seed.sub ?? []).map((sub, j) => {
      const s = typeof sub === "string" ? { text: sub } : sub;
      return leaf(`p${i + 1}.${j + 1}`, s.text, i, s);
    }),
  }));
  const map = wallCase.startsWith("board-map") || wallCase === "board-sketch-map" || wallCase.startsWith("board-live") || wallCase === "board-week";
  const focus =
    wallCase === "board-focus" || wallCase === "board-map-focus"
      ? "p3"
      : wallCase === "board-sketch-focus" || wallCase === "board-sketch-upright-focus" || wallCase.startsWith("board-live-branch")
        ? "p2"
        : null;
  const board: TvBoardData = {
    id: "b1",
    title: wallCase === "board-long" ? LONG_TITLE : "Планёрка · понедельник",
    total: items.length,
    done: items.filter((item) => item.done).length,
    updated_at: new Date(base).toISOString(),
    view: map ? "map" : "list",
    focus,
    week: wallCase === "board-week",
    items,
  };
  return { hidden: false, board };
}

/**
 * Демо песочницы (`&demo=focus|view|1`): ведущий сам ходит по пунктам раз в `DEMO_STEP_MS`,
 * вид «Список / Карта» меняется каждый шаг (`view`) или каждый третий (`1` — и то и другое).
 * Для замеров перфа и покадровой проверки «ничего не прыгает» без пульта и базы.
 */
export type BoardDemo = "focus" | "view" | "both";
export const DEMO_STEP_MS = 2_000;

export function demoOf(param: string | undefined): BoardDemo | null {
  return param === "focus" || param === "view" ? param : param === "1" ? "both" : null;
}

const demos = new WeakMap<TvBoard, Map<string, TvBoard>>();

/** Доска на шаге демо: те же пункты (тот же объект — раскладка не пересчитывается), другие подсветка и вид. */
export function boardDemo(data: TvBoard, demo: BoardDemo, step: number): TvBoard {
  const board = data.board;
  if (!board || board.items.length === 0) return data;
  const focus = demo === "view" ? board.focus : board.items[step % board.items.length].id;
  const flip = demo === "view" ? step % 2 === 1 : demo === "both" ? Math.floor(step / 3) % 2 === 1 : false;
  const view = flip ? (board.view === "map" ? "list" : "map") : board.view;
  const key = `${focus}|${view}`;
  let byKey = demos.get(data);
  if (!byKey) demos.set(data, (byKey = new Map()));
  let shown = byKey.get(key);
  if (!shown) byKey.set(key, (shown = { ...data, board: { ...board, focus, view } }));
  return shown;
}

const cache = new Map<string, TvBoard>();

/** Доска случая v2, или undefined — случай не отсюда (его рисует WallSandbox сам). */
export function boardCase(wallCase: string, base: number, guest: boolean): TvBoard | undefined {
  if (!(BOARD_CASES as readonly string[]).includes(wallCase)) return undefined;
  const key = `${wallCase}|${base}|${guest}`;
  let board = cache.get(key);
  if (!board) {
    if (cache.size > 40) cache.clear();
    board = build(wallCase as BoardCase, base, guest);
    cache.set(key, board);
  }
  return board;
}
