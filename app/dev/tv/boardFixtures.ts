import type { TvBoard, TvBoardData, TvBoardItem, TvBoardLeaf } from "@/lib/tv/board";

/**
 * Доска v2 на фикстурах (D-121) — случаи песочницы `/dev/tv?case=…`: ветки, подсветка
 * ведущего, карта, двенадцать и тринадцать ветвей, длинные тексты, страницы, пусто.
 * Фикстуры строятся один раз на случай и минуту: стена не перерисовывает доску каждую
 * секунду часов, как и на киоске, где запрос отдаёт те же объекты.
 */

export const BOARD_CASES = [
  "board-branches",
  "board-focus",
  "board-map",
  "board-map-focus",
  "board-map-12",
  "board-map-13",
  "board-long",
  "board-pages-branches",
  "board-empty",
] as const;

export type BoardCase = (typeof BOARD_CASES)[number];

const MIN = 60_000;

type Seed = { text: string; done?: boolean; who?: string; handed?: boolean; fresh?: boolean; sub?: (string | { text: string; done?: boolean; who?: string; fresh?: boolean })[] };

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
  }
}

function build(wallCase: BoardCase, base: number, guest: boolean): TvBoard {
  const seeds = seedsFor(wallCase);
  const leaf = (id: string, text: string, index: number, patch: { done?: boolean; who?: string; handed?: boolean; fresh?: boolean }): TvBoardLeaf => ({
    id,
    text,
    done: patch.done === true,
    created_at: new Date(patch.fresh ? base : base - 60 * MIN + index * MIN).toISOString(),
    // a guest gets no names in the tags (D-33)
    assignee: guest ? null : (patch.who ?? null),
    handed_done: patch.handed === true,
  });
  const items: TvBoardItem[] = seeds.map((seed, i) => ({
    ...leaf(`p${i + 1}`, seed.text, i, seed),
    children: (seed.sub ?? []).map((sub, j) => {
      const s = typeof sub === "string" ? { text: sub } : sub;
      return leaf(`p${i + 1}.${j + 1}`, s.text, i, s);
    }),
  }));
  const map = wallCase.startsWith("board-map");
  const focus = wallCase === "board-focus" || wallCase === "board-map-focus" ? "p3" : null;
  const board: TvBoardData = {
    id: "b1",
    title: wallCase === "board-long" ? LONG_TITLE : "Планёрка · понедельник",
    total: items.length,
    done: items.filter((item) => item.done).length,
    updated_at: new Date(base).toISOString(),
    view: map ? "map" : "list",
    focus,
    items,
  };
  return { hidden: false, board };
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
