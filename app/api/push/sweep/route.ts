import { apiError, apiOk } from "@/lib/api/respond";
import { drainStorage } from "@/lib/ops/db";
import { sweepDeliveries } from "@/lib/push/send";
import { createServiceSupabase } from "@/lib/supabase/service";
import { purgeVoice } from "@/lib/voice/retention";

/** One tick may drain a long queue (an announcement to the whole company); the platform allows a minute. */
export const maxDuration = 60;

/** A hand on the sweep's minute: the queue itself gets the 40 seconds of `sweepDeliveries`. */
const OPS_DRAIN_MS = 5_000;

type Service = ReturnType<typeof createServiceSupabase>;

/**
 * The ticks in their order, each with the field of the answer that counts it (null — none).
 * Each tick is a SQL function that queues what is due and answers how much it did.
 */
const TICKS = [
  // yesterday's daily reports not sent become «не сдан» (and the minus with points on, D-152);
  // first, so the day's book is closed before anything else of the morning
  ["daily_reports_due_missed", "daily_missed"],
  // the repeating orders make this day's tasks and the series their next meeting (D-148) —
  // before the publishing, so a task made for the window goes out with this very sweep
  ["recurrence_spawn", "repeated"],
  // then the tasks held for the delivery window (D-38, tasks/017): their «task_sent» rows
  // then go out with this very sweep, not a minute later
  ["publish_due_scheduled", "published"],
  // the employee's morning brief (D-191): after the two above, so it counts the tasks this very
  // sweep gave out; once a working day a person, inside the window. On the daily Hobby cron
  // (08:xx Aqtobe) it goes at 08:00 for a window opening at 08:00; a later window waits for В-8
  ["employee_morning_briefs_due", "morning_briefs"],
  ["events_due_reminders", "reminders"], // D-78
  ["errands_due_escalation", "escalations"], // D-79
  ["errands_expire", null], // «не беспокоить на 30 мин» ends by itself, D-99
  ["errands_due_remind", "due_reminders"], // «такси к 18:00», D-106 §8
  ["notes_due_reminders", "note_reminders"], // «напомни мне», D-95
  ["notes_purge_trash", "notes_purged"],
  ["visits_due_expiry", "visits_expired"], // D-96
  // the director's signals (D-114): «задача не принята», «просрочено», «уведомления не
  // доходят», «итог дня» — and last, the digests, so a signal held for one goes into it
  ["unseen_task_alerts_due", "unseen"],
  ["overdue_alerts_due", "overdue"],
  ["deadline_reminders_due", "deadline_soon"], // «Скоро срок» to the employee, D-128
  ["daily_report_reminders_due", "daily_reminders"], // «Сдайте отчёт за день», D-152
  ["team_channel_alerts_due", "team"], // «уведомления не доходят»
  ["director_day_summaries_due", "summaries"],
  ["director_digests_due", "digests"],
  // the outbox cleans itself: 30 days for what went, 7 for what never did, a batch a minute
  ["notification_deliveries_purge", "purged"],
  // the wall's feed lives on its last month (tv_events_prune, 30 days by default); the
  // function existed since D-76 but nothing called it, so the table only grew (D-126)
  ["tv_events_prune", "tv_pruned"],
] as const;

type Tick = (typeof TICKS)[number][0];

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
    const counts: Record<string, number> = {};
    for (const [name, field] of TICKS) {
      const count = await tick(service, name);
      if (field) counts[field] = count;
    }
    // voice files past their term (D-155 §3): removed through Storage, then their paths cleared;
    // a failure is logged inside and the sweep goes on — what stayed comes again next time
    const voicePurged = await purgeVoice(service);
    // files of wiped and removed companies (D-157); the same rule: logged, and the rest come again
    const opsFiles = await drainStorage(service, OPS_DRAIN_MS);
    // the rows just queued go out on this very tick, not on the next one
    return apiOk({
      ...(await sweepDeliveries({ budgetMs: 40_000 })),
      ...counts,
      voice_purged: voicePurged,
      ops_files: opsFiles,
    });
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуйте ещё раз");
  }
}

/** Vercel Cron calls the path from vercel.json with GET (and the same Bearer secret). */
export const GET = POST;
