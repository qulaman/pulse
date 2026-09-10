import { apiError, apiOk } from "@/lib/api/respond";
import { sweepDeliveries } from "@/lib/push/send";

/**
 * The minute sweep (docs/BACKEND.md §4): resend what is still queued.
 * Called by the platform cron with the shared secret, never by a browser.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given !== secret) return apiError(401, "unauthorized", "Нет доступа");
  try {
    return apiOk(await sweepDeliveries());
  } catch (err) {
    console.error("sweep failed:", err instanceof Error ? err.message : err);
    return apiError(500, "internal", "Что-то пошло не так, попробуй ещё раз");
  }
}
