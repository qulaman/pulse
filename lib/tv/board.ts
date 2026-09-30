import { pluralRu } from "@/lib/tasks/status-text";

import type { BoardView } from "./state";

/**
 * Доска на стене (D-102 §8, D-121) — чистыми функциями: ответ базы в надёжной форме, какой
 * вид рисовать, поле сцены, какая страница сейчас, какой пункт только что сказан, что
 * написать рядом с поручённым. Раскладка списка — `boardList.ts`, карты — `boardMap.ts`.
 * Стена ни с чем не взаимодействует: всё решают данные, пульт и часы киоска.
 */

/** Подпункт на стене (D-121) — те же поля, что у пункта, без своих веток. */
export type TvBoardLeaf = {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  /** Имя без фамилии того, кому пункт поручен; гостю и у отозванного — null (D-33, D-45). */
  assignee: string | null;
  /** Поручение сдано и принято. */
  handed_done: boolean;
};

/** Пункт на стене и его подпункты по порядку (D-121: один уровень). */
export type TvBoardItem = TvBoardLeaf & { children: TvBoardLeaf[] };

export type TvBoardData = {
  id: string;
  title: string;
  /** Пункты верхнего уровня с текстом: подпункты — подробности повестки, не её счёт. */
  total: number;
  done: number;
  updated_at: string;
  /** «Список» или «Карта» — как стену попросил пульт (D-121). */
  view: BoardView;
  /** Обсуждаемый пункт (верхнего уровня) — подсвечен ведущим с пульта; null — никакой. */
  focus: string | null;
  items: TvBoardItem[];
};

/** Ответ `tv_board()`: доска, или ничего, или «скрыта — гость в кабинете». */
export type TvBoard = { board: TvBoardData | null; hidden: boolean };

/**
 * Ответ `tv_board()` в форме, на которую стена может положиться: база старше клиента
 * (после деплоя) не отдаёт веток, вида и подсветки — тогда пунктов без веток, список, без
 * подсветки. Стена не имеет права погаснуть от незнакомого ответа (D-76).
 */
export function boardFrom(data: unknown): TvBoard {
  const value = (data ?? {}) as { board?: Partial<TvBoardData> | null; hidden?: boolean };
  const raw = value.board;
  if (!raw || typeof raw !== "object" || !raw.id) return { board: null, hidden: value.hidden === true };
  const leaf = (row: Partial<TvBoardLeaf>): TvBoardLeaf => ({
    id: String(row.id),
    text: row.text ?? "",
    done: row.done === true,
    created_at: row.created_at ?? new Date(0).toISOString(),
    assignee: row.assignee ?? null,
    handed_done: row.handed_done === true,
  });
  const items = (Array.isArray(raw.items) ? raw.items : []).map((row) => ({
    ...leaf(row),
    children: (Array.isArray(row.children) ? row.children : []).map(leaf),
  }));
  return {
    hidden: false,
    board: {
      id: raw.id,
      title: raw.title ?? "",
      total: raw.total ?? items.length,
      done: raw.done ?? items.filter((item) => item.done).length,
      updated_at: raw.updated_at ?? new Date(0).toISOString(),
      view: raw.view === "map" ? "map" : "list",
      focus: typeof raw.focus === "string" && items.some((item) => item.id === raw.focus) ? raw.focus : null,
      items,
    },
  };
}

/** Страница стоит на стене 20 секунд. */
export const PAGE_MS = 20_000;
/** Только что сказанный пункт светится минуту. */
export const FRESH_MS = 60_000;

/**
 * Карта мыслей читается со стены, пока ветвей не больше двенадцати (по шесть на сторону).
 * Больше — стена рисует список, даже если пульт просил карту: мелкая карта хуже списка (D-121).
 */
export const MAP_MAX_POINTS = 12;

/** Влезет ли доска картой — то же правило и на стене, и в подсказке пульта. */
export function mapFits(points: number): boolean {
  return points > 0 && points <= MAP_MAX_POINTS;
}

/** Что стена рисует на самом деле: карту — только если она влезает (`mapFits`), иначе список. */
export function wallView(board: Pick<TvBoardData, "view" | "items">): BoardView {
  return board.view === "map" && mapFits(board.items.length) ? "map" : "list";
}

