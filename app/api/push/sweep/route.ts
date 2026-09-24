import { apiError, apiOk } from "@/lib/api/respond";
import { sweepDeliveries } from "@/lib/push/send";
import { createServiceSupabase } from "@/lib/supabase/service";

/** One tick may drain a long queue (an announcement to the whole company); the platform allows a minute. */
export const maxDuration = 60;

type Service = ReturnType<typeof createServiceSupabase>;
type Tick =
  | "publish_due_scheduled"
  | "events_due_reminders"
  | "errands_due_escalation"
  | "errands_expire"
  | "errands_due_remind"
  | "notes_due_reminders"
  | "notes_purge_trash"
  | "visits_due_expiry"
  | "unseen_task_alerts_due"
  | "overdue_alerts_due"
  | "director_day_summaries_due"
  | "director_digests_due";

/** Each tick on its own: a failing one is logged and the rest — and the queue — still go. */
async function tick(service: Service, name: Tick): Promise<number> {
  const { data, error } = await service.rpc(name);
  if (error) {
    console.error(`${name} failed:`, error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * The minute sweep (docs/BACKEND.md §10): the ticks that queue pushes, then the queue itself.
 * Called by the platform cron with the shared secret (Vercel Cron sends GET), never by a browser.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given !== secret) return apiError(401, "unauthorized", "Нет доступа");
  try {
    const service = createServiceSupabase();
    // first the tasks held for the delivery window (D-38, tasks/017): their «task_sent» rows
    // then go out with this very sweep, not a minute later
    const published = await tick(service, "publish_due_scheduled");
    const reminders = await tick(service, "events_due_reminders"); // D-78
    const escalations = await tick(service, "errands_due_escalation"); // D-79
    await tick(service, "errands_expire"); // «не беспокоить на 30 мин» ends by itself, D-99
    const dueReminders = await tick(service, "errands_due_remind"); // «такси к 18:00», D-106 §8
    const noteReminders = await tick(service, "notes_due_reminders"); // «напомни мне», D-95
    const notesPurged = await tick(service, "notes_purge_trash");
    const visitsExpired = await tick(service, "visits_due_expiry"); // D-96
    // the director's signals (D-114): «задача не открыта», «просрочено», «итог дня» — and
    // last, the digests, so a signal held for one goes into it on the same tick
    const unseen = await tick(service, "unseen_task_alerts_due");
    const overdue = await tick(service, "overdue_alerts_due");
    const summaries = await tick(service, "director_day_summaries_due");
    const digests = await tick(service, "director_digests_due");
    // the rows just queued go out on this very tick, not on the next one
    return apiOk({
      ...(await sweepDeliveries({ budgetMs: 40_000 })),
      published,
      reminders,
      escalations,
      due_reminders: dueReminders,
      note_reminders: noteReminders,
      notes_purged: notesPurged,
      visits_expired: visitsExpired,
      unseen,
      overdue,
      summaries,
      digests,
    });
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуй ещё раз");
  }
}

/** Vercel Cron calls the path from vercel.json with GET (and the same Bearer secret). */
export const GET = POST;
