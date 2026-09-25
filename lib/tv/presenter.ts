import { splitBoards } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";
import { branchesOf } from "@/lib/mindboard/tree";
import type { Note } from "@/lib/notes/queries";
import { pluralRu } from "@/lib/tasks/status-text";

import { MAP_MAX_POINTS } from "./board";
import { tvTime } from "./clock";

/**
 * Ведущий с пульта (D-121) — чистыми функциями: по каким пунктам он идёт, что говорит его
 * дисплей и капсула на экране доски, что стоит на полке досок пульта. Формулировки — часть
 * продукта и проверяются тестом (`presenter.test.ts`), как формулировки стены в `remote.ts`.
 */

/** Пункт в руках ведущего: то, что он листает ◀ ▶ и отмечает. */
export type PresenterPoint = { id: string; text: string; done: boolean };

const words = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Шаги совещания — те пункты, которые `tv_board_control` разрешает подсветить: верхнего
 * уровня, живые, со словами, в порядке доски. Подпункт — подробность пункта, а не шаг;
 * голосовой пункт, который ещё распознаётся («Распознаю…»), — пока без слов, и стена его
 * не показывает; сирота без своего пункта рисуется на телефоне пунктом, но база знает его
 * подпунктом — подсветить его нельзя, поэтому и шагом он не становится.
 */
export function presenterPoints(notes: readonly Note[], boardId: string): PresenterPoint[] {
  const rows = notes.filter((note) => note.board_id === boardId && note.deleted_at === null);
  return branchesOf(rows)
    .map((branch) => branch.point)
    .filter((point) => point.parent_id === null && words(point.text) !== "")
    .map((point) => ({ id: point.id, text: words(point.text), done: point.done_at !== null }));
}

/**
 * Где совещание: пунктов нет; подсветки нет (`lost` — подсвеченный пункт пропал с доски:
 * удалён, опустел, стал подпунктом — стена его уже не светит); или идём по пункту `at`.
 */
export type PresenterStage =
  | { kind: "empty" }
  | { kind: "ready"; total: number; done: number; lost: boolean }
  | { kind: "point"; at: number; total: number; point: PresenterPoint; next: PresenterPoint | null };

export function presenterStage(points: readonly PresenterPoint[], current: string | null): PresenterStage {
  if (points.length === 0) return { kind: "empty" };
  const at = current === null ? -1 : points.findIndex((point) => point.id === current);
  if (at < 0) {
    const done = points.filter((point) => point.done).length;
    return { kind: "ready", total: points.length, done, lost: current !== null };
  }
  return { kind: "point", at, total: points.length, point: points[at], next: points[at + 1] ?? null };
}

const pointsWord = (n: number) => `${n} ${pluralRu(n, ["пункт", "пункта", "пунктов"])}`;

/** Дисплей ведущего на пульте: надстрочник, главная строка (до двух строк), строка под ней. */
export type PresenterWords = { eyebrow: string; headline: string; line: string };

export function presenterWords(stage: PresenterStage): PresenterWords {
  switch (stage.kind) {
    case "empty":
      return { eyebrow: "Ведущий", headline: "На доске нет пунктов", line: "Надиктуйте их на экране доски" };
    case "ready":
      return stage.lost
        ? { eyebrow: `Ведущий · ${pointsWord(stage.total)}`, headline: "Подсветка снята", line: "Пункта уже нет на доске · ▶ — сначала" }
        : { eyebrow: `Ведущий · ${pointsWord(stage.total)}`, headline: "На стене вся доска", line: "▶ — начать с первого пункта" };
    case "point":
      return {
        eyebrow: `Пункт ${stage.at + 1} из ${stage.total}${stage.point.done ? " · отмечен" : ""}`,
        headline: stage.point.text,
        line: stage.next ? `Дальше: ${stage.next.text}` : "Это последний пункт",
      };
  }
}

/** Капсула на экране доски: пока совещание не начато — приглашение, дальше — «3 из 7» и пункт. */
export type PresenterPill =
  | { kind: "start"; title: string; line: string }
  | { kind: "point"; step: string; text: string; done: boolean };

export function presenterPill(stage: Exclude<PresenterStage, { kind: "empty" }>): PresenterPill {
  if (stage.kind === "ready") {
    return stage.lost
      ? { kind: "start", title: "Начать заново", line: "подсветка снята — пункта нет" }
      : { kind: "start", title: "Вести совещание", line: `${pointsWord(stage.total)} · с первого` };
  }
  return { kind: "point", step: `${stage.at + 1} из ${stage.total}`, text: stage.point.text, done: stage.point.done };
}

/** Точки хода совещания под дисплеем — пока их можно сосчитать глазом. */
export const PIPS_MAX = 12;
export type Pip = "now" | "done" | "todo";

/** По точке на пункт: текущий, отмеченный, впереди. Больше двенадцати — точек нет (null), хватает «3 из 30». */
export function pipsOf(points: readonly PresenterPoint[], at: number | null): Pip[] | null {
  if (points.length === 0 || points.length > PIPS_MAX) return null;
  return points.map((point, index) => (index === at ? "now" : point.done ? "done" : "todo"));
}

/**
 * Честная строка под клавишами вида: карта мыслей читается со стены до двенадцати ветвей,
 * дальше стена рисует список, даже если пульт просил карту (`mapFits`, D-121).
 */
export function mapHint(total: number): string | null {
  return total > MAP_MAX_POINTS ? `Карта — до ${MAP_MAX_POINTS} пунктов, на стене список` : null;
}

export type BoardCount = { total: number; done: number };

/** Счёт каждой доски так же, как его ведёт стена: пункты верхнего уровня со словами (`tv_board`). */
export function boardCounts(notes: readonly Note[]): Map<string, BoardCount> {
  const counts = new Map<string, BoardCount>();
  for (const note of notes) {
    if (note.board_id === null || note.deleted_at !== null || note.parent_id !== null || words(note.text) === "") continue;
    const count = counts.get(note.board_id) ?? { total: 0, done: 0 };
    count.total += 1;
    if (note.done_at) count.done += 1;
    counts.set(note.board_id, count);
  }
  return counts;
}

/** «7 пунктов», «пусто» — подпись на клавише доски. */
export function countLine(count: BoardCount | undefined): string {
  const total = count?.total ?? 0;
  return total === 0 ? "пусто" : pointsWord(total);
}

/** Картридж — доска на стене: «7 пунктов · 2 отмечено · до 21:00». */
export function cartridgeLine(count: BoardCount | undefined, until: Date): string {
  const total = count?.total ?? 0;
  const done = count?.done ?? 0;
  const head = total === 0 ? "Пока пусто" : pointsWord(total);
  const marked = done > 0 ? ` · ${done} ${pluralRu(done, ["отмечен", "отмечено", "отмечено"])}` : "";
  return `${head}${marked} · до ${tvTime(until)}`;
}

/** Клавиш досок на пульте — три: мышечной памяти хватает, остальное — в шторке «Все доски». */
export const SHELF_KEYS = 3;

/**
 * Полка пульта: доска на стене стоит в картридже, клавиши — три последние из остальных,
 * `rest` — сколько живых досок не поместилось на клавиши (их открывает «Все доски»).
 */
export function boardShelf(
  boards: readonly MindBoard[],
  now: Date,
  onWallId: string | null,
): { keys: MindBoard[]; rest: number; live: MindBoard[] } {
  const live = splitBoards(boards, now).live;
  const others = live.filter((board) => board.id !== onWallId);
  const keys = others.slice(0, SHELF_KEYS);
  return { keys, rest: others.length - keys.length, live };
}
