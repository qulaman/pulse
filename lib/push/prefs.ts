import { z } from "zod";

import { DIGEST_EVERY, NOTIFY_MODES, type NotifyMode } from "@/lib/push/prefs-plain";

/**
 * The director's push rules (D-114). Stored per person in `notification_prefs` and applied by
 * the database when a row is queued (the routing trigger, migration 20260924150200) — so the
 * defaults live twice: here and in `notify_prefs_defaults()`. Keep both. The defaults are
 * today's behaviour (everything «сразу», no quiet hours); the new signals are on: «задачу не
 * приняли» after 30 minutes, overdue in a digest, «уведомления не доходят» at once.
 *
 * Nobody else has rules: employees, the secretary and the shopkeeper live by the fixed policy
 * of lib/push/policy.ts and the company delivery window.
 */

// The lists, labels and row formatters live in prefs-plain.ts, free of zod — the settings screen
// imports them there (D-126). Re-exported here for the server.
export * from "@/lib/push/prefs-plain";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const mode = (fallback: NotifyMode) => z.enum(NOTIFY_MODES).default(fallback);

export const NotifyPrefsSchema = z.object({
  modes: z
    .object({
      review: mode("now"),
      declined: mode("now"),
      questions: mode("now"),
      messages: mode("now"),
      unseen: mode("now"),
      overdue: mode("digest"),
      secretary: mode("now"),
      calendar: mode("now"),
      shop: mode("now"),
      team: mode("now"),
    })
    .prefault({}),
  /** «Задачу не приняли» after this many minutes in working hours. */
  unseen_after_min: z.number().int().min(5).max(240).default(30),
  digest_every: z.enum(DIGEST_EVERY).default("hour"),
  /** «Итог дня» at this Aqtobe time; null — off. */
  day_summary_at: HHMM.nullable().default(null),
  quiet: z
    .object({
      on: z.boolean().default(false),
      from: HHMM.default("21:00"),
      to: HHMM.default("08:00"),
      /** Saturday and Sunday are quiet all day. */
      weekends: z.boolean().default(false),
    })
    .prefault({}),
  /** What passes the quiet hours. The alarm always does. */
  pass: z
    .object({
      reminders: z.boolean().default(true),
      visitors: z.boolean().default(true),
      vip: z.boolean().default(false),
    })
    .prefault({}),
  /** During a calendar meeting only what cannot wait comes; the rest waits for its end. */
  meetings: z.boolean().default(false),
  /** Important people: their tasks' news always comes at once. */
  vip: z.array(z.guid()).max(50).default([]),
  /** «Текст на блокировке»: «full» — the words, «short» — only what happened. */
  lock_text: z.enum(["full", "short"]).default("full"),
});

export type NotifyPrefs = z.infer<typeof NotifyPrefsSchema>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = NotifyPrefsSchema.parse({});

/** Whatever the row holds, a whole valid object comes back; a broken section falls back to defaults. */
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  const result = NotifyPrefsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // keep what is readable section by section rather than dropping everything
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(NotifyPrefsSchema.shape) as (keyof NotifyPrefs)[]) {
    const one = NotifyPrefsSchema.shape[key].safeParse(source[key]);
    if (one.success) out[key] = one.data;
  }
  return NotifyPrefsSchema.parse(out);
}
