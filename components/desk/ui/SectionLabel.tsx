import type { ReactNode } from "react";

/**
 * The one label of a desk section (D-154): 12/16, 600, capitals, a little tracking, muted, with an
 * optional count and an action on the right — «ЖДУТ ВАШЕГО РЕШЕНИЯ · 7 … Разобрать по одной».
 * Words never break inside: in a narrow block the action goes whole under the label, to the right
 * (D-194 — «Рейтинг недели» once broke in three lines at 1440).
 */
export function SectionLabel({ children, count, action, className = "" }: { children: ReactNode; count?: number; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <h2 className="desk-label whitespace-nowrap text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{children}</h2>
      {count !== undefined && count > 0 ? <span className="nums text-[12px] font-semibold leading-4 text-muted/70">{count}</span> : null}
      {action ? <div className="ml-auto flex items-center gap-2 whitespace-nowrap">{action}</div> : null}
    </div>
  );
}
