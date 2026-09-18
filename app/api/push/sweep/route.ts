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
    return apiOk({ ...(await sweepDeliveries()), reminders: due.data ?? 0 });
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуй ещё раз");
  }
}
