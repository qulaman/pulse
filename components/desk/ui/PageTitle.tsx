import type { ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";

/**
 * The head of a desk screen: the title, an optional state line in its tone with a dot (the
 * phone's `PageHead` says the same with the light of the sky), actions on the right. No back
 * button — the side navigation is always there.
 */
export function PageTitle({ title, state, actions }: { title: string; state?: { text: string; tone?: Tone } | null; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-[24px] font-bold leading-[30px] tracking-[-0.02em]">{title}</h1>
        {state ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-medium leading-5" style={{ color: state.tone ? TONE_VAR[state.tone] : "var(--text-muted)" }}>
            {state.tone ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[state.tone] }} /> : null}
            {state.text}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The desk screen's frame: the gutter and the width a screen asks for. */
export function DeskPage({ children, width = "wide" }: { children: ReactNode; width?: "wide" | "narrow" | "full" }) {
  const max = width === "full" ? "" : width === "narrow" ? "max-w-[760px]" : "max-w-[1280px]";
  return <div className={`mx-auto flex w-full flex-col gap-4 px-6 pb-10 pt-5 ${max}`}>{children}</div>;
}
