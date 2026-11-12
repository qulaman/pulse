"use client";

import type { CSSProperties } from "react";

import { humanAqtobe } from "@/lib/ai/time";
import type { StatusScreen as Screen, Segment } from "@/lib/tasks/overview";
import { deadlineToneOf, TONE_VAR } from "@/lib/tasks/tone";

import { Icon } from "../desk/icons";

/**
 * The status screen at the head of «Задачи» and «Мои дела» (D-83): what the moment is
 * about in one big number and a sentence, how the open work splits into states as one
 * stacked bar (Screen Time's bar, one colour per state), and the nearest deadline as the
 * foot — a tap on it opens that task in the list below. Every row keeps its height
 * whatever the numbers are, so the list under it never moves when the data lands.
 *
 * The employee's screen comes in two more shapes (D-173, `screen.variant`): «compact» — one line
 * while orders wait for their move, so the cards and «Принял» are in sight; «lean» — no «открыто»
 * and no legend beside the tabs, which say those numbers already. The director's has no variant.
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
  if (screen.variant === "compact") return <CompactStatus screen={screen} now={now} onNearest={onNearest} />;
  const lean = screen.variant === "lean";
  const tone = TONE_VAR[screen.tone];
  const total = screen.segments.reduce((sum, segment) => sum + segment.count, 0);
  // nothing open: the legend tells what got done instead of standing empty
  const closedLegend: Segment[] = [
    { key: "today", label: "закрыто сегодня", count: screen.closedToday, tone: "ok" },
    { key: "week", label: "за 7 дней", count: screen.closedWeek, tone: "muted" },
  ];
  // lean says only what is there (D-173): nothing open and nothing closed is no bar and no zeros
  const legend: Segment[] = total > 0 ? (lean ? [] : screen.segments) : lean ? closedLegend.filter((segment) => segment.count > 0) : closedLegend;
  const bar = !(lean && total === 0 && legend.length === 0);
  // lean with nothing open: the legend has said today's count, the foot would say it again
  const foot = !(lean && total === 0);
  const nearest = screen.nearest;
  const nearestTone = nearest
    ? nearest.late
      ? TONE_VAR.danger
      : TONE_VAR[deadlineToneOf({ deadline: nearest.at, status: "accepted" }, now)]
    : undefined;

  return (
    <section
      data-testid="status-screen"
      data-variant={screen.variant}
      className={`status-screen relative overflow-hidden rounded-[22px] px-4 pt-3 ${foot ? "pb-0.5" : "pb-3"}`}
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
        {lean ? null : (
          <span className="shrink-0 text-[12px] leading-4 text-muted">
            <span className="nums text-text">{screen.open}</span> открыто
          </span>
        )}
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
      {bar ? (
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
      ) : null}

      {legend.length > 0 ? (
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
      ) : null}

      {/* the foot: the nearest deadline (the late one, in red, on the employee's), a tap away from its card */}
      {foot ? (
        <div className="mt-2.5 border-t border-border/60">
          {nearest ? (
            <button
              type="button"
              onClick={() => onNearest?.(nearest.id)}
              className="-mx-2 flex min-h-[46px] w-[calc(100%+1rem)] items-center gap-2.5 rounded-[12px] px-2 text-left transition-colors duration-[120ms] active:bg-white/[0.04]"
            >
              <span className={nearest.late ? "text-danger" : "text-muted"}>
                <Icon name="clock" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] ${nearest.late ? "text-danger" : "text-muted"}`}>
                  {nearest.late ? "Просрочено" : "Ближайший срок"}
                </span>
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
      ) : null}
    </section>
  );
}

/**
 * The employee's screen while orders wait for their move (D-173): one line — how many wait — so
 * the first card and its «Принял» stand in sight right under it. When one is late the line names
 * it in red and is a button to that card («Просрочено: … · 12:43 ›»); otherwise the cards under it
 * say the rest (new, returned, the deadlines).
 */
function CompactStatus({ screen, now, onNearest }: { screen: Screen; now: Date; onNearest?: (id: string) => void }) {
  const tone = TONE_VAR[screen.tone];
  const late = screen.nearest?.late ? screen.nearest : null;
  const line = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
      <span className="min-w-0 truncate font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
        <span className="nums" style={{ color: tone }}>
          {screen.value}
        </span>{" "}
        {screen.label}
      </span>
    </span>
  );
  return (
    <section
      data-testid="status-screen"
      data-variant="compact"
      className="status-screen relative overflow-hidden rounded-[18px]"
      style={{ "--tone": tone } as CSSProperties}
    >
      {late ? (
        <button
          type="button"
          onClick={() => onNearest?.(late.id)}
          data-testid="status-late"
          className="flex min-h-[54px] w-full items-center gap-2.5 px-4 py-2 text-left transition-colors duration-[120ms] active:bg-white/[0.04]"
        >
          <span className="min-w-0 flex-1">
            {line}
            <span className="mt-0.5 block truncate pl-[17px] text-[13px] leading-[18px] text-danger">Просрочено: {late.title}</span>
          </span>
          <span className="nums shrink-0 self-end text-[13px] font-semibold leading-[18px] text-danger">
            {humanAqtobe(new Date(late.at), now).replace(/^сегодня /, "")}
          </span>
          <span className="shrink-0 self-end pb-0.5 text-muted">
            <Icon name="open" size={14} />
          </span>
        </button>
      ) : (
        <div className="flex min-h-[44px] items-center px-4">{line}</div>
      )}
    </section>
  );
}
