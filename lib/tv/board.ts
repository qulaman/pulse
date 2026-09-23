import { pluralRu } from "@/lib/tasks/status-text";

/**
 * Доска на стене (D-102 §8) — чистыми функциями: как разложить пункты по колонкам и
 * страницам, какая страница сейчас, какой пункт только что сказан, что написать рядом с
 * поручённым. Стена ни с чем не взаимодействует, поэтому всё решают число пунктов и часы
 * киоска.
 */

export type TvBoardItem = {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  /** Имя без фамилии того, кому пункт поручен; гостю и у отозванного — null (D-33, D-45). */
  assignee: string | null;
  /** Поручение сдано и принято. */
  handed_done: boolean;
};

export type TvBoardData = {
  id: string;
  title: string;
  total: number;
  done: number;
  updated_at: string;
  items: TvBoardItem[];
};

/** Ответ `tv_board()`: доска, или ничего, или «скрыта — гость в кабинете». */
export type TvBoard = { board: TvBoardData | null; hidden: boolean };

/** До шести пунктов — одна колонка крупно, до 14 — две, дальше — страницы по 14. */
export const ONE_COLUMN_MAX = 6;
export const PAGE_SIZE = 14;
/** Страница стоит на стене 20 секунд. */
export const PAGE_MS = 20_000;
/** Только что сказанный пункт светится минуту. */
export const FRESH_MS = 60_000;

export type BoardLayout = { columns: 1 | 2; pages: number; perPage: number };

export function boardLayout(count: number): BoardLayout {
  if (count <= ONE_COLUMN_MAX) return { columns: 1, pages: 1, perPage: Math.max(count, 1) };
  return { columns: 2, pages: Math.ceil(count / PAGE_SIZE), perPage: PAGE_SIZE };
}

/** Какая страница на стене сейчас — по часам киоска, без таймеров и без состояния. */
export function pageAt(now: Date, pages: number): number {
  if (pages <= 1) return 0;
  return Math.floor(now.getTime() / PAGE_MS) % pages;
}

/** Пункты одной страницы вместе с их номерами на доске — нумерация сквозная. */
export function pageItems(items: readonly TvBoardItem[], layout: BoardLayout, page: number): { item: TvBoardItem; n: number }[] {
  const from = page * layout.perPage;
  return items.slice(from, from + layout.perPage).map((item, index) => ({ item, n: from + index + 1 }));
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

/** Нейтральная пометка у пункта: «→ Марат», «→ Марат · сдано» — ни отказов, ни просрочек (D-45). */
export function tagOf(item: Pick<TvBoardItem, "assignee" | "handed_done">): string | null {
  if (!item.assignee) return null;
  return item.handed_done ? `→ ${item.assignee} · сдано` : `→ ${item.assignee}`;
}

/** Подпись под названием: «5 пунктов · 2 отмечено». */
export function boardCountLine(board: Pick<TvBoardData, "total" | "done">): string {
  if (board.total === 0) return "Пока пусто";
  const head = `${board.total} ${pluralRu(board.total, ["пункт", "пункта", "пунктов"])}`;
  return board.done > 0 ? `${head} · ${board.done} ${pluralRu(board.done, ["отмечен", "отмечено", "отмечено"])}` : head;
}
