"use client";

import { heldKeys, heldLine, type HeldRow } from "@/lib/tasks/held";
import { receiptText, type ReceiptTone } from "@/lib/tasks/desk";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["notification_deliveries"]["Row"];

type TaskDelivery = { receipt: Delivery | null; held: HeldRow[] };

/**
 * The newest «task_sent» delivery of a task and what the task still holds for the morning
 * to its assignee (D-129), live; idle while no task is given. One query, one channel.
 */
export function useTaskDelivery(taskId: string | null, assigneeId: string | null = null) {
  return useRealtimeQuery<TaskDelivery, Delivery>({
    queryKey: [...heldKeys.task(taskId ?? ""), assigneeId ?? ""],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const [receipt, held] = await Promise.all([
        supabase
          .from("notification_deliveries")
          .select("*")
          .eq("task_id", taskId as string)
          .eq("event_kind", "task_sent")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        assigneeId
          ? supabase
              .from("notification_deliveries")
              .select("event_kind, deliver_after, created_at")
              .eq("task_id", taskId as string)
              .eq("user_id", assigneeId)
              .eq("status", "queued")
              .gt("deliver_after", new Date().toISOString())
          : Promise.resolve({ data: [] as HeldRow[], error: null }),
      ]);
      if (receipt.error) throw new Error(receipt.error.message);
      if (held.error) throw new Error(held.error.message);
      return { receipt: receipt.data, held: (held.data ?? []) as HeldRow[] };
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
 *
 * At night the line says what waits for the morning instead — «отправлю завтра 08:00» —
 * with «отправить сейчас» next to it when the screen passes `onSendNow` (D-129).
 */
export function DeliveryStatus({
  taskId,
  status,
  assigneeId = null,
  onSendNow,
}: {
  taskId: string;
  status: string;
  assigneeId?: string | null;
  onSendNow?: () => void;
}) {
  const delivery = useTaskDelivery(taskId, onSendNow ? assigneeId : null);
  const d = delivery.data;
  const waiting = d && onSendNow ? heldLine(d.held) : null;

  if (waiting) {
    const color = RECEIPT_COLOR.muted;
    return (
      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-4" style={{ color }} data-testid="delivery-held">
        {/* the line may wrap on a narrow phone: the dot stays with its first row */}
        <span aria-hidden className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span>
          {`${waiting} · `}
          <button type="button" className="underline underline-offset-2" style={{ color: "var(--accent)" }} onClick={onSendNow} data-testid="send-now">
            отправить сейчас
          </button>
        </span>
      </p>
    );
  }

  // the line's height is reserved before the receipt arrives — cards never grow under the thumb
  if (!d?.receipt) return <p className="mt-2 h-4" aria-hidden />;

  const { text, tone } = receiptText(d.receipt, status);
  const color = RECEIPT_COLOR[tone];

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-4" style={{ color }} data-testid="delivery-status">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {text}
    </p>
  );
}
