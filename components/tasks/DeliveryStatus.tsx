"use client";

import { receiptText, type ReceiptTone } from "@/lib/tasks/desk";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["notification_deliveries"]["Row"];

/** The newest «task_sent» delivery of a task, live; idle while no task is given. */
export function useTaskDelivery(taskId: string | null) {
  return useRealtimeQuery<Delivery | null, Delivery>({
    queryKey: ["deliveries", taskId ?? ""],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select("*")
        .eq("task_id", taskId as string)
        .eq("event_kind", "task_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    channel: { table: "notification_deliveries", filter: `task_id=eq.${taskId ?? ""}` },
    enabled: Boolean(taskId),
  });
}

export const RECEIPT_COLOR: Record<ReceiptTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  muted: "var(--text-muted)",
};

/**
 * «отправлено / увидел / принял» on the director's card (D-32, принцип 8).
 * Wording is honest: a push has no delivery receipt, so the middle state says
 * «не открывал с HH:MM», never «не получил». The words live in `receiptText`.
 */
export function DeliveryStatus({ taskId, status }: { taskId: string; status: string }) {
  const delivery = useTaskDelivery(taskId);
  const d = delivery.data;
  // the line's height is reserved before the receipt arrives — cards never grow under the thumb
  if (!d) return <p className="mt-2 h-4" aria-hidden />;

  const { text, tone } = receiptText(d, status);
  const color = RECEIPT_COLOR[tone];

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-4" style={{ color }} data-testid="delivery-status">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {text}
    </p>
  );
}
