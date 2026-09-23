"use client";

import type { CSSProperties } from "react";

import { humanAqtobe } from "@/lib/ai/time";
import type { StatusScreen as Screen, Segment } from "@/lib/tasks/overview";
import { deadlineToneOf, TONE_VAR } from "@/lib/tasks/tone";

import { Icon } from "../desk/icons";

/**
 * The status screen at the head of «Задачи» and «Мои дела» (D-82): what the moment is
 * about in one big number and a sentence, how the open work splits into states as one
 * stacked bar (Screen Time's bar, one colour per state), and the nearest deadline as the
 * foot — a tap on it opens that task in the list below. Every row keeps its height
 * whatever the numbers are, so the list under it never moves when the data lands.
 */
export function StatusScreen({
  screen,
  now,
  title,
  onNearest,
}: {
  screen: Screen;
  now: Date;
  /** Replaces the eyebrow — a person picked on the strip names the screen. */
  title?: string;
  onNearest?: (id: string) => void;
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
  const nearest = screen.nearest;
  const nearestTone = nearest ? TONE_VAR[deadlineToneOf({ deadline: nearest.at, status: "accepted" }, now)] : undefined;

  return (
    <section
      data-testid="status-screen"
      className="status-screen relative overflow-hidden rounded-[22px] px-4 pb-0.5 pt-3"
      style={{ "--tone": tone } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]"
          style={{ color: tone }}
        >
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
          <span className="truncate">{title ?? screen.eyebrow}</span>
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-muted">
          <span className="nums text-text">{screen.open}</span> открыто
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
            style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
          >
            <Icon name="check" size={26} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">{screen.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted">{screen.detail || " "}</p>
        </div>
      </div>

      {/* the bar: one segment per state that exists, loudest first; an empty track when nothing is open */}
      <div
        className="mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full"
        style={{ background: total ? undefined : `color-mix(in srgb, ${tone} 22%, var(--surface-2))` }}
      >
        {screen.segments.map((segment, index) => (
          <span
            key={segment.key}
            className="bar-grow h-full"
            style={{
              flexGrow: segment.count,
              flexBasis: 0,
              minWidth: 6,
              background: TONE_VAR[segment.tone],
              opacity: segment.tone === "muted" ? 0.55 : 1,
              borderRadius: index === 0 || index === screen.segments.length - 1 ? 999 : 2,
              animationDelay: `${index * 60}ms`,
            }}
          />
        ))}
      </div>

      <ul className="mt-2 flex min-h-[18px] flex-wrap gap-x-3.5 gap-y-1">
        {legend.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px]">
            <span
              aria-hidden
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: TONE_VAR[segment.tone], opacity: segment.tone === "muted" ? 0.55 : 1 }}
            />
            <span className="nums font-semibold text-text">{segment.count}</span>
            <span className="text-muted">{segment.label}</span>
          </li>
        ))}
      </ul>

      {/* the foot: the nearest deadline, a tap away from its card */}
      <div className="mt-2.5 border-t border-border/60">
        {nearest ? (
          <button
            type="button"
            onClick={() => onNearest?.(nearest.id)}
            className="-mx-2 flex min-h-[46px] w-[calc(100%+1rem)] items-center gap-2.5 rounded-[12px] px-2 text-left transition-colors duration-[120ms] active:bg-white/[0.04]"
          >
            <span className="text-muted">
              <Icon name="clock" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted">Ближайший срок</span>
              <span className="block truncate text-[14px] leading-[19px]">
                {nearest.title}
                {nearest.who ? <span className="text-muted"> · {nearest.who}</span> : null}
              </span>
            </span>
            <span className="nums shrink-0 text-[13px] font-semibold leading-4" style={{ color: nearestTone }}>
              {humanAqtobe(new Date(nearest.at), now)}
            </span>
            <span className="text-muted">
              <Icon name="open" size={14} />
            </span>
          </button>
        ) : (
          <p className="flex min-h-[46px] items-center gap-2.5 text-[14px] leading-[19px] text-muted">
            <Icon name="clock" size={17} />
            {screen.closedToday > 0 ? (
              <span>
                Сегодня закрыто: <span className="nums text-text">{screen.closedToday}</span>
              </span>
            ) : (
              <span>Сроков нет</span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
