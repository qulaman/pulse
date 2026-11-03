import type { ReactNode } from "react";

/**
 * A group of desk settings (D-154 wave 3): a flat working plane — `--surface` 40 % and a hairline,
 * no shadow — its rows split by hairlines. The phone's 58 px rows with icons and chevrons are
 * the phone's; a computer reads a label on the left and its control on the right.
 */
export function SettingGroup({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`overflow-hidden rounded-[12px] border border-border bg-surface/40 [&>*+*]:border-t [&>*+*]:border-border/70 ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * One setting: what it is (14/20) and, under it, what it does (12/16, muted) on the left; its
 * control on the right. `below` — what opens under the row (a form, more choices), full width.
 */
export function SettingRow({
  label,
  hint,
  children,
  below,
  testId,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="px-4 py-3" data-testid={testId}>
      <div className="flex min-h-9 items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5">{label}</div>
          {hint ? <div className="mt-0.5 text-[12px] leading-4 text-muted">{hint}</div> : null}
        </div>
        {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
      </div>
      {below ? <div className="mt-3">{below}</div> : null}
    </div>
  );
}

/** An on/off of the desk: small, the accent when on; Space toggles it as any switch. */
export function Switch({ on, onChange, label, disabled = false }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="desk-focus relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[120ms] disabled:opacity-40"
      style={{ background: on ? "var(--accent)" : "var(--surface-2)", boxShadow: on ? undefined : "inset 0 0 0 1px var(--border)" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform duration-[120ms]"
        style={{ background: on ? "var(--bg)" : "var(--text-muted)", transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}
