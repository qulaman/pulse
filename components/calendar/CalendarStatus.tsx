"use client";

import type { CSSProperties } from "react";

import { Icon } from "@/components/tasks/desk/icons";
import type { CalendarScreen, DayStrip } from "@/lib/calendar/overview";
import { TONE_VAR } from "@/lib/tasks/tone";

/**
 * The head of /calendar (D-100) in the language of «Задачи» (D-83): the moment in one number
 * and a sentence, today as a strip of the working day with the hand of now on it, and the
 * nearest meeting as the foot — a tap opens its card below. Every row keeps its height
 * whatever the day holds, so the month under it never moves when the data lands.
 */
export function CalendarStatus({ screen, onNearest }: { screen: CalendarScreen; onNearest: (id: string) => void }) {
  const tone = TONE_VAR[screen.tone];
  const nearest = screen.nearest;

  return (
    <section
      data-testid="calendar-status"
      className="status-screen relative overflow-hidden rounded-[22px] px-4 pb-0.5 pt-3"
      style={{ "--tone": screen.tone === "muted" ? "var(--accent)" : tone } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]"
          style={{ color: tone }}
        >
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
          <span className="truncate">{screen.eyebrow}</span>
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-muted">
          <span className="nums text-text">{screen.week}</span> на неделе
        </span>
      </div>

      <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
        {screen.value !== null ? (
          <span className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color: tone }}>
            {screen.value}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
          >
            <Icon name="check" size={26} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">{screen.label}</p>
          <p className="mt-0.5 line-clamp-2 min-h-[36px] text-[13px] leading-[18px] text-muted">{screen.detail || " "}</p>
        </div>
      </div>

      <Strip strip={screen.strip} />

      <ul className="mt-2 flex min-h-[18px] flex-wrap gap-x-3.5 gap-y-1">
        {screen.legend.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px]">
            <span
              aria-hidden
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: TONE_VAR[item.tone], opacity: item.tone === "muted" ? 0.55 : 1 }}
            />
            <span className="nums font-semibold text-text">{item.count}</span>
            <span className="text-muted">{item.label}</span>
          </li>
        ))}
      </ul>

      {/* the foot: the nearest meeting, a tap away from its card */}
      <div className="mt-2.5 border-t border-border/60">
        {nearest ? (
          <button
            type="button"
            data-testid="calendar-nearest"
            onClick={() => onNearest(nearest.id)}
            className="-mx-2 flex min-h-[46px] w-[calc(100%+1rem)] items-center gap-2.5 rounded-[12px] px-2 text-left transition-colors duration-[120ms] active:bg-white/[0.04]"
          >
            <span className="text-muted">
              <Icon name="clock" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted">Ближайшее</span>
              <span className="block truncate text-[14px] leading-[19px]">{nearest.title}</span>
            </span>
            <span className="nums shrink-0 text-[13px] font-semibold leading-4" style={{ color: TONE_VAR[nearest.tone] }}>
              {nearest.when}
            </span>
            <span className="text-muted">
              <Icon name="open" size={14} />
            </span>
          </button>
        ) : (
          <p className="flex min-h-[46px] items-center gap-2.5 text-[14px] leading-[19px] text-muted">
            <Icon name="clock" size={17} />
            <span>Впереди ничего нет</span>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Today from morning to evening: a block where the clock puts each meeting — dimmed once
 * over, lit while on — and a hairline hand at now. Hours are printed under the track.
 */
function Strip({ strip }: { strip: DayStrip }) {
  const pct = (hour: number) => ((hour - strip.from) / (strip.to - strip.from)) * 100;
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--surface-2) 85%, transparent)" }}>
        {strip.blocks.map((block, index) => (
          <span
            key={block.id}
            className="bar-grow absolute inset-y-0 rounded-full"
            style={{
              left: `${block.left}%`,
              width: `${block.width}%`,
              animationDelay: `${index * 60}ms`,
              background:
                block.state === "past"
                  ? "color-mix(in srgb, var(--text-muted) 45%, transparent)"
                  : block.state === "now"
                    ? "var(--accent)"
                    : "color-mix(in srgb, var(--accent) 62%, var(--surface-2))",
              boxShadow: block.state === "now" ? "0 0 10px color-mix(in srgb, var(--accent) 60%, transparent)" : undefined,
            }}
          />
        ))}
        {strip.now !== null ? (
          <span
            className="absolute -top-[3px] h-4 w-[2px] -translate-x-1/2 rounded-full"
            style={{ left: `${strip.now}%`, background: "var(--text)", boxShadow: "0 0 0 2px var(--surface)" }}
          />
        ) : null}
      </div>
      <div className="relative mt-1 h-3.5">
        {strip.ticks.map((hour) => (
          <span
            key={hour}
            className="nums absolute top-0 text-[11px] leading-[14px] text-muted"
            style={{
              left: `${pct(hour)}%`,
              transform: hour === strip.from ? "none" : hour === strip.to ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {String(hour).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}
