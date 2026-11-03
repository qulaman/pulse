"use client";

import Link from "next/link";

import { Num } from "@/components/desk/ui/Num";
import { TONE_VAR } from "@/components/desk/ui/tone";
import type { Segment, StatusScreen } from "@/lib/tasks/overview";

/** A second number of the moment, as words that filter: «В работе 5». `active` — its filter is on. */
export type MomentCounter = { key: string; label: string; value: number; active?: boolean; onClick?: () => void; href?: string };

/**
 * «Момент» (D-154) — the one hero of «Сегодня» and «Задачи»: what the moment is about as one big
 * number in its tone and a sentence (the phone's status screen, `directorScreen`), the open work
 * as one stacked bar of its stages with a legend, the second numbers as words that filter, and
 * the main button of the screen — «Разобрать по одной», there only while something waits.
 * Raised over the flat table; every row keeps its height whatever the numbers are.
 */
export function MomentBar({
  screen,
  eyebrow,
  detail,
  counters,
  queue,
  enterKey = false,
}: {
  screen: StatusScreen;
  /** replaces the screen's own upper line — a person picked names the moment */
  eyebrow?: string;
  /** replaces the quiet line — the desk's own words for what the phone says */
  detail?: string;
  counters: readonly MomentCounter[];
  /** what waits in «Разобрать»: the main button stands while it is more than nothing */
  queue: number;
  /** Enter on this screen goes to «Разобрать»: the button says so */
  enterKey?: boolean;
}) {
  const tone = TONE_VAR[screen.tone];
  const total = screen.segments.reduce((sum, segment) => sum + segment.count, 0);
  // nothing open: the legend tells what got done instead of standing empty
  const legend: Segment[] =
    total > 0
      ? screen.segments
      : [
          { key: "today", label: "закрыто сегодня", count: screen.closedToday, tone: "ok" },
          { key: "week", label: "за 7 дней", count: screen.closedWeek, tone: "muted" },
        ];
  const line = detail ?? screen.detail;

  return (
    <section data-testid="desk-moment" data-tone={screen.tone} className="card relative px-6 pb-4 pt-[18px]" style={{ boxShadow: "var(--shadow-card), var(--shadow-raised)" }}>
      <div className="flex items-center gap-5">
        {screen.value !== null ? (
          <span className="nums min-w-[52px] shrink-0 font-display text-[48px] font-bold leading-[52px] tracking-[-0.04em]" style={{ color: tone }} data-testid="desk-moment-value">
            {screen.value}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color: tone }}>
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
            <span className="truncate">{eyebrow ?? screen.eyebrow}</span>
          </p>
          <p className="mt-0.5 truncate font-display text-[20px] font-semibold leading-6 tracking-[-0.015em]" data-testid="desk-moment-label">
            {screen.label}
          </p>
          <p className="truncate text-[14px] leading-[18px] text-muted" title={line}>
            {line || " "}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {counters.length > 0 ? (
            <div className="flex items-center gap-1" data-testid="desk-moment-counters">
              {counters.map((counter, index) => (
                <span key={counter.key} className="flex items-center gap-1">
                  {index > 0 ? (
                    <span aria-hidden className="text-muted/40">
                      ·
                    </span>
                  ) : null}
                  <Counter counter={counter} />
                </span>
              ))}
            </div>
          ) : null}
          {queue > 0 ? (
            <Link
              href="/desk/inbox"
              prefetch
              data-testid="desk-inbox-entry"
              className="btn-primary inline-flex h-9 items-center gap-2 rounded-[11px] px-4 font-display text-[14px] font-semibold leading-4 text-bg transition-transform duration-[120ms] active:scale-[0.98]"
            >
              Разобрать по одной
              {enterKey ? (
                <span aria-hidden className="rounded-[5px] bg-black/15 px-1.5 text-[12px] leading-[18px]">
                  ⏎
                </span>
              ) : (
                <span aria-hidden>→</span>
              )}
            </Link>
          ) : null}
        </div>
      </div>

      {/* the bar: one segment per stage that exists, loudest first; an empty track when nothing is open */}
      <div
        className="mt-3.5 flex h-2 gap-[3px] overflow-hidden rounded-full"
        style={{ background: total ? undefined : `color-mix(in srgb, ${tone} 22%, var(--surface-2))` }}
        data-testid="desk-moment-bar"
      >
        {screen.segments.map((segment, index) => (
          <span
            key={segment.key}
            className="h-full transition-[flex-grow] duration-[600ms] ease-out"
            style={{
              flexGrow: segment.count,
              flexBasis: 0,
              minWidth: 6,
              background: TONE_VAR[segment.tone],
              opacity: segment.tone === "muted" ? 0.55 : 1,
              borderRadius: index === 0 || index === screen.segments.length - 1 ? 999 : 2,
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex min-h-[18px] flex-wrap gap-x-4 gap-y-1">
        {legend.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px]">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_VAR[segment.tone], opacity: segment.tone === "muted" ? 0.55 : 1 }} />
            <Num value={segment.count} className={segment.count ? "font-semibold text-text" : "font-semibold"} />
            <span className="text-muted">{segment.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Counter({ counter }: { counter: MomentCounter }) {
  const body = (
    <>
      <span className={counter.active ? "text-accent" : "text-muted"}>{counter.label}</span>
      <Num value={counter.value} className={`font-semibold ${counter.active ? "!text-accent" : counter.value ? "text-text" : ""}`} />
    </>
  );
  const className = `inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[13px] leading-4 transition-colors duration-[120ms] ${
    counter.active ? "bg-accent/10" : "hover:bg-surface-2/70"
  }`;
  if (counter.href) {
    return (
      <Link href={counter.href} prefetch className={className} data-testid={`moment-${counter.key}`}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={counter.onClick} aria-pressed={counter.active} className={className} data-testid={`moment-${counter.key}`}>
      {body}
    </button>
  );
}
