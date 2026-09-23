"use client";

import { useImperativeHandle, useState, useSyncExternalStore, type Ref } from "react";

import { ConfirmList } from "@/components/confirm/ConfirmList";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { useDeliveryWindow } from "@/lib/points/queries";
import { useIngestStore } from "@/lib/store/ingest";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

/** What the face can ask of the cards under it; `true` — the batch is on its way. */
export type ConfirmHandle = { throwBatch: () => boolean };

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

  useImperativeHandle(
    ref,
    () => ({
      throwBatch: () => {
        if (sending) return false;
        if (sendable > 0) {
          void sendBatch(false);
          return true;
        }
        if (firstBlocked >= 0) setAssigneeIndex(firstBlocked);
        return false;
      },
    }),
    [firstBlocked, sendBatch, sendable, sending],
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

  return (
    <div data-testid="confirm-inline">
      <ConfirmList assigneeIndex={assigneeIndex} onAssigneeIndex={setAssigneeIndex} />

      <div className="mt-3 flex flex-col items-center gap-1 pb-1">
        {quiet && sendable > 0 ? (
          <p className="text-center text-[13px] leading-4 text-muted">
            {`Отправлю утром в ${opensAt} · `}
            <button type="button" className="underline" style={{ color: "var(--accent)" }} onClick={() => void sendBatch(true)} disabled={sending}>
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
