"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

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

/**
 * A section of a person's page (D-174): its title with a count and its moves on the right, the
 * body under them on a tile — the language of the dashboard's tiles (person-stats.css). `bare` —
 * the body is a card of its own already (a table, the dashboard).
 */
export function CardSection({
  id,
  title,
  count,
  end,
  bare = false,
  children,
  testId,
}: {
  id?: string;
  title: ReactNode;
  count?: number;
  end?: ReactNode;
  bare?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section id={id} className="person-section" data-testid={testId}>
      <header className="person-section-head">
        <h2 className="person-section-title">{title}</h2>
        {count !== undefined && count > 0 ? <span className="nums person-section-count">{count}</span> : null}
        {end ? <div className="person-section-end">{end}</div> : null}
      </header>
      {bare ? children : <div className="person-section-body">{children}</div>}
    </section>
  );
}

export type PageSectionLink = { id: string; label: string; count?: number };

/** The section that sits under the top of the window now: the last whose top has passed 140 px below it. */
function useSectionSpy(ids: readonly string[]): string | null {
  const key = ids.join("|");
  const [current, setCurrent] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    const scroller = document.getElementById("desk-main");
    if (!scroller || list.length === 0) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + 140;
      let found = list[0];
      for (const id of list) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= line) found = id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) found = list[list.length - 1];
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);
  return current;
}

const TAB_GLIDE = { type: "spring", stiffness: 560, damping: 44, mass: 0.8 } as const;

/**
 * A long page's sections as tabs that stay at the top (D-174): a click brings the section up, the
 * plate glides to the one being read as the page scrolls. Every section stays on the page — the
 * tabs only lead.
 */
export function SectionTabs({ sections, label }: { sections: PageSectionLink[]; label: string }) {
  const current = useSectionSpy(sections.map((section) => section.id));
  return (
    <nav className="section-tabs" aria-label={label} data-testid="section-tabs">
      {sections.map((section) => {
        const on = section.id === current;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="section-tab"
            aria-current={on ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById(section.id)?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
            }}
          >
            {on ? <motion.span layoutId="section-tab-plate" className="section-tab-plate" transition={TAB_GLIDE} aria-hidden /> : null}
            <span className="relative inline-flex items-center gap-1.5">
              {section.label}
              {section.count ? <span className="nums section-tab-count">{section.count}</span> : null}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
