import "server-only";

import webpush from "web-push";

import { getServerEnv } from "@/lib/env";
import { lockScreenText, pushTag, transportFor, ttlLeft } from "@/lib/push/policy";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

const MAX_ATTEMPTS = 3;
const BATCH = 50;
/** A row this close to its end still goes: the push service keeps it at least this long. */
const MIN_TTL = 30;
/** Pushes in flight at once: an announcement to 500 people goes in one tick, not ten. */
const CONCURRENCY = 8;

type Row = Database["public"]["Tables"]["notification_deliveries"]["Row"];
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Meta = { title?: string; body?: string; url?: string; urgent?: boolean } & Record<string, unknown>;
type Service = ReturnType<typeof createServiceSupabase>;
type Result = { sent: number; failed: number; skipped: number };

function vapidReady(): boolean {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? "mailto:admin@example.com", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return true;
}

/** What the service worker gets: the words (or only the kind, when the director hid them), where a tap leads, how to show it. */
export function pushPayload(row: Row): string {
  const meta = (row.meta ?? {}) as Meta;
  const transport = transportFor(row);
  const text = lockScreenText(row, { title: meta.title ?? "Pulse", body: meta.body ?? "" });
  // a hidden row carries nothing of its words — not even in fields the worker does not show
  const base = row.private && row.category !== "alarm" ? { url: meta.url, urgent: meta.urgent } : meta;
  return JSON.stringify({
    ...base,
    title: text.title,
    body: text.body,
    tag: pushTag(meta, row.task_id),
    kind: row.event_kind,
    delivery_id: row.id,
    // «Принял» from the shade (D-125) needs the task; the url already carries the same id
    task_id: row.task_id,
    // the shade shows when it happened, not when a late worker got to it
    at: row.created_at,
    silent: transport.silent,
  });
}

async function inPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * The outbox worker (docs/BACKEND.md §4): claimed push rows → web-push → sent / failed.
 * Called right after a mutation as a kick and by the minute sweep as insurance; rows are
 * claimed first (`claim_deliveries`, D-114), so two workers at once never send one push twice.
 * Without VAPID keys it leaves the rows queued — a receipt is never faked.
 */
export async function sweepDeliveries({ budgetMs = 8_000 }: { budgetMs?: number } = {}): Promise<Result> {
  const result: Result = { sent: 0, failed: 0, skipped: 0 };
  if (!vapidReady()) return result;

  const service = createServiceSupabase();
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    const { data, error } = await service.rpc("claim_deliveries", { p_limit: BATCH });
    if (error) throw new Error(`outbox claim failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    // a device the director switched off («присылать сюда») is not a target
    const { data: subs } = await service
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds)
      .eq("enabled", true);
    const byUser = new Map<string, Sub[]>();
    for (const sub of (subs ?? []) as Sub[]) {
      const list = byUser.get(sub.user_id) ?? [];
      list.push(sub);
      byUser.set(sub.user_id, list);
    }

    const okSubs = new Set<string>();
    await inPool(rows, CONCURRENCY, (row) => deliver(service, row, byUser.get(row.user_id) ?? [], okSubs, result));
    if (okSubs.size > 0) {
      await service
        .from("push_subscriptions")
        .update({ last_ok_at: new Date().toISOString() })
        .in("id", [...okSubs]);
    }
    if (rows.length < BATCH) break;
  }
  return result;
}

async function deliver(service: Service, row: Row, targets: Sub[], okSubs: Set<string>, result: Result): Promise<void> {
  if (targets.length === 0) {
    // nobody to send to: failed with a readable reason — the director reads it as
    // «уведомления не включены», tier 2 (Telegram) picks it up later. Checked before the
    // age: a missing channel is the truer reason, and the signals count it
    await service
      .from("notification_deliveries")
      .update({ status: "failed", attempts: MAX_ATTEMPTS, last_error: "no_subscription", claimed_at: null })
      .eq("id", row.id);
    result.failed += 1;
    return;
  }

  const left = ttlLeft(row);
  if (left <= 0) {
    // its moment is gone (D-125): not a dead channel — `expired` never counts as
    // «уведомления не доходят» (team_channel_alerts_due reads only no_subscription / push …)
    await service
      .from("notification_deliveries")
      .update({ status: "failed", attempts: MAX_ATTEMPTS, last_error: "expired", claimed_at: null })
      .eq("id", row.id);
    result.skipped += 1;
    return;
  }

  const payload = pushPayload(row);
  const transport = transportFor(row);
  let delivered = false;
  let lastError = "";
  for (const sub of targets) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        // a row that waited keeps only what is left of its life at the push service too
        { TTL: Math.max(MIN_TTL, Math.min(transport.ttl, left)), urgency: transport.urgency },
      );
      delivered = true;
      okSubs.add(sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      lastError = `push ${status ?? "error"}`;
      if (status === 404 || status === 410) {
        // the browser dropped the subscription — forget it; the app re-registers on its next start
        await service.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        await service
          .from("push_subscriptions")
          .update({ last_error: lastError, last_error_at: new Date().toISOString() })
          .eq("id", sub.id);
      }
    }
  }

  if (delivered) {
    await service
      .from("notification_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null, claimed_at: null })
      .eq("id", row.id);
    result.sent += 1;
  } else {
    const attempts = row.attempts + 1;
    await service
      .from("notification_deliveries")
      .update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, last_error: lastError, claimed_at: null })
      .eq("id", row.id);
    result.failed += 1;
  }
}

/**
 * The kick after a mutation; the sweep is the safety net, so errors only log. It RETURNS the
 * work (D-125): `after(() => kickDeliveries())` hands the promise to the platform, which keeps
 * the function alive until the pushes are out. A `void` here let Vercel freeze the function
 * right after the response — rows stayed claimed and half-sent until the next request thawed
 * it, minutes or a night later. A caller inside `after(async () => …)` must `await` it.
 */
export function kickDeliveries(): Promise<void> {
  return sweepDeliveries().then(
    () => undefined,
    (err) => console.error("push kick failed:", err instanceof Error ? err.message : err),
  );
}