/**
 * Поле доски на стене, vh. Сцена высотой 74 vh садится между бегущей строкой и подписью
 * (там ~80 vh) с воздухом; сверху строка «ДОСКА · 5 пунктов», под ней — список или карта.
 * Ширина — по пропорции экрана: 16:9 даёт 164 vh, ноутбук 16:10 — уже.
 */
export const BOARD_HEIGHT = 74;
export const BOARD_TOP_ROW = 4.4;
export const BOARD_TOP_GAP = 1.4;
/** Между названием и пунктами в списке. */
export const BOARD_TITLE_GAP = 2.6;

export function boardFrame(aspect: number): { width: number; height: number } {
  const width = Math.min(Math.max(aspect, 1) * 100 * 0.92, 164);
  return { width: Math.round(width * 10) / 10, height: BOARD_HEIGHT - BOARD_TOP_ROW - BOARD_TOP_GAP };
}

/** Шкала ведущего над доской: сегмент на пункт, промежуток, высота сегмента и капсулы текущего, vh. */
export const PROGRESS_GAP = 0.5;
export const PROGRESS_H = 0.6;
export const PROGRESS_THUMB_H = 0.9;

/**
 * Шкала пунктов ведущего (D-121): ширина сегмента — шкала не шире пятой части строки при
 * любом числе пунктов; капсула текущего — в 1,6 сегмента, по центру своего сегмента, и её
 * сдвиг от начала шкалы. Капсула едет transform'ом, сегменты под ней не двигаются (D-45).
 */
export function progressScale(count: number, at: number): { segment: number; thumb: number; shift: number } {
  const segment = Math.min(3.2, Math.max(0.9, (34 - PROGRESS_GAP * (count - 1)) / Math.max(count, 1)));
  const thumb = segment * 1.6;
  const index = Math.min(Math.max(at, 0), Math.max(count - 1, 0));
  const shift = index * (segment + PROGRESS_GAP) + (segment - thumb) / 2;
  return { segment, thumb, shift: Math.round(shift * 1000) / 1000 };
}

/**
 * Какая страница на стене сейчас — по часам киоска, без таймеров и без состояния. Ведущий
 * подсветил пункт — стена стоит на его странице, пока подсветка не снята (D-121).
 */
export function pageAt(now: Date, pages: number, focusPage: number | null = null): number {
  if (pages <= 1) return 0;
  if (focusPage !== null && focusPage >= 0 && focusPage < pages) return focusPage;
  return Math.floor(now.getTime() / PAGE_MS) % pages;
}

/**
 * Пункт сказан меньше минуты назад: на стене он мягко светится. Время пункта ставит сервер,
 * а «сейчас» — часы киоска: у только что сказанного пункта возраст бывает и отрицательным
 * на секунду-другую, это всё равно новый пункт. Дальше минуты «из будущего» — не свежий.
 */
export function isFresh(item: Pick<TvBoardItem, "created_at">, now: Date): boolean {
  const age = now.getTime() - new Date(item.created_at).getTime();
  return age > -FRESH_MS && age < FRESH_MS;
}

/**
 * Свежие пункты и подпункты одной строкой id — ключ для мемо: список и карта не
 * перерисовываются каждую секунду часов, только когда свечение у кого-то началось или кончилось.
 */
export function freshKey(items: readonly TvBoardItem[], now: Date): string {
  const ids: string[] = [];
  for (const item of items) {
    if (isFresh(item, now)) ids.push(item.id);
    for (const leaf of item.children) if (isFresh(leaf, now)) ids.push(leaf.id);
  }
  return ids.join(",");
}

/**
 * Нейтральная пометка у пункта: «→ Марат», «→ Марат · сдано» — ни отказов, ни просрочек (D-45).
 * Стрелка и имя — через неразрывный пробел: строка не рвётся на «→» и «Марат».
 */
export function tagOf(item: Pick<TvBoardItem, "assignee" | "handed_done">): string | null {
  if (!item.assignee) return null;
  return item.handed_done ? `→\u00a0${item.assignee} · сдано` : `→\u00a0${item.assignee}`;
}

/** Подпись под названием: «5 пунктов · 2 отмечено». */
export function boardCountLine(board: Pick<TvBoardData, "total" | "done">): string {
  if (board.total === 0) return "Пока пусто";
  const head = `${board.total} ${pluralRu(board.total, ["пункт", "пункта", "пунктов"])}`;
  return board.done > 0 ? `${head} · ${board.done} ${pluralRu(board.done, ["отмечен", "отмечено", "отмечено"])}` : head;
}
