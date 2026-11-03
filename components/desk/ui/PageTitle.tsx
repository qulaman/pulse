import type { ReactNode } from "react";

import { DeskLight } from "@/components/desk/ui/Light";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";

/**
 * The head of a desk screen: the title (28/34), an optional state line in its tone with a dot,
 * actions on the right. `light` — the screen has a state worth a light (D-154): its tone glows
 * quietly at the top of the screen, as the phone's sky does louder. No back button — the side
 * navigation is always there.
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      {light !== undefined ? <DeskLight tone={light} /> : null}
      <div className="min-w-0">
        <h1 className="truncate font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em]">{title}</h1>
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
 * The desk screen's frame: the gutter and one of two widths, always from the same left edge as
 * the order line above it (D-154) — a screen never jumps sideways between sections.
 */
export function DeskPage({ children, width = "wide" }: { children: ReactNode; width?: "wide" | "narrow" | "full" }) {
  const max = width === "full" ? "" : width === "narrow" ? "max-w-[808px]" : "max-w-[1328px]";
  return <div className={`flex w-full flex-col gap-5 px-6 pb-12 pt-6 ${max}`}>{children}</div>;
}
