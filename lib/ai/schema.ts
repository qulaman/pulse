import { z } from "zod";

/**
 * Single source of truth for the parser output contract (docs/AI.md §3).
 * TS types are inferred from the zod schemas and ENTITIES_JSON_SCHEMA is generated
 * from the same schemas — types and JSON Schema cannot drift apart.
 *
 * Nullable fields use .nullable() and never .optional(): with structured outputs
 * every property is required.
 */

export const PrioritySchema = z.enum(["high", "normal", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

const assigneeFields = {
  assignee_queries: z.array(z.string()), // verbatim mentions as heard; [] if none
  assignee_id: z.string().nullable(), // roster id matched by the model
  assignee_confidence: z.number(), // 0..1
};

export const AnnouncementEntitySchema = z.strictObject({
  kind: z.literal("announcement"),
  text: z.string(),
  source_span: z.string(),
});

export const TaskEntitySchema = z.strictObject({
  kind: z.literal("task"),
  ...assigneeFields,
  group_id: z.string().nullable(), // same for copies born from one multi-assignee phrase
  title: z.string(),
  body: z.string().nullable(),
  deadline_iso: z.string().nullable(), // ISO 8601, explicit +05:00; server converts to UTC
  deadline_confidence: z.number().nullable(),
  deadline_source_text: z.string().nullable(), // e.g. "завтра до обеда" — chip on /confirm
  priority: PrioritySchema,
  scheduled_send_at: z.string().nullable(), // only on explicit "отправь утром/в понедельник"
  source_span: z.string(),
});

export const PointsEntitySchema = z.strictObject({
  kind: z.literal("points"),
  ...assigneeFields,
  amount: z.number(),
  reason: z.string().nullable(),
  source_span: z.string(),
});

export const ReminderEntitySchema = z.strictObject({
  kind: z.literal("reminder"),
  text: z.string(),
  remind_at_iso: z.string().nullable(),
  source_span: z.string(),
});

export const RecurrenceEntitySchema = z.strictObject({
  kind: z.literal("recurrence"),
  ...assigneeFields,
  title: z.string(),
  rrule: z.string(),
  source_span: z.string(),
});

export const DelegationEntitySchema = z.strictObject({
  kind: z.literal("delegation"),
  ...assigneeFields,
  title: z.string(),
  note: z.string().nullable(),
  source_span: z.string(),
});

export const QueryEntitySchema = z.strictObject({
  kind: z.literal("query"),
  question: z.string(),
  source_span: z.string(),
});

export const EntitySchema = z.discriminatedUnion("kind", [
  AnnouncementEntitySchema,
  TaskEntitySchema,
  PointsEntitySchema,
  ReminderEntitySchema,
  RecurrenceEntitySchema,
  DelegationEntitySchema,
  QueryEntitySchema,
]);

export const ParseResultSchema = z.strictObject({ entities: z.array(EntitySchema) });

export type AnnouncementEntity = z.infer<typeof AnnouncementEntitySchema>;
export type TaskEntity = z.infer<typeof TaskEntitySchema>;
export type PointsEntity = z.infer<typeof PointsEntitySchema>;
export type ReminderEntity = z.infer<typeof ReminderEntitySchema>;
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

export const ENTITIES_JSON_SCHEMA = harden(z.toJSONSchema(ParseResultSchema)) as JsonSchemaNode;
