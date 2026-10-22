import { resolveMatchingConfig, type MatchingConfig } from "./config";
import { conventionFor, DEFAULT_CONVENTIONS, type Convention, type TimePart } from "./conventions";
import type { ParseSource } from "./prompt";
import type { Entity, ModelEntity } from "./schema";
import { daytime, resolveTimeRef } from "./timeref";
import { matchName, type AssigneeMatch, type RosterUser } from "../matchName";
import { normalizeRule, parseClock } from "../recurrence/schedule";

export type BlockedReason = "points_blocked" | "assignee_unmatched" | "time_missing";

/** One participant of an event: what was heard, what the model copied, what matched. */
export type ParticipantMatch = { query: string; name: string | null; match: AssigneeMatch };

export type PostprocessedEntity = Entity & {
  assignee?: AssigneeMatch;
  participants?: ParticipantMatch[];
  blocked?: BlockedReason;
};

const HAS_ASSIGNEE_FIELDS = new Set(["task", "points", "recurrence", "delegation"]);

const blank = (value: string): string | null => (value.trim() === "" ? null : value);

/**
 * The model's entity in the app's form (docs/AI.md §3): its TimeRefs become the ISO fields on
 * the Aqtobe clock with the company's conventions (task 026), the assignee id waits for the
 * match (D-56), and an event's "" / 0 become the nulls the card and the RPC speak in (D-78).
 */
