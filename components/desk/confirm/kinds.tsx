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

/** The colour of a kind's mark — the phone's confirm cards' own (EntityCard), quieter. */
const KIND_COLOR: Record<Entity["kind"], string> = {
  task: "var(--accent)",
  delegation: "var(--accent)",
  recurrence: "var(--accent)",
  event: "var(--accent)",
  announcement: "var(--gold)",
  points: "var(--gold)",
  reminder: "var(--warn)",
  note: "var(--text-muted)",
  query: "var(--text-muted)",
};

const PATHS: Record<Entity["kind"], React.ReactNode> = {
  task: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <polyline points="8,12.5 11,15.5 16,9.5" />
    </>
  ),
  announcement: (
    <>
      <path d="M4 10v4h3l6 4V6l-6 4z" />
      <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  points: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  reminder: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  event: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </>
  ),
  note: (
    <>
      <path d="M6 4h8l4 4v12H6z" />
      <polyline points="14,4 14,8 18,8" />
      <path d="M9 12.5h6M9 16h4" />
    </>
  ),
  recurrence: (
    <>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <polyline points="18,3 18,7 14,7" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <polyline points="6,21 6,17 10,17" />
    </>
  ),
  delegation: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="15" r="3" />
      <path d="M11 8h3.5a2.5 2.5 0 0 1 0 5H13" />
    </>
  ),
  query: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </>
  ),
};

export function KindMark({ kind }: { kind: Entity["kind"] }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0" style={{ color: KIND_COLOR[kind] }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[kind]}
    </svg>
  );
}

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
