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

const FACT_BOX = "flex min-w-[72px] flex-col items-start px-3 py-0.5 text-left";

function Fact({ fact }: { fact: HeroFact }) {
  const quiet = fact.value === 0;
  const body = (
    <>
      <span
        className={`nums desk-figure text-[22px] leading-[26px] ${quiet ? "text-muted/50" : ""}`}
        style={!quiet && fact.tone ? { color: TONE_VAR[fact.tone] } : undefined}
      >
        {fact.text ?? formatNum(fact.value)}
      </span>
      <span className="whitespace-nowrap text-[12px] leading-4 text-muted">{fact.label}</span>
    </>
  );
  const interactive = `${FACT_BOX} hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`;
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
        className={`${interactive} ${fact.active ? "shadow-[inset_0_-2px_0_var(--accent)]" : ""}`}
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
    <div className={`flex flex-wrap items-center divide-x divide-border [&>*:first-child]:pl-0 ${className}`}>
      {facts.map((fact) => (
        <Fact key={fact.key} fact={fact} />
      ))}
    </div>
  );
}

/**
 * The total of a desk screen, one line of the sheet (D-158): the figure in the moment's ink, a line
 * of what it means, the facts next to it (a zero quiet) that filter the screen or lead to another,
 * and room for the screen's own move (`children`) or a picture on the right (`aside`).
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
    <section className="desk-total @container flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          {value !== undefined && value !== null ? (
            <span
              className="nums desk-figure shrink-0 text-[44px] leading-[44px]"
              style={tone && tone !== "muted" ? { color: TONE_VAR[tone] } : undefined}
              data-testid="hero-value"
            >
              {value}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-[22px]" data-testid="hero-title">
              {title}
            </p>
            {sub ? <p className="text-[13px] leading-[18px] text-muted">{sub}</p> : null}
          </div>
        </div>
        {facts && facts.length > 0 ? <HeroFacts facts={facts} className="border-l border-border pl-3" /> : null}
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
    <section className="desk-total flex h-[48px] items-center gap-3.5" aria-hidden>
      <span className="skeleton h-[40px] w-[52px] rounded-[2px] bg-surface-2" />
      <span className="flex flex-col gap-2">
        <span className="skeleton h-[16px] w-[180px] rounded-[2px] bg-surface-2" />
        <span className="skeleton h-[12px] w-[120px] rounded-[2px] bg-surface-2" />
      </span>
    </section>
  );
}
