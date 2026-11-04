import { z } from "zod";

import { SettingsPatchSchema } from "@/lib/settings";

/**
 * The console's frozen contract (D-157, tasks/029): every route body and answer, shared by the
 * routes and the screens. Free of `server-only` so client code and tests import it.
 */

/** The console's own session cookie: an operator's sign-in never touches a company session. */
export const OPS_COOKIE = "pulse-ops-auth";

/** How fresh a TOTP must be for a dangerous action; the base enforces it (ops_ticket). */
export const FRESH_SECONDS = 300;

/** Every writing action. The base decides which of them need a fresh TOTP (ops_ticket). */
export const OPS_ACTIONS = [
  "create_company",
  "update_company",
  "add_person",
  "update_person",
  "issue_login_code",
  "revoke_sessions",
  "change_director",
  "adjust_points",
  "task_lookup",
  "update_task",
  "delete_task",
  "wipe_activity",
  "export_company",
  "purge_company",
] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

/** Every write carries why and an idempotency key (principle 7). */
export const WriteSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  client_request_id: z.guid(),
});
export type Write = z.infer<typeof WriteSchema>;

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const Name = z.string().trim().min(2).max(120);
const Position = z.string().trim().max(120);
/** Roles a person may hold through the console; `director` only through change_director. */
export const OPS_PERSON_ROLES = ["manager", "employee", "shopkeeper", "secretary"] as const;
export const OpsPersonRoleSchema = z.enum(OPS_PERSON_ROLES);

// ---------------------------------------------------------------------- sign-in

export const LoginBodySchema = z.strictObject({ email: z.email(), password: z.string().min(1).max(72) });
export type LoginBody = z.infer<typeof LoginBodySchema>;
/** `enroll`: no factor yet, show the QR. `verify`: ask the code. `done`: already aal2. */
export type LoginAnswer = { next: "enroll" | "verify" | "done" };

export type EnrollAnswer = { factor_id: string; qr_svg: string; secret: string; uri: string };

export const VerifyBodySchema = z.strictObject({ code: z.string().regex(/^\d{6}$/), factor_id: z.string().min(1).optional() });
export type VerifyBody = z.infer<typeof VerifyBodySchema>;
export type VerifyAnswer = { ok: true };

export type MeAnswer = { email: string; user_id: string };

// ---------------------------------------------------------------------- reading

export type CompanyRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  people: number;
  /** Signed sessions refreshed within 7 days, kiosk excluded. */
  active_7d: number;
  last_seen_at: string | null;
  last_parse_at: string | null;
  parse_errors_24h: number;
  queue_depth: number;
  queue_age_seconds: number | null;
  failed_7d: number;
};
export type CompaniesAnswer = { companies: CompanyRow[] };

export type CardPerson = {
  id: string;
  full_name: string;
  role: string;
  position: string | null;
  is_active: boolean;
  /** null for a service address: it is no email at all. */
  email: string | null;
  last_seen_at: string | null;
  sessions: number;
  devices: number;
  points: number;
};

export type SpendRow = {
  provider: string | null;
  model: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  /** Priced by lib/ai/pricing.ts on the server; null when the model has no price. */
  usd: number | null;
};

export type CompanyCard = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  settings: { parser_provider: string | null; parser_model: string | null; points_enabled: boolean; lab_for_all: boolean; dev_tools: boolean };
  people: CardPerson[];
  spend_30d: SpendRow[];
  tv_seen_at: string | null;
  signals: {
    parse_errors_24h: number;
    queue_depth: number;
    queue_age_seconds: number | null;
    failed_7d: number;
    /** `no_subscription` failures are nobody's fault: told apart from the rest. */
    failed_no_subscription_7d: number;
  };
};

export type Footprint = {
  /** Rows per table of this company; children reached through their parent are counted too. */
  tables: Record<string, number>;
  files: Record<"voice" | "photos" | "brand", { count: number; bytes: number }>;
  /** Files marked «в корпус» (D-155 п.3): the wipe keeps them, the purge removes them. */
  kept_files: number;
  files_queued: number;
  last_export: { at: string; sha256: string } | null;
};

export type AuditRow = {
  id: number;
  at: string;
  operator_id: string | null;
  operator_email: string | null;
  action: string;
  company_id: string | null;
  company_name: string | null;
  target: Record<string, unknown>;
  reason: string;
  result: Record<string, unknown> | null;
};
export type AuditAnswer = { rows: AuditRow[]; next_before: number | null };

export type OperatorRow = {
  user_id: string;
  email: string | null;
  note: string | null;
  created_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
};
export type OperatorsAnswer = { operators: OperatorRow[] };

// ---------------------------------------------------------------------- companies

export const CreateCompanyBodySchema = WriteSchema.extend({
  name: Name,
  slug: Slug,
  director: z.strictObject({
    full_name: Name,
    position: Position.optional(),
    /** Optional: without it the director has a service address and signs in with a code. */
    email: z.email().optional(),
  }),
  parser: z.strictObject({ provider: z.enum(["anthropic", "deepseek"]) }),
  points_enabled: z.boolean().default(false),
});
export type CreateCompanyBody = z.infer<typeof CreateCompanyBodySchema>;

/** The code exists in this answer only (D-135 §3): a repeat of the request brings no code. */
export type IssuedCode = { code: string; expires_at: string; link: string; company: string; name: string };
export type CreateCompanyAnswer = {
  company_id: string;
  director_id: string;
  tv_id: string;
  slug: string;
  duplicate: boolean;
  login: IssuedCode | null;
};

