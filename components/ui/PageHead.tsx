import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The head of every screen that has a title (D-109): one shape everywhere.
 *
 *   Среда, 23 сентября
 *   Задачи ─∿────────        (○)(○)
 *   one quiet line of context
 *
 * Above the title — an eyebrow: the date on the screens of the day, «‹ Заметки» on a nested
 * screen. After the title runs the trace — the cardiomonitor line of the brand mark
 * (`PulseMark`: the line and the word), one beat, fading out before the round buttons
 * (`HeadButton`: search, «на стену», «+»). Static: nothing moves on a navigation
 * (DESIGN §1.5). Server-safe: the buttons bring their own client code.
 */
export function PageHead({
  title,
  eyebrow,
  back,
  sub,
  actions,
  heading,
  className = "",
}: {
  title?: ReactNode;
  /** the line above the title: a date, a place; `back` wins over it */
  eyebrow?: ReactNode;
  /** a nested screen: the eyebrow becomes the way back */
  back?: { href: string; label: string; testId?: string };
  /** one line of context under the title (a summary, what the screen is for) */
  sub?: ReactNode;
  /** round `HeadButton`s, right of the title */
  actions?: ReactNode;
  /** replaces the <h1> (an editable title renders its own) */
  heading?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-head ${className}`}>
      {back ? (
        <Link href={back.href} className="page-head-eyebrow page-head-back" data-testid={back.testId}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5.5 8.5 12 15 18.5" />
          </svg>
          {back.label}
        </Link>
      ) : eyebrow ? (
        <div className="page-head-eyebrow">
          <span className="min-w-0 truncate first-letter:uppercase">{eyebrow}</span>
        </div>
      ) : null}
      <div className="page-head-row">
        {heading ?? (
          <h1 className="page-head-title">
            {title}
            <HeadTrace />
          </h1>
        )}
        {actions ? <div className="page-head-actions">{actions}</div> : null}
      </div>
      {sub ? <p className="page-head-sub">{sub}</p> : null}
    </header>
  );
}

/**
 * One beat of the cardiomonitor on a line that fades out, glued to the last word of the
 * title (a wrapped title carries it on its last line). It takes no room in the line —
 * `margin-right` cancels its width — so it never pushes a word over; the title box clips
 * it before the buttons. A custom `heading` puts it after its own text.
 */
export function HeadTrace() {
  return (
    <span aria-hidden className="page-head-trace">
      <span className="page-head-trace-lead" />
      <svg width="28" height="18" viewBox="0 0 28 18" className="shrink-0">
        <polyline points="0,9 6,9 9.5,2 14,16 17.5,6 20.5,9 28,9" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="page-head-trace-tail" />
    </span>
  );
}
