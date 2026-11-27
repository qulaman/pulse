import type { ReactNode } from "react";

import { DeskLight } from "@/components/desk/ui/Light";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";

/**
 * The head of a desk screen: the title, an optional state line in its tone, actions on the right.
 * No back button — the side navigation is always there. `light` is the developers' console's:
 * the desk's sheet draws no light (D-158).
 */
export function PageTitle({
  title,
  state,
  actions,
  light,
}: {
  title: string;
  state?: { text: string; tone?: Tone } | null;
  actions?: ReactNode;
  light?: Tone | null;
}) {
  return (
    <div className="desk-page-title flex flex-wrap items-end justify-between gap-3">
      {light !== undefined ? <DeskLight tone={light} /> : null}
      <div className="min-w-0">
        <h1 className="truncate font-display text-[24px] font-semibold leading-8 tracking-[-0.02em]">{title}</h1>
        {state ? (
          <p className="mt-1 flex items-center gap-1.5 text-[14px] font-medium leading-5" style={{ color: state.tone ? TONE_VAR[state.tone] : "var(--text-muted)" }}>
            {state.tone ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[state.tone] }} /> : null}
            {state.text}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The desk screen's frame (D-214): one gutter and one of three measures, always from the same left
 * edge as the order line above it (D-154) — a screen never jumps sideways between sections.
 * `wide` — a screen that is read: 1200 px of content, however wide the monitor; `full` — a table, a
 * grid of tiles, a calendar: the whole width; `narrow` — a form. The measures are in graphite.css.
 */
export function DeskPage({ children, width = "wide" }: { children: ReactNode; width?: "wide" | "narrow" | "full" }) {
  return (
    <div className={`desk-page flex w-full flex-col gap-5 px-6 pb-12 pt-6 ${width === "narrow" ? "desk-page-narrow max-w-[808px]" : ""}`} data-width={width}>
      {children}
    </div>
  );
}
