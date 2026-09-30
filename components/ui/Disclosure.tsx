"use client";

import { useRef, type ReactNode } from "react";

import { useGlidingState } from "@/components/ui/motion";

type Props = {
  title: string;
  /** What the section says while closed — the current value, not a description. */
  summary?: ReactNode;
  /** Why the setting exists; shown only once the section is open. */
  hint?: string;
  icon?: ReactNode;
  /** A dot on the header: this section holds edits that are not saved yet. */
  dirty?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * A settings section that starts closed and says its current value in one line, so the
 * screen is a list to scan instead of a wall of fields. Opening it is one tap; motion is
 * the chevron's rotation, the body's fade and the sections below gliding to their new place
 * instead of jumping by the body's height (DESIGN §2 — transform and opacity only, a height
 * animation is neither).
 */
export function Disclosure({ title, summary, hint, icon, dirty, defaultOpen = false, children }: Props) {
  const section = useRef<HTMLElement>(null);
  const [open, setOpen] = useGlidingState(defaultOpen, section);

  return (
    <section ref={section} className="card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] active:bg-surface-2"
      >
        {icon ? (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">{title}</span>
            {dirty ? (
              <span
                aria-label="есть несохранённое"
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            ) : null}
          </span>
          {summary ? <span className="mt-0.5 block truncate text-[13px] leading-4 text-muted">{summary}</span> : null}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          className="shrink-0 text-muted transition-transform duration-[120ms] ease-out"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <polyline
            points="6,3.5 10.5,8 6,12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="card-in border-t border-border/70 px-4 pb-4 pt-3">
          {hint ? <p className="mb-3 text-[13px] leading-[18px] text-muted">{hint}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
