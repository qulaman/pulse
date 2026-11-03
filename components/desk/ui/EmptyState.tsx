import type { ReactNode } from "react";

/** Nothing here yet: one line of what, one of why or what comes, and maybe a way on. */
export function EmptyState({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border px-6 py-14 text-center" data-testid="desk-empty">
      <p className="font-display text-[16px] font-semibold leading-[22px]">{title}</p>
      {hint ? <p className="max-w-md text-[14px] leading-5 text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
