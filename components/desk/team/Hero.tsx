"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { formatNum } from "@/lib/desk/format";

/** One number beside the hero's own: «2 с просрочкой». A zero stays quiet; a fact may filter or lead. */
export type HeroFact = {
  key: string;
  value: number;
  /** Said instead of the number when it is not a count — «4 мин», «—»; quiet while `value` is 0. */
  text?: string;
  label: string;
  /** The tone the number takes while it says something. */
  tone?: Tone | null;
  /** Toggles the screen's filter; `active` — it is on. */
  onClick?: () => void;
  active?: boolean;
  href?: string;
  title?: string;
};

const FACT_BOX = "flex min-w-[88px] flex-col items-start rounded-[10px] px-3 py-1.5 text-left";

function Fact({ fact }: { fact: HeroFact }) {
  const quiet = fact.value === 0;
  const body = (
    <>
      <span
        className={`nums font-display text-[28px] font-bold leading-[32px] tracking-[-0.03em] ${quiet ? "text-muted/50" : ""}`}
        style={!quiet && fact.tone ? { color: TONE_VAR[fact.tone] } : undefined}
      >
        {fact.text ?? formatNum(fact.value)}
      </span>
      <span className="whitespace-nowrap text-[12px] leading-4 text-muted">{fact.label}</span>
    </>
  );
  const interactive = `${FACT_BOX} transition-[background-color,box-shadow] duration-[120ms] hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`;
  if (fact.href) {
    return (
      <Link href={fact.href} className={interactive} title={fact.title} data-testid={`hero-fact-${fact.key}`}>
        {body}
      </Link>
    );
  }
  if (fact.onClick) {
    return (
      <button
        type="button"
        onClick={fact.onClick}
        aria-pressed={fact.active}
        title={fact.title}
        data-testid={`hero-fact-${fact.key}`}
        className={`${interactive} ${fact.active ? "bg-accent/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_55%,transparent)]" : ""}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={FACT_BOX} title={fact.title} data-testid={`hero-fact-${fact.key}`}>
      {body}
    </div>
  );
}

/** The hero's numbers in a row — also a card's own (the person's load). */
export function HeroFacts({ facts, className = "" }: { facts: HeroFact[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {facts.map((fact) => (
        <Fact key={fact.key} fact={fact} />
      ))}
    </div>
  );
}

/**
 * The one hero of a desk screen (D-154): raised over the flat table below it, it says the moment
 * in a glance — the big figure (48/52) in the moment's tone, a line of what it means, the facts
 * next to it (28/32, a zero quiet) that filter the screen or lead to another, and room for the
 * screen's own move (`children`: a bar, the quick requests) or a picture on the right (`aside`).
 */
export function DeskHero({
  value,
  tone,
  title,
  sub,
  facts,
  aside,
  children,
  testId,
}: {
  value?: ReactNode;
  tone?: Tone | null;
  title: ReactNode;
  sub?: ReactNode;
  facts?: HeroFact[];
  aside?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section className="card @container flex flex-col gap-4 px-5 py-4" style={{ boxShadow: "var(--shadow-raised)" }} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          {value !== undefined && value !== null ? (
            <span
              className="nums shrink-0 font-display text-[48px] font-bold leading-[52px] tracking-[-0.04em]"
              style={tone && tone !== "muted" ? { color: TONE_VAR[tone] } : undefined}
              data-testid="hero-value"
            >
              {value}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]" data-testid="hero-title">
              {title}
            </p>
            {sub ? <p className="mt-0.5 text-[13px] leading-[18px] text-muted">{sub}</p> : null}
          </div>
        </div>
        {facts && facts.length > 0 ? <HeroFacts facts={facts} className="border-l border-border/70 pl-4" /> : null}
        {/* on the right while the hero is wide; on a narrower one it takes its own line from the left edge */}
        {aside ? <div className="min-w-0 @min-[1040px]:ml-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The hero while its numbers load: the same height, nothing moves when they land. */
export function HeroBone() {
  return (
    <section className="card flex h-[86px] items-center gap-4 px-5" style={{ boxShadow: "var(--shadow-raised)" }} aria-hidden>
      <span className="skeleton h-[44px] w-[64px] rounded-[10px] bg-surface-2" />
      <span className="flex flex-col gap-2">
        <span className="skeleton h-[16px] w-[180px] rounded-[6px] bg-surface-2" />
        <span className="skeleton h-[12px] w-[120px] rounded-[6px] bg-surface-2" />
      </span>
    </section>
  );
}
