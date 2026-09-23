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
    // and a visitor nobody answered leaves the wall (D-96): the same rule again
    const expired = await service.rpc("visits_due_expiry");
    if (expired.error) console.error("visits_due_expiry failed:", expired.error.message);
    return apiOk({
      ...(await sweepDeliveries()),
      reminders: due.data ?? 0,
      escalations: escalated.data ?? 0,
      visits_expired: expired.data ?? 0,
    });
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуй ещё раз");
  }
}
