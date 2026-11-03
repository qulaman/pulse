import type { ReactNode } from "react";

/** A key cap in a hint: «Esc», «A», «⌘K». */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-1.5 font-display text-[11px] font-semibold leading-none text-muted">
      {children}
    </kbd>
  );
}
