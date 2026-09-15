"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { useDeliveryWindow } from "@/lib/points/queries";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

type Props = {
  sendable: number;
  total: number;
  sending: boolean;
  onSend: (forceNow: boolean) => void;
  onReset: () => void;
  /** Every task is blocked on «кому?»: the main button opens the first one. */
  onFixFirst?: () => void;
};

/**
 * "Отправить N из M" (D-36) plus the quiet-hours promise (D-38). The server decides
 * for real; this bar only tells the director what is about to happen.
 */
export function SendBar({ sendable, total, sending, onSend, onReset, onFixFirst }: Props) {
  // Read after hydration: the server renders "within the window" so both passes match.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const window = useDeliveryWindow().data;
  const quietHours = hydrated && !isWithinDeliveryWindow(new Date(), window);
  const opensAt = window?.from ?? `0${WINDOW_OPEN_HOUR}:00`;

  return (
    <div
      className="sticky z-20 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
      // sticks above the tab bar (56px + safe area), not under it — the bar is fixed and covered the hint line
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom))", paddingBottom: 12 }}
    >
      <div className="mx-auto max-w-lg">
        {/* the main button always does something: send, point at the first «кому?», or close */}
        {sendable > 0 || sending ? (
          <Button block disabled={sending} onClick={() => onSend(false)}>
            {sending ? "Отправляю…" : `Отправить ${sendable} из ${total}`}
          </Button>
        ) : total > 0 && onFixFirst ? (
          <Button block onClick={onFixFirst}>
            Указать, кому
          </Button>
        ) : (
          <Button block variant="secondary" onClick={onReset}>
            Закрыть
          </Button>
        )}

        {sendable === 0 && !sending && total > 0 ? (
          <p className="mt-2 text-center text-[13px] leading-4 text-muted">
            У {total === 1 ? "задачи" : "задач"} нет исполнителя ·{" "}
            <button type="button" className="underline" style={{ color: "var(--accent)" }} onClick={onReset}>
              сбросить и вернуться
            </button>
          </p>
        ) : null}

        {quietHours ? (
          <p className="mt-2 text-center text-[13px] leading-4 text-muted">
            {`Отправлю утром в ${opensAt} · `}
            <button
              type="button"
              className="underline"
              style={{ color: "var(--accent)" }}
              onClick={() => onSend(true)}
              disabled={sendable === 0 || sending}
            >
              отправить сейчас
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