export const UpdateCompanyBodySchema = WriteSchema.extend({
  name: Name.optional(),
  slug: Slug.optional(),
  settings: SettingsPatchSchema.optional(),
  /** `settings.dev_tools` («Лаборатория», «Данные»): only the console opens them for a company. */
  dev_tools: z.boolean().optional(),
});
export type UpdateCompanyBody = z.infer<typeof UpdateCompanyBodySchema>;
export type UpdateCompanyAnswer = { ok: true; duplicate: boolean };

// ---------------------------------------------------------------------- people

export const AddPersonBodySchema = WriteSchema.extend({
  full_name: Name,
  role: OpsPersonRoleSchema,
  position: Position.optional(),
  email: z.email().optional(),
});
export type AddPersonBody = z.infer<typeof AddPersonBodySchema>;
export type AddPersonAnswer = { user_id: string; duplicate: boolean };

const OpsTargetSchema = z.object({ company_id: z.guid() });

export const UpdatePersonBodySchema = WriteSchema.extend({
  ...OpsTargetSchema.shape,
  full_name: Name.optional(),
  position: Position.nullable().optional(),
  role: OpsPersonRoleSchema.optional(),
  is_active: z.boolean().optional(),
});
export type UpdatePersonBody = z.infer<typeof UpdatePersonBodySchema>;
export type UpdatePersonAnswer = { ok: true; duplicate: boolean };

export const PersonLoginBodySchema = WriteSchema.extend(OpsTargetSchema.shape);
export type PersonLoginBody = z.infer<typeof PersonLoginBodySchema>;
/** `login` is null on a repeat of the same request: a new code takes a new request. */
export type PersonLoginAnswer = { login: IssuedCode | null; duplicate: boolean };

export const RevokeSessionsBodySchema = WriteSchema.extend(OpsTargetSchema.shape);
export type RevokeSessionsBody = z.infer<typeof RevokeSessionsBodySchema>;
export type RevokeSessionsAnswer = { sessions: number; devices: number; duplicate: boolean };

export const AdjustPointsBodySchema = WriteSchema.extend({
  ...OpsTargetSchema.shape,
  amount: z.number().int().min(-100000).max(100000).refine((n) => n !== 0),
});
export type AdjustPointsBody = z.infer<typeof AdjustPointsBodySchema>;
export type AdjustPointsAnswer = { balance: number; duplicate: boolean };

/** `keep`: both stay directors; only for a handover in progress. */
export const OLD_FATES = ["deactivate", "demote", "keep"] as const;
export const ChangeDirectorBodySchema = WriteSchema.extend({
  old_id: z.guid(),
  /** Exactly one: somebody of the company, or a new person to create. */
  new_id: z.guid().optional(),
  new_person: z.strictObject({ full_name: Name, position: Position.optional(), email: z.email().optional() }).optional(),
  old_fate: z.enum(OLD_FATES),
}).refine((b) => Boolean(b.new_id) !== Boolean(b.new_person), { path: ["new_id"] });
export type ChangeDirectorBody = z.infer<typeof ChangeDirectorBodySchema>;
export type ChangeDirectorAnswer = {
  new_id: string;
  moved: { tasks: number; rules: number; events: number; errands_cancelled: number };
  /** The new director's way in, when a new person was created or asked for. */
  login: IssuedCode | null;
  duplicate: boolean;
};

// ---------------------------------------------------------------------- tasks

export const TaskLookupBodySchema = WriteSchema.extend({ task_id: z.guid() });
export type TaskLookupBody = z.infer<typeof TaskLookupBodySchema>;
export type OpsTask = {
  id: string;
  title: string;
  body: string | null;
  deadline: string | null;
  status: string;
  author: string | null;
  assignee: string | null;
  created_at: string;
};
export type TaskLookupAnswer = { task: OpsTask; duplicate: boolean };

export const UpdateTaskBodySchema = WriteSchema.extend({
  ...OpsTargetSchema.shape,
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().max(10000).nullable().optional(),
  deadline: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;
export type UpdateTaskAnswer = { ok: true; duplicate: boolean };

export const DeleteTaskBodySchema = WriteSchema.extend(OpsTargetSchema.shape);
export type DeleteTaskBody = z.infer<typeof DeleteTaskBodySchema>;
export type DeleteTaskAnswer = { ok: true; duplicate: boolean };

// ---------------------------------------------------------------------- cleanup

export const WipeBodySchema = WriteSchema.extend({ confirm_name: z.string().min(1).max(120) });
export type WipeBody = z.infer<typeof WipeBodySchema>;
export type WipeAnswer = { rows: Record<string, number>; files_queued: number; files_left: number; duplicate: boolean };

export const PurgeBodySchema = WipeBodySchema;
export type PurgeBody = z.infer<typeof PurgeBodySchema>;
export type PurgeAnswer = { rows: Record<string, number>; files_queued: number; files_left: number; duplicate: boolean };

export type DrainAnswer = { removed: number; left: number };

export const ExportStartBodySchema = WriteSchema;
export type ExportStartBody = z.infer<typeof ExportStartBodySchema>;
export type ExportStartAnswer = { export_id: string; tables: string[]; duplicate: boolean };
export type ExportPageAnswer = { rows: unknown[]; done: boolean };
export type ExportFilesAnswer = { files: { bucket: string; name: string; url: string; bytes: number }[]; done: boolean };

export const ExportFinishBodySchema = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  counts: z.record(z.string(), z.number().int().min(0)),
});
export type ExportFinishBody = z.infer<typeof ExportFinishBodySchema>;
export type ExportFinishAnswer = { ok: true };

/** The failure codes a screen must react to; every other one is shown by its `message_ru`. */
export type OpsErrorCode =
  | "unauthorized"
  | "fresh_required"
  | "validation_error"
  | "slug_taken"
  | "email_exists"
  | "confirm_mismatch"
  | "export_required"
  | "not_found"
  | "not_director"
  | "internal";
