"use client";

import { useId } from "react";

/** The limits of `WriteSchema.reason` (lib/ops/contract.ts): the base refuses anything shorter. */
export const REASON_MIN = 5;
export const REASON_MAX = 500;

export function reasonReady(reason: string): boolean {
  const length = reason.trim().length;
  return length >= REASON_MIN && length <= REASON_MAX;
}

/**
 * Why this is being done: every action of the console carries it into the journal (D-157).
 * Takes the dialog's first focus; a field of the action above it marked `data-autofocus` goes first.
 */
export function ReasonField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const short = value.trim().length > 0 && !reasonReady(value);
  return (
    <div className="flex flex-col gap-1.5" data-testid="ops-reason">
      <label htmlFor={id} className="text-[13px] font-medium leading-5 text-muted">
        Причина
      </label>
      <textarea
        id={id}
        data-autofocus
        rows={2}
        value={value}
        maxLength={REASON_MAX}
        readOnly={disabled}
        placeholder="Зачем это нужно, по чьей просьбе"
        onChange={(event) => onChange(event.target.value)}
        className="field w-full px-3 py-2 text-[14px] leading-5"
      />
      <p className="text-[12px] leading-4 text-muted">{short ? `Хотя бы ${REASON_MIN} символов` : "Останется в журнале"}</p>
    </div>
  );
}
