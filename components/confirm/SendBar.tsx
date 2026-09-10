"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

type Props = {
  sendable: number;
  total: number;
  sending: boolean;
  onSend: (forceNow: boolean) => void;
  onReset: () => void;
};

/**
 * "Отправить N из M" (D-36) plus the quiet-hours promise (D-38). The server decides
 * for real; this bar only tells the director what is about to happen.
 */
export function SendBar({ sendable, total, sending, onSend, onReset }: Props) {
  // Read after hydration: the server renders "within the window" so both passes match.
  const quietHours = useSyncExternalStore(
    () => () => {},
    () => !isWithinDeliveryWindow(),
    () => false,
  );

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-lg">
        <Button block disabled={sendable === 0 || sending} onClick={() => onSend(false)}>
          {sending ? "Отправляю…" : `Отправить ${sendable} из ${total}`}
        </Button>

        {sendable === 0 && !sending ? (
          <p className="mt-2 text-center text-[13px] leading-4 text-muted">
            Отправлять нечего ·{" "}
            <button type="button" className="underline" style={{ color: "var(--accent)" }} onClick={onReset}>
              сбросить и вернуться
            </button>
          </p>
        ) : null}

        {quietHours ? (
          <p className="mt-2 text-center text-[13px] leading-4 text-muted">
            {`Отправлю утром в 0${WINDOW_OPEN_HOUR}:00 · `}
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
