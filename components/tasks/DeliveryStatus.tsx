"use client";

import { humanAqtobe } from "@/lib/ai/time";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["notification_deliveries"]["Row"];

function useTaskDelivery(taskId: string) {
  return useRealtimeQuery<Delivery | null, Delivery>({
    queryKey: ["deliveries", taskId],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select("*")
        .eq("task_id", taskId)
        .eq("event_kind", "task_sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    channel: { table: "notification_deliveries", filter: `task_id=eq.${taskId}` },
  });
}

/**
 * «отправлено / увидел / принял» on the director's card (D-32, принцип 8).
 * Wording is honest: a push has no delivery receipt, so the middle state says
 * «не открывал с HH:MM», never «не получил».
 */
export function DeliveryStatus({ taskId, status }: { taskId: string; status: string }) {
  const delivery = useTaskDelivery(taskId);
  const d = delivery.data;
  if (!d) return null;

  let text: string;
  let tone = "var(--text-muted)";
  if (d.acted_at || status === "accepted" || status === "pending_review" || status === "done") {
    text = `принял ${d.acted_at ? humanAqtobe(new Date(d.acted_at)) : ""}`.trim();
    tone = "var(--ok)";
  } else if (d.seen_at) {
    text = `увидел ${humanAqtobe(new Date(d.seen_at))}`;
  } else if (d.status === "sent") {
    text = `отправлено ${humanAqtobe(new Date(d.sent_at ?? d.created_at))} · не открывал`;
    tone = "var(--warn)";
  } else if (d.status === "failed") {
    text = d.last_error === "no_subscription" ? "уведомления не включены у сотрудника" : "уведомление не ушло";
    tone = "var(--warn)";
  } else {
    text = "отправляю уведомление…";
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-4" style={{ color: tone }} data-testid="delivery-status">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      {text}
    </p>
  );
}
