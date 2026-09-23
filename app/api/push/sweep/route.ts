import { apiError, apiOk } from "@/lib/api/respond";
import { sweepDeliveries } from "@/lib/push/send";
import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * The minute sweep (docs/BACKEND.md §4): resend what is still queued.
 * Called by the platform cron with the shared secret, never by a browser.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given !== secret) return apiError(401, "unauthorized", "Нет доступа");
  try {
    // the same minute tick carries the event reminders (D-78): a failing tick must not
    // take the sweep down with it — the queue still has to go out
    const service = createServiceSupabase();
    const due = await service.rpc("events_due_reminders");
    if (due.error) console.error("events_due_reminders failed:", due.error.message);
    // and the one repeat push of an errand nobody took (D-79): same rule — a failing
    // tick is logged, the queue still goes out
    const escalated = await service.rpc("errands_due_escalation");
    if (escalated.error) console.error("errands_due_escalation failed:", escalated.error.message);
    // a request with an end («не беспокоить на 30 мин», D-99) ends by itself on the tick
    const ended = await service.rpc("errands_expire");
    if (ended.error) console.error("errands_expire failed:", ended.error.message);
    // «такси к 18:00»: one reminder ten minutes before the time (D-106 §8), same rule
    const dueSoon = await service.rpc("errands_due_remind");
    if (dueSoon.error) console.error("errands_due_remind failed:", dueSoon.error.message);
    // the director's own «напомни мне» — a note with a time (D-95) — and the bin of notes,
    // which keeps a deleted thought three days; same rule, a failure is logged, not fatal
    const noted = await service.rpc("notes_due_reminders");
    if (noted.error) console.error("notes_due_reminders failed:", noted.error.message);
    const purged = await service.rpc("notes_purge_trash");
    if (purged.error) console.error("notes_purge_trash failed:", purged.error.message);
    // and a visitor nobody answered leaves the wall (D-96): the same rule again
    const expired = await service.rpc("visits_due_expiry");
    if (expired.error) console.error("visits_due_expiry failed:", expired.error.message);
    // the rows just queued go out on this very tick, not on the next one
    return apiOk({
      ...(await sweepDeliveries()),
      reminders: due.data ?? 0,
      escalations: escalated.data ?? 0,
      due_reminders: dueSoon.data ?? 0,
      note_reminders: noted.data ?? 0,
      notes_purged: purged.data ?? 0,
      visits_expired: expired.data ?? 0,
    });
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуй ещё раз");
  }
}