export function fromModelEntity(
  entity: ModelEntity,
  now: Date,
  conventions: readonly Convention[] = DEFAULT_CONVENTIONS,
): Entity {
  switch (entity.kind) {
    case "task": {
      const { deadline, scheduled_send, ...rest } = entity;
      const due = resolveTimeRef(deadline, now, conventions, "task");
      return {
        ...rest,
        assignee_id: null,
        deadline_iso: due?.iso ?? null,
        deadline_confidence: due?.confidence ?? null,
        deadline_source_text: due?.source_text ?? null,
        scheduled_send_at: resolveTimeRef(scheduled_send, now, conventions, "task")?.iso ?? null,
      };
    }
    case "event": {
      const { starts_at, ...rest } = entity;
      const start = resolveTimeRef(starts_at, now, conventions, "event");
      return {
        ...rest,
        body: null, // the agenda is typed on the card, never guessed
        location: blank(entity.location),
        starts_at_iso: start?.iso ?? null,
        ends_at_iso: null,
        time_confidence: start?.confidence ?? null,
        time_source_text: start?.source_text ?? null,
        remind_before_min: null, // default 30 in the DB; the director changes it on the card
        participant_queries: entity.participant_names,
        participant_ids: [],
      };
    }
    case "reminder": {
      const { remind_at, ...rest } = entity;
      return { ...rest, remind_at_iso: resolveTimeRef(remind_at, now, conventions, "reminder")?.iso ?? null };
    }
    case "recurrence": {
      const { time, part, ...rest } = entity;
      return { ...rest, ...normalizeRule(rest), assignee_id: null, due_time: repeatingDue(time, part, conventions) };
    }
    case "points":
      return { ...entity, assignee_id: null };
    default:
      return entity;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The deadline on each day of a repeating order (D-148): a named clock time as the TimeRef reads
 * it («к пяти» — 17:00), a part of the day by the company's conventions, nothing said — the end
 * of the working day (`day_default`, D-52).
 */
export function repeatingDue(time: string, part: string, conventions: readonly Convention[]): string {
  const named = parseClock(time);
  const said = part ? (part as TimePart) : null;
  const row = said ? conventionFor(conventions, said) : null;
  if (named) {
    const clock = daytime(named, said);
    return `${pad(clock.hours)}:${pad(clock.minutes)}`;
  }
  return (row ?? conventionFor(conventions, "day_default")).time;
}

function isValidIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Semantic validation on top of the schema (docs/AI.md §3). The API guarantees the
 * shape; what it cannot guarantee is that ids exist, amounts are legal and dates parse.
 */
export function postprocess(
  entities: Entity[],
  roster: RosterUser[],
  source: ParseSource,
  matching?: Partial<MatchingConfig>,
): PostprocessedEntity[] {
  const activeIds = new Set(roster.filter((u) => u.is_active).map((u) => u.id));
  const matchingConfig = resolveMatchingConfig(matching);
  const out: PostprocessedEntity[] = [];

  for (const original of entities) {
    const entity: PostprocessedEntity = { ...original };

    // An id the model invented, or a user who has left, is worse than no id at all.
    if ("assignee_id" in entity && entity.assignee_id !== null && !activeIds.has(entity.assignee_id)) {
      entity.assignee_id = null;
    }

    for (const field of [
      "deadline_iso",
      "remind_at_iso",
      "scheduled_send_at",
      "starts_at_iso",
      "ends_at_iso",
    ] as const) {
      if (field in entity) {
        const holder = entity as unknown as Record<string, unknown>;
        const value = holder[field];
        if (typeof value === "string" && !isValidIso(value)) {
          holder[field] = null;
          if (field === "deadline_iso" && "deadline_confidence" in entity) {
            holder.deadline_confidence = null;
          }
          if (field === "starts_at_iso" && "time_confidence" in entity) {
            holder.time_confidence = null;
          }
        }
      }
    }

    if (entity.kind === "points") {
      if (entity.amount === 0) continue; // nothing to award, nothing to show
      // A minus the director says is a minus (D-137, revises D-30); shared text may not award any (D-36).
      if (source === "shared") entity.blocked = "points_blocked";
    }

    if (entity.kind === "event") {
      // the meeting is one row with many people: every name is matched on its own, and a
      // name nobody recognised is a yellow chip, not a blocked card (D-78 §0.3)
      const participants: ParticipantMatch[] = entity.participant_names.map((name, index) => ({
        query: entity.participant_queries[index] ?? name,
        name,
        match: matchName(
          {
            assignee_name: name,
            assignee_id: null,
            assignee_queries: [entity.participant_queries[index] ?? name],
            assignee_confidence: 0.9,
          },
          roster,
          matchingConfig,
        ),
      }));
      entity.participants = participants;
      entity.participant_ids = [
        ...new Set(
          participants
            .filter((p) => p.match.status === "matched" && p.match.user_id !== null)
            .map((p) => p.match.user_id as string),
        ),
      ];
      // a meeting nobody can put in a calendar is not sendable: the time is the one field
      // the director has to fill in on /confirm
      if (entity.starts_at_iso === null) entity.blocked = "time_missing";
    }

    if (HAS_ASSIGNEE_FIELDS.has(entity.kind)) {
      const withAssignee = entity as PostprocessedEntity & {
        assignee_name: string | null;
        assignee_id: string | null;
        assignee_queries: string[];
        assignee_confidence: number;
      };
      const assignee = matchName(
        {
          assignee_name: withAssignee.assignee_name,
          assignee_id: withAssignee.assignee_id,
          assignee_queries: withAssignee.assignee_queries,
          assignee_confidence: withAssignee.assignee_confidence,
        },
        roster,
        matchingConfig,
      );
      entity.assignee = assignee;
      // The chip and the payload must agree: a matched name becomes the assignee_id here,
      // a namesake/unmatched one clears it — otherwise accepting the suggestion on /confirm
      // counts as an "edit" and the D-35 metric reads 100% forever (live finding, task 008).
      withAssignee.assignee_id = assignee.status === "matched" ? assignee.user_id : null;
      if (
        assignee.status !== "matched" &&
        (entity.kind === "task" || entity.kind === "points" || entity.kind === "recurrence") &&
        entity.blocked === undefined
      ) {
        entity.blocked = "assignee_unmatched";
      }
    }

    out.push(entity);
  }

  return out;
}
