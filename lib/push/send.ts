import "server-only";

import webpush from "web-push";

import { getServerEnv } from "@/lib/env";
import { createServiceSupabase } from "@/lib/supabase/service";

const MAX_ATTEMPTS = 3;
const BATCH = 50;

type Payload = { title?: string; body?: string; url?: string };

function vapidReady(): boolean {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? "mailto:admin@example.com", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return true;
}

/**
 * The outbox worker (docs/BACKEND.md §4): queued push rows → web-push → sent / failed.
 * Called right after a mutation as a kick and by the minute sweep as insurance.
 * Without VAPID keys it leaves the rows queued — a receipt is never faked.
 */
export async function sweepDeliveries(): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!vapidReady()) return result;

  const service = createServiceSupabase();
  const { data: rows, error } = await service
    .from("notification_deliveries")
    .select("id, user_id, meta, attempts")
    .eq("status", "queued")
    .eq("channel", "push")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(BATCH);
  if (error) throw new Error(`outbox read failed: ${error.message}`);
  if (!rows || rows.length === 0) return result;

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: subs } = await service
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  const byUser = new Map<string, NonNullable<typeof subs>>();
  for (const sub of subs ?? []) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  for (const row of rows) {
    const targets = byUser.get(row.user_id) ?? [];
    if (targets.length === 0) {
      // nobody to send to: failed with a readable reason — tier 2 (Telegram) picks it up later
      await service
        .from("notification_deliveries")
        .update({ status: "failed", attempts: MAX_ATTEMPTS, last_error: "no_subscription" })
        .eq("id", row.id);
      result.failed += 1;
      continue;
    }

    const payload = JSON.stringify({ ...(row.meta as Payload), delivery_id: row.id });
    let delivered = false;
    let lastError = "";
    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: "high" },
        );
        delivered = true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        lastError = `push ${status ?? "error"}`;
        // 404/410: the browser dropped the subscription — forget it
        if (status === 404 || status === 410) {
          await service.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    if (delivered) {
      await service
        .from("notification_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq("id", row.id);
      result.sent += 1;
    } else {
      const attempts = row.attempts + 1;
      await service
        .from("notification_deliveries")
        .update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, last_error: lastError })
        .eq("id", row.id);
      result.failed += 1;
    }
  }
  return result;
}

/** Fire-and-forget kick after a mutation; the sweep is the safety net, so errors only log. */
export function kickDeliveries(): void {
  void sweepDeliveries().catch((err) => console.error("push kick failed:", err instanceof Error ? err.message : err));
}
