"use client";

import Link from "next/link";

import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Num } from "@/components/desk/ui/Num";
import { TONE_VAR } from "@/components/desk/ui/tone";
import type { StatusScreen } from "@/lib/tasks/overview";

/** A second number of the moment, as words that filter: «В работе 5». `active` — its filter is on. */
export type MomentCounter = { key: string; label: string; value: number; active?: boolean; onClick?: () => void; href?: string };

/**
 * «Момент» — the total above «Сегодня» and «Задачи», one line of the sheet (D-158): the figure in
 * the ink of the moment and its sentence, the second numbers as words that filter, the screen's
 * main button while something waits. The work starts right under it. On a narrow list (the panel
 * took the room) it wraps by its own width: the figure, the sentence and the button first, the
 * counters on the next line. The screen has one filled button: with a panel open it is the panel's
 * closing move, and this one steps back to a word in the pen.
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
  /** a person picked names the moment */
  eyebrow?: string;
  /** replaces the quiet line — the desk's own words for what the phone says */
  detail?: string;
  counters: readonly MomentCounter[];
  /** what waits in «Разобрать»: the main button stands while it is more than nothing */
  queue: number;
  /** Enter on this screen goes to «Разобрать»: the button says so */
  enterKey?: boolean;
}) {
  const panel = useDeskPanel();
  const tone = TONE_VAR[screen.tone];
  const open = screen.segments.some((segment) => segment.count > 0);
  // nothing open: the line tells what got done instead of standing empty
  const line = detail ?? (screen.detail || (open ? "" : `закрыто сегодня ${screen.closedToday} · за 7 дней ${screen.closedWeek}`));

  return (
    <div className="@container">
      <section data-testid="desk-moment" data-tone={screen.tone} className="desk-total flex items-center gap-x-4 gap-y-1.5 @max-[760px]:flex-wrap">
        {screen.value !== null ? (
          <span className="nums desk-figure shrink-0 text-[44px] leading-[44px] @max-[760px]:text-[28px] @max-[760px]:leading-8" style={{ color: tone }} data-testid="desk-moment-value">
            {screen.value}
          </span>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" className="h-9 w-9 shrink-0 @max-[760px]:h-7 @max-[760px]:w-7" style={{ color: tone }}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-[22px] @max-[760px]:text-[15px] @max-[760px]:leading-5" data-testid="desk-moment-label">
            {eyebrow ? <span className="desk-label mr-2 uppercase">{eyebrow}</span> : null}
            {screen.label}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted" title={line}>
            {line || " "}
          </p>
        </div>
        {counters.length > 0 ? (
          <div className="flex items-center divide-x divide-border @max-[760px]:order-3 @max-[760px]:w-full @max-[760px]:flex-wrap" data-testid="desk-moment-counters">
            {counters.map((counter) => (
              <Counter key={counter.key} counter={counter} />
            ))}
          </div>
        ) : null}
        {queue > 0 ? (
          <Link
            href="/desk/inbox"
            prefetch
            data-testid="desk-inbox-entry"
            className={`${panel.isOpen ? "desk-move border" : "btn-primary"} inline-flex h-9 shrink-0 items-center gap-2 px-4 text-[14px] leading-4 @max-[760px]:order-2 @max-[760px]:h-8 @max-[760px]:px-3 @max-[760px]:text-[13px]`}
          >
            <span>
              Разобрать<span className="@max-[760px]:hidden"> по одной</span>
            </span>
            <span aria-hidden>{enterKey ? "⏎" : "→"}</span>
          </Link>
        ) : null}
      </section>
    </div>
  );
}

function Counter({ counter }: { counter: MomentCounter }) {
  const body = (
    <>
      <span className={counter.active ? "text-accent" : "text-muted"}>{counter.label}</span>
      <Num value={counter.value} className={counter.active ? "!text-accent" : counter.value ? "text-text" : ""} />
    </>
  );
  const className = `inline-flex h-6 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] leading-4 first:pl-0 last:pr-0 @max-[760px]:h-6 ${counter.active ? "font-semibold" : "hover:underline"}`;
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
