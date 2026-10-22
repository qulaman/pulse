import { z } from "zod";

import { AnnouncementEntitySchema } from "./kinds/announcement";
import { ModelEventEntitySchema } from "./kinds/event";
import { assigneeFields, PrioritySchema } from "./kinds/fields";
import { PARSER_KINDS, type ParserKind } from "./kinds/names";
import { NoteEntitySchema } from "./kinds/note";
import { ModelPointsEntitySchema } from "./kinds/points";
import { QueryEntitySchema } from "./kinds/query";
import { ModelRecurrenceEntitySchema } from "./kinds/recurrence";
import { ModelReminderEntitySchema } from "./kinds/reminder";
import { ModelTaskEntitySchema } from "./kinds/task";
import { kindModules } from "./kinds";
import { TimeRefSchema } from "./timeref";
import { EVENT_REPEATS, REPEAT_EVERY } from "../recurrence/schedule";

/**
 * Single source of truth for the parser output contract (docs/AI.md §3).
 * TS types are inferred from the zod schemas and the JSON Schema is generated
 * from the same schemas — types and JSON Schema cannot drift apart. The model's variants
 * live in their kind modules (lib/ai/kinds, task 026); the app's form lives here.
 *
 * Nullable fields use .nullable() and never .optional(): with structured outputs
 * every property is required.
 */

export { AnnouncementEntitySchema, NoteEntitySchema, PrioritySchema, QueryEntitySchema };
export type Priority = z.infer<typeof PrioritySchema>;

/** App-side addition: set by postprocess from the match, what confirm and the UI use. */
const assigneeId = { assignee_id: z.string().nullable() };

/** The app's task: the ISO fields code resolved from the model's TimeRefs (task 026). */
const taskFields = {
  ...assigneeFields,
  group_id: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  deadline_iso: z.string().nullable(), // ISO 8601, explicit +05:00; server converts to UTC
  deadline_confidence: z.number().nullable(),
  deadline_source_text: z.string().nullable(), // e.g. "завтра до обеда" — chip on /confirm
  priority: PrioritySchema,
  scheduled_send_at: z.string().nullable(),
  source_span: z.string(),
};

export const ReminderEntitySchema = z.strictObject({
  kind: z.literal("reminder"),
  text: z.string(),
  remind_at_iso: z.string().nullable(),
  source_span: z.string(),
});

const ModelDelegationEntitySchema = z.strictObject({
  kind: z.literal("delegation"),
  ...assigneeFields,
  title: z.string(),
  note: z.string().nullable(),
  source_span: z.string(),
});

/**
 * The app's form of an event: what the model said, but with «не сказано» spelled the way
 * the rest of the system spells it — null — plus the ids postprocess resolved.
 */
export const EventEntitySchema = z.strictObject({
  kind: z.literal("event"),
  title: z.string(),
  body: z.string().nullable(),
  location: z.string().nullable(),
  starts_at_iso: z.string().nullable(),
  ends_at_iso: z.string().nullable(),
  time_confidence: z.number().nullable(),
  time_source_text: z.string().nullable(),
  participant_queries: z.array(z.string()),
  participant_names: z.array(z.string()),
  participant_ids: z.array(z.string()),
  everyone: z.boolean(),
  remind_before_min: z.number().nullable(),
  // D-148: a series — the next meeting is made as this one begins; a draft kept before it is "none"
  repeat: z.enum(EVENT_REPEATS).default("none"),
  source_span: z.string(),
});

/**
 * The app's repeating order (D-148): the model's rule, normalised, with the deadline of each
 * day resolved from the words to a clock time on the company's conventions — code, not the
 * model, decides what «до обеда» means (D-15).
 */
export const RecurrenceEntitySchema = z.strictObject({
  kind: z.literal("recurrence"),
  ...assigneeFields,
  ...assigneeId,
  title: z.string(),
  every: z.enum(REPEAT_EVERY),
  interval: z.number(),
  weekdays: z.array(z.number()),
  month_day: z.number(),
  due_time: z.string(), // "HH:MM", Asia/Aqtobe — the deadline on every day of the rule
  source_span: z.string(),
});

export const TaskEntitySchema = z.strictObject({ kind: z.literal("task"), ...taskFields, ...assigneeId });
export const PointsEntitySchema = ModelPointsEntitySchema.extend(assigneeId);
export const DelegationEntitySchema = ModelDelegationEntitySchema.extend(assigneeId);

export const EntitySchema = z.discriminatedUnion("kind", [
  AnnouncementEntitySchema,
  TaskEntitySchema,
  PointsEntitySchema,
  ReminderEntitySchema,
  NoteEntitySchema,
  EventEntitySchema,
  RecurrenceEntitySchema,
  DelegationEntitySchema,
  QueryEntitySchema,
]);

export const ParseResultSchema = z.strictObject({ entities: z.array(EntitySchema) });

/**
 * The contract the API enforces, with every kind on: no assignee_id — that field is born in
 * postprocess — and no ISO time, which code resolves from TimeRefs (task 026).
 *
 * Eight kinds at most: the API compiles this schema into one grammar and refuses a ninth
 * variant with «The compiled grammar is too large» — measured on 2026-09-18, and it refuses
 * it even when the new variant carries six fields and no nullable at all. So a kind can
 * only enter by trading places, and the owner traded `delegation` for `event` (D-78):
 * «распредели в группе» is a task for that manager, a meeting is not expressible any other
 * way. `DelegationEntitySchema` stays in the app union — rows parsed before the trade are
 * still valid. A company may switch kinds off (`modelParseResultSchema`), never add one.
 */
