"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { BUTTON, DECLINE_REASONS, TEXT } from "@/lib/tasks/status-text";

const FIELD_CLASS =
  "w-full rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";

type BaseProps = { open: boolean; onClose: () => void };

/* -------------------------------------------------------------------------- */
/* «Уточнить» — a message with meta.is_question, never a status (D-03)         */
/* -------------------------------------------------------------------------- */

export function AskSheet({ open, onClose, onSubmit }: BaseProps & { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSubmit(value);
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={BUTTON.ask}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        autoFocus
        placeholder={TEXT.askPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block onClick={submit} disabled={!text.trim()}>
          {BUTTON.send}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Не могу» — chips first: nobody types on a site in the cold                 */
/* -------------------------------------------------------------------------- */

export function DeclineSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (reason: string) => void }) {
  const [chip, setChip] = useState<string | null>(null);
  const [laterDate, setLaterDate] = useState("");
  const [text, setText] = useState("");

  const needsDate = chip === "Буду позже";

  const reset = () => {
    setChip(null);
    setLaterDate("");
    setText("");
  };

  const submit = () => {
    if (!chip) return;
    const head = needsDate && laterDate ? `${chip}: ${laterDate}` : chip;
    const tail = text.trim();
    onSubmit(tail ? `${head}. ${tail}` : head);
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.declineTitle}>
      <div className="flex flex-wrap gap-2">
        {DECLINE_REASONS.map((reason) => (
          <Chip
            key={reason}
            tone={chip === reason ? "accent" : "neutral"}
            onClick={() => setChip(reason)}
          >
            {reason}
          </Chip>
        ))}
      </div>

      {needsDate ? (
        <input
          type="date"
          className={`${FIELD_CLASS} mt-3`}
          value={laterDate}
          onChange={(event) => setLaterDate(event.target.value)}
        />
      ) : null}

      <textarea
        className={`${FIELD_CLASS} mt-3`}
        rows={2}
        placeholder={TEXT.declinePlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="mt-3">
        <Button block variant="danger" onClick={submit} disabled={!chip}>
          {BUTTON.cant}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Выполнено» — the report; text is optional in this order, photo/voice next  */
/* -------------------------------------------------------------------------- */

export function ReportSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    onSubmit(text.trim());
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.reportTitle}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        autoFocus
        placeholder={TEXT.reportPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block onClick={submit}>
          {BUTTON.complete}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Доработка» — the director's comment is mandatory                          */
/* -------------------------------------------------------------------------- */

export function ReworkSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (comment: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSubmit(value);
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.reworkTitle}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        autoFocus
        placeholder={TEXT.reworkPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block variant="secondary" onClick={submit} disabled={!text.trim()}>
          {BUTTON.rework}
        </Button>
      </div>
    </Sheet>
  );
}
