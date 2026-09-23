import type { PostprocessedEntity } from "./postprocess";
import type { RosterUser } from "../matchName";

/** Kinds that carry one person: the pin applies to them and to nothing else. */
const PINNABLE = new Set(["task", "points", "recurrence", "delegation"]);

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * The person was chosen before a word was said (D-84): the director tapped their circle on
 * the waiting screen, or «Дать задачу» on their card. The parser is not asked to guess who —
 * every entity that carries one person gets that person by id, matched and green, whatever
 * the model made of the name. Two people with one first name stop being a coin toss.
 *
 * One exception: the model matched somebody with a different first name. That name was said
 * out loud («…и скажи Асхату привезти образцы») — it is not the address glued to the front of
 * the phrase, which always carries the pinned person's own name — so it stays.
 *
 * An id that is not an active member of the roster pins nothing.
 */
export function pinAssignee(entities: PostprocessedEntity[], roster: RosterUser[], assigneeId: string | null | undefined): PostprocessedEntity[] {
  if (!assigneeId) return entities;
  const person = roster.find((user) => user.id === assigneeId && user.is_active);
  if (!person) return entities;
  const byId = new Map(roster.map((user) => [user.id, user]));

  return entities.map((entity) => {
    if (!PINNABLE.has(entity.kind) || !("assignee_id" in entity)) return entity;
    const heard = entity.assignee?.status === "matched" && entity.assignee.user_id ? byId.get(entity.assignee.user_id) : undefined;
    if (heard && heard.id !== person.id && firstName(heard.full_name) !== firstName(person.full_name)) return entity;

    const pinned = { ...entity } as PostprocessedEntity & {
      assignee_id: string | null;
      assignee_name: string | null;
      assignee_confidence: number;
    };
    pinned.assignee_id = person.id;
    pinned.assignee_name = person.full_name;
    pinned.assignee_confidence = 1;
    pinned.assignee = { status: "matched", user_id: person.id, candidates: [], flag: "ok" };
    if (pinned.blocked === "assignee_unmatched") delete pinned.blocked;
    return pinned;
  });
}