export const ModelEntitySchema = z.discriminatedUnion("kind", [
  AnnouncementEntitySchema,
  ModelTaskEntitySchema,
  ModelPointsEntitySchema,
  ModelReminderEntitySchema,
  NoteEntitySchema,
  ModelEventEntitySchema,
  ModelRecurrenceEntitySchema,
  QueryEntitySchema,
]);
export const ModelParseResultSchema = z.strictObject({ entities: z.array(ModelEntitySchema) });
export type ModelEntity = z.infer<typeof ModelEntitySchema>;
export type ModelParseResult = z.infer<typeof ModelParseResultSchema>;

export type AnnouncementEntity = z.infer<typeof AnnouncementEntitySchema>;
export type TaskEntity = z.infer<typeof TaskEntitySchema>;
export type PointsEntity = z.infer<typeof PointsEntitySchema>;
export type ReminderEntity = z.infer<typeof ReminderEntitySchema>;
export type NoteEntity = z.infer<typeof NoteEntitySchema>;
export type EventEntity = z.infer<typeof EventEntitySchema>;
export type RecurrenceEntity = z.infer<typeof RecurrenceEntitySchema>;
export type DelegationEntity = z.infer<typeof DelegationEntitySchema>;
export type QueryEntity = z.infer<typeof QueryEntitySchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;

type JsonSchemaNode = Record<string, unknown>;

/**
 * Deterministic post-processing of the generated JSON Schema for Anthropic structured
 * outputs: every object closed, every property required, and nullability expressed as
 * anyOf [type, null] — the union form `type: [..., "null"]` is rejected by the validator
 * (confirmed on the prototype). This schema — not the SDK's zodOutputFormat() — is what
 * goes to the API: the SDK helper turns z.literal("task") into a plain string, the model
 * then mixes fields of different kinds (live failure r-024, 2026-09-07).
 *
 * A nullable enum is written as one `enum` that lists null among its values — no anyOf: the
 * API caps union parameters at 16, and TimeRef alone has three nullable enums (task 026).
 */
function harden(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(harden);
  if (typeof node !== "object" || node === null) return node;

  const out: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node as JsonSchemaNode)) {
    if (key === "$schema") continue; // draft marker is noise for the API
    out[key] = key === "properties" || key === "$defs" ? hardenMap(value) : harden(value);
  }

  // The API supports anyOf but not oneOf; zod emits oneOf for discriminated unions.
  // Variants are disjoint on `kind`, so the two are equivalent here.
  if (Array.isArray(out.oneOf) && out.anyOf === undefined) {
    out.anyOf = out.oneOf;
    delete out.oneOf;
  }

  const type = out.type;
  if (Array.isArray(type) && type.includes("null")) {
    const rest: JsonSchemaNode = { ...out };
    delete rest.type;
    const variants = type
      .filter((t) => t !== "null")
      .map((t) => ({ ...rest, type: t }) as JsonSchemaNode);
    return { anyOf: [...variants, { type: "null" }] };
  }

  if (Array.isArray(out.anyOf) && out.anyOf.length === 2) {
    const [value, empty] = out.anyOf as JsonSchemaNode[];
    if (empty.type === "null" && Object.keys(empty).length === 1 && Array.isArray(value.enum)) {
      return { enum: [...value.enum, null] };
    }
  }

  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as JsonSchemaNode);
  }

  return out;
}

/** Values of `properties`/`$defs` are schemas keyed by name, not schemas themselves. */
function hardenMap(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return harden(value);
  const out: JsonSchemaNode = {};
  for (const [key, child] of Object.entries(value as JsonSchemaNode)) out[key] = harden(child);
  return out;
}

// TimeRef appears four times (deadline, scheduled_send, starts_at, remind_at): one $defs entry
// referenced by $ref keeps the grammar the API compiles to a single copy of it.
const SHARED_DEFS = z.registry<{ id: string }>();
SHARED_DEFS.add(TimeRefSchema, { id: "TimeRef" });

/** The JSON Schema the API (and JSON mode, in the prompt) gets for a model-side zod schema. */
export function modelJsonSchema(schema: z.ZodType): JsonSchemaNode {
  return harden(z.toJSONSchema(schema, { metadata: SHARED_DEFS })) as JsonSchemaNode;
}

export const ENTITIES_JSON_SCHEMA = modelJsonSchema(ModelParseResultSchema);

const byKinds = new Map<string, { zod: typeof ModelParseResultSchema; json: JsonSchemaNode }>();

/** The model's contract for the kinds a company has on: the union of their modules' variants. */
function forKinds(kinds: readonly ParserKind[]): { zod: typeof ModelParseResultSchema; json: JsonSchemaNode } {
  const modules = kindModules(kinds);
  const key = modules.map((module) => module.kind).join(",");
  const known = byKinds.get(key);
  if (known) return known;
  const variants = modules.map((module) => module.modelSchema) as unknown as Parameters<typeof z.discriminatedUnion>[1];
  // a narrower union of the same variants: what parses under it parses under the full one
  const zod = z.strictObject({ entities: z.array(z.discriminatedUnion("kind", variants)) }) as unknown as typeof ModelParseResultSchema;
  const entry = { zod, json: modelJsonSchema(zod) };
  byKinds.set(key, entry);
  return entry;
}

export function modelParseResultSchema(kinds: readonly ParserKind[] = PARSER_KINDS): typeof ModelParseResultSchema {
  return forKinds(kinds).zod;
}

export function entitiesJsonSchema(kinds: readonly ParserKind[] = PARSER_KINDS): JsonSchemaNode {
  return forKinds(kinds).json;
}
