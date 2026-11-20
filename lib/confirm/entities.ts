import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";

/**
 * What a parsed entity is and may do on its way to the batch — pure rules the confirm screens and
 * the ingest pipeline (lib/store/ingest.ts) share: what counts, what can go, why nothing can, the
 * main text of each kind, who it goes to, and what the API sees of it.
 */

/** Questions go to the assistant, not the batch; points count only once the company switched them on (D-48). */
export function isCountable(entity: PostprocessedEntity, pointsEnabled = false): boolean {
  if (entity.kind === "query") return false;
  if (entity.kind === "points") return pointsEnabled;
  return true;
}

export function isSendable(entity: PostprocessedEntity, pointsEnabled = false): boolean {
  return isCountable(entity, pointsEnabled) && entity.blocked === undefined;
}

/**
 * Why a phrase has nothing to send — the face's line on Пульс says the real reason, not always
 * «исполнителя» (D-137): a name nobody recognised, a meeting without a time, points while the
 * company has them off, points from shared text (D-36). Empty when something can go.
 */
export function whyNothingToSend(entities: PostprocessedEntity[], pointsEnabled = false): string {
  if (entities.length === 0 || entities.some((entity) => isSendable(entity, pointsEnabled))) return "";
  if (entities.some((entity) => entity.blocked === "assignee_unmatched")) return "Не хватает исполнителя.";
  if (entities.some((entity) => entity.blocked === "time_missing")) return "Не хватает времени встречи.";
  if (entities.some((entity) => entity.kind === "points" && !pointsEnabled)) return "Очки выключены в Настройках.";
  if (entities.some((entity) => entity.blocked === "points_blocked")) return "Очки из пересланного текста не начисляются.";
  return "Отправлять нечего.";
}

/**
 * A phrase that held nothing but thoughts needs no confirm screen (D-75 §3): there is
 * no assignee to pick and no deadline to check, so the note is saved straight away and
 * the toast offers «Отменить». An empty parse is not «notes only» — that is the
 * «ничего не нашёл» screen.
 */
export function isNotesOnly(entities: PostprocessedEntity[]): boolean {
  return entities.length > 0 && entities.every((entity) => entity.kind === "note");
}

/**
 * The «Кто» chip of an event card: «Все» / «Только я» / «Марат, Айгуль» / «Марат +2».
 * The author is always in the meeting, so an empty list is not «nobody» but «only me».
 */
export function describeParticipants(
  entity: { everyone: boolean; participant_ids: string[] },
  nameOf: (id: string) => string | undefined,
): string {
  if (entity.everyone) return "Все";
  const names = entity.participant_ids.map((id) => nameOf(id) ?? "?");
  if (names.length === 0) return "Только я";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} +${names.length - 1}`;
}

/** The kinds that go to a person. */
export function hasAssignee(entity: PostprocessedEntity): entity is Extract<PostprocessedEntity, { kind: "task" | "delegation" | "recurrence" | "points" }> {
  return entity.kind === "task" || entity.kind === "delegation" || entity.kind === "recurrence" || entity.kind === "points";
}

/** Every kind keeps its main text under its own name — one editor, one field map. */
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

/** Fields the API never sees: they are matcher output, not parser output. */
export function strip(entity: PostprocessedEntity): Entity {
  const wire: Record<string, unknown> = { ...entity };
  delete wire.assignee;
  delete wire.participants;
  delete wire.blocked;
  return wire as unknown as Entity;
}

/** A confirmed entity carries the assignee the director actually saw on the chip. */
export function toConfirmed(entity: PostprocessedEntity): Entity {
  const wire = strip(entity);
  if ("assignee_id" in wire && entity.assignee) {
    return { ...wire, assignee_id: entity.assignee.user_id ?? wire.assignee_id };
  }
  return wire;
}

/**
 * Who the batch's people are by id: the roster first, then the candidates the matcher offered
 * (a namesake not in the roster yet still has a name on the chip and in the toast).
 */
export function namesById(
  roster: readonly { id: string; full_name: string }[] | undefined,
  entities: readonly PostprocessedEntity[],
): (id: string) => string | undefined {
  const byId = new Map<string, string>();
  for (const user of roster ?? []) byId.set(user.id, user.full_name);
  for (const entity of entities) {
    for (const candidate of entity.assignee?.candidates ?? []) {
      if (!byId.has(candidate.user_id)) byId.set(candidate.user_id, candidate.full_name);
    }
  }
  return (id: string) => byId.get(id);
}
