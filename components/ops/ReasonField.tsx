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
 * With `onEnter` plain Enter sends and Shift+Enter breaks the line: most reasons are one line.
 */
export function ReasonField({ value, onChange, disabled = false, onEnter }: { value: string; onChange: (value: string) => void; disabled?: boolean; onEnter?: () => void }) {
  const id = useId();
  const short = value.trim().length > 0 && !reasonReady(value);
  return (
    <div className="flex flex-col gap-1.5" data-testid="ops-reason">
      <label htmlFor={id} className="text-[13px] font-medium leading-5 text-text">
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
        onKeyDown={(event) => {
          if (!onEnter || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onEnter();
        }}
        className="field w-full px-3 py-2 text-[14px] leading-5"
      />
      <p className={`text-[12px] leading-4 ${short ? "text-warn" : "text-muted"}`}>{short ? `Хотя бы ${REASON_MIN} символов` : "Останется в журнале"}</p>
    </div>
  );
}
