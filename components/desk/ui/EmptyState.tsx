import type { ReactNode } from "react";

import { MiniMark } from "@/components/brand/MiniMark";

/**
 * Nothing here — said as a state, not left as a hole (D-154): the mascot's small self (D-209), one
 * line of what, one of what comes next, and maybe a way on. `tone="ok"` — the good kind of empty
 * («Всё разобрано»): the mark pops once, in green. `busy` — not empty yet, the data is on its way:
 * the mark is at work. Left-aligned on a quiet surface; no dashed frame (dashes are for a place to
 * drop into).
 */
export function EmptyState({ title, hint, action, tone, busy = false }: { title: string; hint?: ReactNode; action?: ReactNode; tone?: "ok"; busy?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-border/70 bg-surface/50 px-5 py-6" data-testid="desk-empty">
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: tone === "ok" ? "var(--ok)" : busy ? "var(--accent)" : "var(--text-muted)" }}>
        <MiniMark state={busy ? "busy" : tone === "ok" ? "done" : "still"} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-semibold leading-6" data-strong>
          {title}
        </p>
        {hint ? <p className="max-w-xl text-[13px] leading-5 text-muted">{hint}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
