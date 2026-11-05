import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";

/** What a parsed entity is called on the desk's confirm editor (D-154 wave 3). */
export const KIND_LABEL: Record<Entity["kind"], string> = {
  task: "Задача",
  delegation: "Поручение",
  recurrence: "Повторяющаяся задача",
  event: "Встреча",
  announcement: "Объявление",
  reminder: "Напоминание",
  note: "Заметка",
  points: "Очки",
  query: "Вопрос",
};

/** The kinds that go to a person. */
export function hasAssignee(entity: PostprocessedEntity): entity is Extract<PostprocessedEntity, { kind: "task" | "delegation" | "recurrence" | "points" }> {
  return entity.kind === "task" || entity.kind === "delegation" || entity.kind === "recurrence" || entity.kind === "points";
}

/** Every kind keeps its main text under its own name — one editor, one field map (as EntityCard). */
export function mainField(entity: PostprocessedEntity): { key: "title" | "text" | "question" | "reason"; value: string } {
  switch (entity.kind) {
    case "task":
    case "recurrence":
    case "delegation":
    case "event":
      return { key: "title", value: entity.title };
    case "announcement":
    case "reminder":
    case "note":
      return { key: "text", value: entity.text };
    case "query":
      return { key: "question", value: entity.question };
    case "points":
      return { key: "reason", value: entity.reason ?? "" };
  }
}

/** The person a matcher placed, or null: «matched» only — a guess among namesakes is not a pick. */
export function chosenId(entity: PostprocessedEntity): string | null {
  const direct = "assignee_id" in entity ? entity.assignee_id : null;
  const match = entity.assignee;
  if (!match) return direct;
  if (match.status !== "matched") return null;
  return match.user_id ?? direct;
}
