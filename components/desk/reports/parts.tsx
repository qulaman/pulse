"use client";

import type { CSSProperties, ReactNode } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import { addDaysYmd, dayName, hmOf, isoWeekday } from "@/lib/daily-report/format";
import type { DailyReportStatus } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";

import { TileFace } from "../team/TeamGrid";

/* ---- the day's clock: minutes of the Aqtobe wall clock on one axis ------------------------------ */

/** Minutes since the wall clock's midnight: of an instant, or of an «HH:MM». */
export function minutesOf(iso: string | null | undefined): number | null {
  return minutesOfHm(hmOf(iso));
}

export function minutesOfHm(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** The hours a row of bars is drawn over: whole hours around everybody's day, 8 to 19 at least. */
export type Axis = { from: number; to: number; ticks: number[] };

export function axisOf(spans: readonly { from: number | null; to: number | null }[], least: [number, number] = [8 * 60, 19 * 60]): Axis {
  let a = least[0];
  let b = least[1];
  for (const span of spans) {
    if (span.from !== null) a = Math.min(a, span.from);
    if (span.to !== null && span.from !== null && span.to > span.from) b = Math.max(b, span.to);
  }
  const from = Math.max(0, Math.floor(a / 60) * 60);
  const to = Math.min(24 * 60, Math.ceil(b / 60) * 60);
  const hours = (to - from) / 60;
  const step = hours <= 10 ? 2 : hours <= 16 ? 3 : 4;
  const ticks: number[] = [];
  for (let hour = Math.ceil(from / 60 / step) * step; hour * 60 <= to; hour += step) ticks.push(hour);
  return { from, to, ticks };
}

/** Where a minute of the day stands on the axis, 0..100 %. */
export function placeOn(axis: Axis, minutes: number): number {
  return Math.max(0, Math.min(100, ((minutes - axis.from) / Math.max(1, axis.to - axis.from)) * 100));
}

/** The hours over the bars' column: the axis' ticks where the bars below have them. */
export function AxisHead({ axis, now }: { axis: Axis; now?: number | null }) {
  return (
    <span className="reports-axis" aria-label="День по часам">
      {axis.ticks.map((hour) => (
        <span key={hour} className="nums reports-axis-tick" style={{ left: `${placeOn(axis, hour * 60)}%` }}>
          {hour}
        </span>
      ))}
      {now !== null && now !== undefined && now > axis.from && now < axis.to ? <span className="reports-axis-now" style={{ left: `${placeOn(axis, now)}%` }} aria-hidden /> : null}
    </span>
  );
}

/**
 * A person's day as a bar on the day's axis (D-174): from arrival to leaving in the pen, the hours'
 * hairlines under it, «сейчас» as a thin mark on today. Drawn from the left as the rows arrive.
 */
export function TimeBar({
  axis,
  from,
  to,
  now,
  index = 0,
  size = "row",
  label,
  stamp,
}: {
  axis: Axis;
  from: number | null;
  to: number | null;
  now?: number | null;
  index?: number;
  size?: "row" | "doc";
  label?: string;
  /** Another day in the same row: the bar draws itself again. */
  stamp?: string;
}) {
  const has = from !== null && to !== null && to > from;
  return (
    <span className="reports-track" data-size={size} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {axis.ticks.map((hour) => (
        <span key={hour} className="reports-track-hour" style={{ left: `${placeOn(axis, hour * 60)}%` }} />
      ))}
      {now !== null && now !== undefined && now > axis.from && now < axis.to ? <span className="reports-track-now" style={{ left: `${placeOn(axis, now)}%` }} /> : null}
      {has ? (
        <span
          key={stamp}
          className="reports-span"
          style={{ left: `${placeOn(axis, from)}%`, width: `${placeOn(axis, to) - placeOn(axis, from)}%`, "--i": Math.min(index, 14) } as CSSProperties}
        />
      ) : null}
    </span>
  );
}

/* ---- a person in a row: the face, the name, the position ---------------------------------------- */

export function Who({ id, name, avatar, sub, quiet = false }: { id: string; name: string; avatar: string | null; sub?: string | null; quiet?: boolean }) {
  return (
    <span className="reports-who" data-quiet={quiet ? "" : undefined}>
      <TileFace person={{ id, full_name: name, avatar_url: avatar }} size={28} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium leading-5" title={name}>
          {name}
        </span>
        {sub ? <span className="block truncate text-[12px] leading-4 text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

/* ---- the hero: the figure that rolls, what it means, the facts, a picture ----------------------- */

/** `empty` — nothing was due: a dash, not a zero. */
export type HeroFigure = { value: number; suffix?: string; tone?: "danger" | null; empty?: boolean };
export type HeroNote = { key: string; label: string; value: ReactNode; title?: string };

/**
 * The total of «Отчёты» (D-174): the one figure large and counting up, the line of what it means,
 * a few facts on the right, and under them what the figure is made of (`children`).
 */
export function ReportsHero({ testId, figure, title, sub, notes, aside, children }: { testId: string; figure: HeroFigure; title: ReactNode; sub?: ReactNode; notes: HeroNote[]; aside?: ReactNode; children?: ReactNode }) {
  return (
    <section className="desk-total reports-hero @container" data-testid={testId}>
      <div className="reports-hero-top">
        <div className="reports-hero-main">
          <span className="nums reports-hero-figure" data-tone={figure.tone ?? undefined} data-testid="hero-value">
            {figure.empty ? "—" : <RollingNumber value={figure.value} />}
            {figure.suffix && !figure.empty ? <span className="reports-hero-unit">{figure.suffix}</span> : null}
          </span>
          <div className="min-w-0">
            <p className="reports-hero-title" data-testid="hero-title">
              {title}
            </p>
            {sub ? <p className="reports-hero-sub">{sub}</p> : null}
          </div>
        </div>
        {notes.length > 0 ? (
          <dl className="reports-hero-notes">
            {notes.map((note) => (
              <div key={note.key} className="reports-hero-note" title={note.title} data-testid={`hero-fact-${note.key}`}>
                <dt>{note.label}</dt>
                <dd className="nums">{note.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {aside ? <div className="reports-hero-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The hero while the numbers load: its own height, nothing moves when they land. */
export function ReportsHeroBone({ bar = true }: { bar?: boolean }) {
  return (
    <section className="desk-total reports-hero" aria-hidden>
      <div className="reports-hero-top">
        <div className="reports-hero-main">
          <span className="skeleton block h-[44px] w-[64px] rounded-[6px] bg-surface-2" />
          <span className="flex flex-col gap-2">
            <span className="skeleton block h-[16px] w-[200px] rounded-[4px] bg-surface-2" />
            <span className="skeleton block h-[12px] w-[150px] rounded-[4px] bg-surface-2" />
          </span>
        </div>
      </div>
      {bar ? <span className="skeleton mt-1 block h-[8px] w-full rounded-full bg-surface-2" /> : null}
    </section>
  );
}

/* ---- what a whole is made of: one thin bar of parts with a legend that filters ----------------- */

export type SharePart = { key: string; value: number; label: string; tone: "ok" | "danger" | "pending" | "quiet"; onClick?: () => void; active?: boolean; title?: string };

export function ShareBar({ parts, label }: { parts: SharePart[]; label: string }) {
  const shown = parts.filter((part) => part.value > 0);
  return (
    <div className="reports-share" data-testid="reports-share">
      <div className="reports-share-bar" role="img" aria-label={label}>
        {shown.length === 0 ? <span className="reports-share-part" data-tone="quiet" style={{ flexGrow: 1 }} /> : null}
        {shown.map((part, index) => (
          <span key={part.key} className="reports-share-part" data-tone={part.tone} style={{ flexGrow: part.value, "--i": index } as CSSProperties} />
        ))}
      </div>
      <div className="reports-share-legend">
        {shown.map((part) => {
          const body = (
            <>
              <span className="reports-swatch" data-tone={part.tone} aria-hidden />
              {part.label}
              <span className="nums reports-share-count">{part.value}</span>
            </>
          );
          return part.onClick ? (
            <button key={part.key} type="button" className="reports-share-key" aria-pressed={part.active} onClick={part.onClick} title={part.title} data-testid={`reports-share-${part.key}`}>
              {body}
            </button>
          ) : (
            <span key={part.key} className="reports-share-key" title={part.title}>
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---- a person's days: a cell a day, in the inks of «Команда» ------------------------------------ */

export type DayMark = { status: DailyReportStatus; arrived_at: string | null; left_at: string | null };
export type PeriodDay = { date: string; workday: boolean };

type CellState = "submitted" | "missed" | "none" | "off" | "future";

function cellOf(day: PeriodDay, mark: DayMark | undefined, today: Ymd): CellState {
  if (mark?.status === "submitted") return "submitted";
  if (mark?.status === "missed") return "missed";
  if (day.date > today) return "future";
  return day.workday ? "none" : "off";
}

const CELL_WORD: Record<CellState, string> = {
  submitted: "сдан",
  missed: "не сдан",
  none: "отчёта нет",
  off: "выходной",
  future: "ещё не наступил",
};

function cellTitle(day: PeriodDay, mark: DayMark | undefined, state: CellState, now: Date): string {
  const times = state === "submitted" && mark?.arrived_at && mark.left_at ? ` · ${hmOf(mark.arrived_at)?.replace(/^0/, "")}–${hmOf(mark.left_at)?.replace(/^0/, "")}` : "";
  return `${dayName(day.date, now)} · ${CELL_WORD[state]}${times}`;
}

/**
 * A person's period in one line (D-174): a cell a day — handed in green, missed in the red pencil,
 * a working day with no report a hollow cell, a day off barely there. Says its day under the mouse.
 */
export function DayCells({ days, marks, today, now, loading = false }: { days: readonly PeriodDay[]; marks: ReadonlyMap<string, DayMark> | undefined; today: Ymd; now: Date; loading?: boolean }) {
  const dense = days.length > 31;
  return (
    <span className="reports-cells" data-dense={dense ? "" : undefined} data-loading={loading ? "" : undefined} aria-hidden>
      {days.map((day) => {
        const mark = marks?.get(day.date);
        const state = cellOf(day, mark, today);
        return <span key={day.date} className="reports-cell" data-state={state} title={loading ? undefined : cellTitle(day, mark, state, now)} />;
      })}
    </span>
  );
}

const LETTERS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** The same days as a calendar, Monday to Sunday — the panel's larger picture of one person. */
export function WeekGrid({ days, marks, today, now }: { days: readonly PeriodDay[]; marks: ReadonlyMap<string, DayMark> | undefined; today: Ymd; now: Date }) {
  if (days.length === 0) return null;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const monday = addDaysYmd(first, 1 - isoWeekday(first));
  const weeks: Ymd[][] = [];
  for (let start = monday; start <= last; start = addDaysYmd(start, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i)));
  let index = 0;
  return (
    <div className="reports-weeks" data-testid="reports-weeks">
      <div className="reports-weeks-row reports-weeks-head" aria-hidden>
        {LETTERS.map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="reports-weeks-row">
          {week.map((date) => {
            const day = byDate.get(date);
            if (!day) return <span key={date} className="reports-cell" data-state="outside" aria-hidden />;
            const mark = marks?.get(date);
            const state = cellOf(day, mark, today);
            const title = cellTitle(day, mark, state, now);
            return <span key={date} className="reports-cell" data-state={state} data-today={date === today ? "" : undefined} title={title} aria-label={title} role="img" style={{ "--i": Math.min(index++, 60) } as CSSProperties} />;
          })}
        </div>
      ))}
      <p className="reports-weeks-legend" aria-hidden>
        <span className="reports-swatch" data-tone="ok" />
        сдан
        <span className="reports-swatch" data-tone="danger" />
        не сдан
        <span className="reports-swatch" data-tone="hollow" />
        без отчёта
        <span className="reports-swatch" data-tone="quiet" />
        выходной
      </p>
    </div>
  );
}

/** One fact of a panel: the label left, the value right, on a hairline. */
export function PanelLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="reports-line">
      <dt>{label}</dt>
      <dd className="nums">{children}</dd>
    </div>
  );
}
