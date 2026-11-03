import type { ReactNode } from "react";

/**
 * Nothing here — said as a state, not left as a hole (D-154): a glyph, one line of what, one of
 * what comes next, and maybe a way on. `tone="ok"` — the good kind of empty («Всё разобрано»).
 * Left-aligned on a quiet surface; no dashed frame (dashes are for a place to drop into).
 */
export function EmptyState({ title, hint, action, tone }: { title: string; hint?: ReactNode; action?: ReactNode; tone?: "ok" }) {
  return (
    <div className="flex items-start gap-4 rounded-[14px] border border-border/70 bg-surface/50 px-5 py-6" data-testid="desk-empty">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background: tone === "ok" ? "color-mix(in srgb, var(--ok) 16%, transparent)" : "var(--surface-2)",
          color: tone === "ok" ? "var(--ok)" : "var(--text-muted)",
        }}
      >
        {tone === "ok" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M8.5 12h7" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-semibold leading-[22px]">{title}</p>
        {hint ? <p className="mt-0.5 max-w-xl text-[14px] leading-5 text-muted">{hint}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
