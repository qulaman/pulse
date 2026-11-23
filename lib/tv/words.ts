/**
 * One word per stage of an order across the whole wall (D-185): the board's tags, a person's list,
 * an order's path, the photo captions. Four neutral stages and nothing else — a decline, a return
 * for rework or a missed deadline never gets a word here (D-45).
 */
export type WallStage = "sent" | "work" | "review" | "done";

export const STAGE: Record<WallStage, string> = {
  sent: "Поручено",
  work: "В работе",
  review: "На проверке",
  done: "Готово",
};

/** The same word inside a line, lower case: «→ Марат · на проверке», «готово в 14:22». */
export function stageWord(stage: WallStage): string {
  return STAGE[stage].toLowerCase();
}
