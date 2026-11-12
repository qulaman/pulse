"use client";

import { useImperativeHandle, useState, useSyncExternalStore, type Ref } from "react";

import { ConfirmList } from "@/components/confirm/ConfirmList";
import { useCardFlight } from "@/components/confirm/useCardFlight";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { useDeliveryWindow, usePointsEnabled } from "@/lib/points/queries";
import { isSendable, useIngestStore } from "@/lib/store/ingest";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

/** What the face can ask of the cards under it; `true` — the batch is on its way. */
export type ConfirmHandle = { throwBatch: () => boolean };

/**
 * The only button under the cards is «Отменить»; sending is a tap on the face (D-60), and nothing
 * said so — a new director stood there (D-142). Until he has sent this many batches, a line under
 * the cards says it, as the lever's own hint does for the hold.
 */
const SEND_HINT_SENDS = 5;
const SEND_HINT_KEY = "pulse.sendHint.v1";
const sendListeners = new Set<() => void>();
function readSends(): number {
  try {
    return Number(window.localStorage.getItem(SEND_HINT_KEY) ?? "0") || 0;
  } catch {
    return SEND_HINT_SENDS;
  }
}
function bumpSends(): void {
  try {
    window.localStorage.setItem(SEND_HINT_KEY, String(readSends() + 1));
  } catch {
    // no storage: the hint simply stays
  }
  for (const listener of sendListeners) listener();
}
function useSendHint(): boolean {
  const sends = useSyncExternalStore(
    (onChange) => {
      sendListeners.add(onChange);
      return () => sendListeners.delete(onChange);
    },
    readSends,
    // the server (and the first paint) without the line, as the lever's hint
    () => SEND_HINT_SENDS,
  );
  return sends < SEND_HINT_SENDS;
}

/**
 * The confirmation where the phrase was spoken (D-60, sixth refinement): the cards the
 * parser made appear under the same face that listened to them, and a tap on that face
 * throws the batch. No page of its own, no second mascot — the scene simply continues.
 *
 * The face knows nothing about what is sendable, so the decision lives here: throw what
 * is ready, or open the first «кому?» when nothing is.
 */
export function ConfirmInline({ ref }: { ref?: Ref<ConfirmHandle> }) {
  const entities = useIngestStore((state) => state.entities);
  const reset = useIngestStore((state) => state.reset);
  const { sendBatch, sendable, sending } = useSendBatch();
  const [assigneeIndex, setAssigneeIndex] = useState<number | null>(null);
  const firstBlocked = entities.findIndex((entity) => entity.blocked === "assignee_unmatched");
  const pointsEnabled = usePointsEnabled().data === true;
  const { root, fly } = useCardFlight(sending);

  /** The batch goes now: what can be sent flies up off the screen (D-166) — the send does not wait for it. */
  const send = (now: boolean) => {
    bumpSends();
    void sendBatch(now);
    fly(entities.map((entity) => isSendable(entity, pointsEnabled)));
  };

  useImperativeHandle(
    ref,
    () => ({
      throwBatch: () => {
        if (sending) return false;
        if (sendable > 0) {
          send(false);
          return true;
        }
        if (firstBlocked >= 0) setAssigneeIndex(firstBlocked);
        return false;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` reads the latest render's cards
    [firstBlocked, sendBatch, sendable, sending, entities, pointsEnabled],
  );

  // Read after hydration: the server renders «within the window» so both passes match.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const window = useDeliveryWindow().data;
  const quiet = hydrated && !isWithinDeliveryWindow(new Date(), window);
  const opensAt = window?.from ?? `0${WINDOW_OPEN_HOUR}:00`;
  const sendHint = useSendHint();

  return (
    <div ref={root} data-testid="confirm-inline">
      <ConfirmList assigneeIndex={assigneeIndex} onAssigneeIndex={setAssigneeIndex} />

      <div className="mt-3 flex flex-col items-center gap-1 pb-1">
        {sendHint && sendable > 0 && !sending ? (
          <p className="flex items-center gap-1.5 text-center text-[13px] leading-4 text-accent" data-testid="send-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
            тап по лицу — отправить
          </p>
        ) : null}
        {quiet && sendable > 0 ? (
          <p className="text-center text-[13px] leading-4 text-muted">
            {`Отправлю утром в ${opensAt} · `}
            <button type="button" className="underline" style={{ color: "var(--accent)" }} onClick={() => send(true)} disabled={sending}>
              отправить сейчас
            </button>
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          disabled={sending}
          className="min-h-[44px] px-3 text-[14px] leading-[44px] text-muted"
          data-testid="confirm-cancel"
        >
          Отменить
        </button>
      </div>
    </div>
  );
}
