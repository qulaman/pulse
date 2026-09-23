"use client";

import { useState, useSyncExternalStore } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { useAssignNote } from "@/lib/notes/assign";
import { firstLine } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import { useDeliveryWindow } from "@/lib/points/queries";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

const noop = () => () => {};

/**
 * «Кому поручить?» over a note or a board's point (D-108): the people sheet, and a tap on a
 * name sends the task from here. After hours it says when the person will get it, and
 * «отправить сразу» sends it now anyway — the same promise and the same way out as the
 * send bar of /confirm (D-38).
 */
export function AssignSheet({ note, onClose, me }: { note: Note | null; onClose: () => void; me: { userId: string } | undefined }) {
  const assign = useAssignNote(me);
  const window = useDeliveryWindow().data;
  // read after hydration: the server renders «within the window» so both passes match
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const quiet = hydrated && !isWithinDeliveryWindow(new Date(), window);
  const opensAt = window?.from ?? `0${WINDOW_OPEN_HOUR}:00`;
  const [now, setNow] = useState(false);

  const close = () => {
    setNow(false);
    onClose();
  };

  return (
    <PeoplePicker
      open={note !== null}
      onClose={close}
      title="Кому поручить?"
      subject={note ? firstLine(note.text) : null}
      // a thought is handed to someone else: the author is not on the list
      hideIds={me ? [me.userId] : undefined}
      footer={
        quiet ? (
          <button
            type="button"
            onClick={() => setNow((was) => !was)}
            aria-pressed={now}
            data-testid="assign-now"
            className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[14px] border border-border/70 px-3 text-left text-[13px] leading-4 text-muted"
          >
            <span>{now ? "Уйдёт сразу, несмотря на тихие часы" : `Тихие часы — человек получит утром в ${opensAt}`}</span>
            <span className="shrink-0 font-semibold" style={{ color: "var(--accent)" }}>
              {now ? "утром" : "сразу"}
            </span>
          </button>
        ) : null
      }
      onPick={(person) => {
        if (note) assign.mutate({ note, person, forceNow: now });
      }}
    />
  );
}
