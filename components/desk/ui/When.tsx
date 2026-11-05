import type { ReactNode } from "react";

/**
 * A date or a time on the sheet (D-158): the mono voice; an overdue one is written in the red
 * pencil and underlined by its stroke (journal.css).
 */
export function When({ overdue = false, className = "", children }: { overdue?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={`nums desk-when ${className}`} data-overdue={overdue ? "" : undefined}>
      {children}
    </span>
  );
}
