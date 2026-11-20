"use client";

import { heldLine } from "@/lib/tasks/held";
import { receiptText, type ReceiptTone } from "@/lib/tasks/reasons";
import { useTaskDelivery } from "@/lib/tasks/receipts";

/** @deprecated import `useTaskDelivery` from "@/lib/tasks/receipts" — the query lives there. */
export { useTaskDelivery } from "@/lib/tasks/receipts";

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
