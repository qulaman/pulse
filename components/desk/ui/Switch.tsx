"use client";

/**
 * The desk's one on/off: a pill with a knob, the accent when on. Space or Enter flips it (a button),
 * a click on a label that names its `id` too. Drawn by `.desk-switch` / `.desk-switch-knob`.
 */
export function Switch({
  id,
  checked,
  onChange,
  label,
  disabled = false,
  testId,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** What it switches — read by a screen reader; the visible words sit beside it. */
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="desk-switch"
    >
      <span className="desk-switch-knob" aria-hidden />
    </button>
  );
}
