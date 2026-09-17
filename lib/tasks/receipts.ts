"use client";

import { humanAqtobe } from "@/lib/ai/time";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/**
 * The receipt of the last message the director sent in a thread (принцип 8, D-32):
 * «отправлено / увидел / прочитал», never «не получил» — Web Push does not confirm
 * delivery. The row is the outbox row the trigger queued for the other side.
 */

export type DeliveryRow = Database["public"]["Tables"]["notification_deliveries"]["Row"];

export type ReceiptTone = "ok" | "muted" | "warn";
export type Receipt = { text: string; tone: ReceiptTone };

const receiptKeys = (taskId: string) => ["thread-receipt", taskId] as const;

/** «сегодня 09:14» reads as «не открывал с 09:14» once today is dropped. */
function at(iso: string, now: Date): string {
  return humanAqtobe(new Date(iso), now).replace(/^сегодня /, "");
}

/**
 * One line under the director’s last word. Pure — the clock comes in, so the wording
 * is unit-tested. Null when there is nothing honest to say yet (just queued, inside the
 * window: the phone has not been reached and no promise can be made).
 */
export function receiptLine(delivery: DeliveryRow | null | undefined, now: Date = new Date()): Receipt | null {
  if (!delivery) return null;
  if (delivery.acted_at) return { text: `прочитал ${at(delivery.acted_at, now)}`, tone: "ok" };
  if (delivery.seen_at) return { text: `увидел ${at(delivery.seen_at, now)}`, tone: "muted" };
  if (delivery.status === "sent" && delivery.sent_at) {
    return { text: `не открывал с ${at(delivery.sent_at, now)}`, tone: "warn" };
  }
  if (delivery.status === "failed" && delivery.last_error === "no_subscription") {
    return { text: "уведомления не включены", tone: "warn" };
  }
  if (delivery.status === "queued" && delivery.deliver_after && new Date(delivery.deliver_after) > now) {
    // quiet hours (D-38): the words wait for the morning, and the director is told so
    const when = at(delivery.deliver_after, now);
    // «отправлю в 08:00» today, «отправлю завтра 08:00» when a day word comes with it
    return { text: /^\d/.test(when) ? `отправлю в ${when}` : `отправлю ${when}`, tone: "muted" };
  }
  return null;
}

/**
 * The newest message receipt of a thread, live. Only the director asks: RLS gives a
 * person their own rows and the director the company’s, so an employee would read
 * their own receipt and mistake it for the other side’s (§0 п.7 — the employee sees
 * no ticks until the owner says otherwise).
 */
export function useThreadReceipt(taskId: string, enabled: boolean) {
  return useRealtimeQuery<DeliveryRow | null, DeliveryRow>({
    queryKey: receiptKeys(taskId),
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select("*")
        .eq("task_id", taskId)
        .eq("event_kind", "message")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return (data?.[0] ?? null) as DeliveryRow | null;
    },
    channel: { table: "notification_deliveries", filter: `task_id=eq.${taskId}` },
    enabled,
  });
}
