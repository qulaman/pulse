/**
 * The phone's on/off as drawn: a 48 × 28 pill, the accent when on, the knob sliding across. Only
 * the picture — the control around it (a row, a button) carries `role="switch"` and the words.
 */
export function SwitchPill({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative block h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
      <span className="absolute left-0 top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]" style={{ transform: on ? "translateX(24px)" : "translateX(4px)" }} />
    </span>
  );
}
