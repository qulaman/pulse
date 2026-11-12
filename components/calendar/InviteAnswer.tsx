"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { ParticipantStatus } from "@/lib/calendar/agenda";

/** The reasons of «Не смогу» — the same chips as a task's: short and true. */
export const DECLINE_REASONS = ["Занят срочным", "Буду в отъезде", "Болею"] as const;

type Props = {
  /** My answer so far: the buttons wear it once given («Буду ✓», «Не смогу ✓»). */
  mine: ParticipantStatus | null;
  onAnswer: (status: "going" | "declined", reason?: string) => void;
  disabled?: boolean;
  /** `{testId}-going` / `{testId}-declined` — the sheet and the row of Ленты differ. */
  testId?: string;
  /**
   * The holder takes the answer away once given (the row of Ленты): the reasons stay as they
   * are while it leaves, instead of flipping back to the two buttons on the way out.
   */
  folds?: boolean;
};

/**
 * A participant's answer to a meeting (D-78), drawn once for every place it is given: the
 * sheet and the /calendar card (`EventDetails`) and the row of the «Календарь» panel
 * (D-167). «Буду» is one tap; «Не смогу» asks why first — the reasons as chips, «Без
 * причины» for none, «Назад» to change one's mind.
 */
export function InviteAnswer({ mine, onAnswer, disabled, testId = "event", folds = false }: Props) {
  const [declining, setDeclining] = useState(false);

  const answer = (status: "going" | "declined", reason?: string) => {
    onAnswer(status, reason);
    if (!folds) setDeclining(false);
  };

  if (declining) {
    return (
      <div data-testid={`${testId}-reasons`}>
        <p className="text-[13px] leading-4 text-muted">Почему не получится?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DECLINE_REASONS.map((reason) => (
            <Chip key={reason} tone="neutral" onClick={() => answer("declined", reason)}>
              {reason}
            </Chip>
          ))}
          <Chip tone="muted" onClick={() => answer("declined")}>
            Без причины
          </Chip>
          <Chip tone="muted" onClick={() => setDeclining(false)}>
            Назад
          </Chip>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        // not answered yet: «Буду» is the move, as «Принять» is on a task
        variant={mine === "declined" ? "secondary" : "primary"}
        onClick={() => answer("going")}
        disabled={disabled}
        data-testid={`${testId}-going`}
      >
        {mine === "going" ? "Буду ✓" : "Буду"}
      </Button>
      <Button
        variant={mine === "declined" ? "danger" : "secondary"}
        onClick={() => setDeclining(true)}
        disabled={disabled}
        data-testid={`${testId}-declined`}
      >
        {mine === "declined" ? "Не смогу ✓" : "Не смогу"}
      </Button>
    </div>
  );
}
