"use client";

import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";

import { IconButton } from "@/components/desk/ui/IconButton";
import { Popover } from "@/components/desk/ui/Popover";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { useDismiss } from "@/components/ui/datetime/PickerShell";
import { PERIOD_MAX_DAYS, rangeText } from "@/lib/daily-report/format";
import { compactYmd, type Ymd } from "@/lib/datetime/calendar";
import { clampCustom, monthTitle, periodRange, type TabelPeriod } from "@/lib/desk/reports-address";

/** A step back or forth: a chevron on the sheet, no box. */
const STEP =
  "reports-step flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35";

function TodayMove({ at, label, hint, onToday }: { at: boolean; label: string; hint: string; onToday: () => void }) {
  // on the period with today there is nowhere to go back to: the bar keeps its room for the rest
  return at ? null : (
    <Tooltip label={hint} keys={["T"]}>
      <Button size="sm" variant="ghost" className="ml-1 !min-h-8 !px-2" onClick={onToday} data-testid="desk-reports-today">
        {label}
      </Button>
    </Tooltip>
  );
}

/**
 * The feed's jump to a date (D-198): a calendar icon in the head, the month under it; a picked day
 * scrolls the feed to it and opens it (older weeks load on the way). Tomorrow is not a day yet.
 */
export function JumpToDay({ value, today, now, onPick }: { value: Ymd; today: Ymd; now: Date; onPick: (day: Ymd) => void }) {
  const box = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <span ref={box} className="inline-flex">
        <IconButton
          label="Перейти к дню"
          icon={<CalendarDays size={16} aria-hidden />}
          pressed={Boolean(anchor)}
          onClick={() => setAnchor(anchor ? null : box.current)}
          testId="desk-feed-jump"
        />
      </span>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} align="end" width={320} label="Перейти к дню">
        <div className="p-3" data-testid="desk-feed-jump-calendar">
          <Calendar
            value={value}
            max={today}
            now={now}
            onPick={(day) => {
              setAnchor(null);
              onPick(day);
            }}
          />
        </div>
      </Popover>
    </>
  );
}

const KINDS: { value: TabelPeriod["kind"]; label: string }[] = [
  { value: "month", label: "Месяц" },
  { value: "week", label: "Неделя" },
  { value: "custom", label: "Свой" },
];

/** One end of «Свой» period: a field-like button and a calendar under it. */
function DayPick({ label, value, max, now, onPick }: { label: string; value: Ymd; max: Ymd; now: Date; onPick: (day: Ymd) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), box);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`field nums flex h-8 items-center gap-1.5 px-2.5 text-[13px] leading-5 ${open ? "border-accent" : ""}`}
      >
        <span className="text-muted">{label}</span>
        {compactYmd(value, now)}
      </button>
      {open ? (
        <div className="desk-pop card absolute left-0 top-[calc(100%+6px)] z-20 w-[320px] p-3" style={{ boxShadow: "var(--shadow-raised)" }}>
          <Calendar
            value={value}
            max={max}
            now={now}
            onPick={(day) => {
              onPick(day);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The period of the «Табель» card: a calendar month or a Monday–Sunday week stepping back and
 * forth (‹ ›) and back to the one with today (the button, T); «Свой» — two calendars, at most 92 days.
 */
export function PeriodControls({
  period,
  onKind,
  onPeriod,
  onStep,
  atToday,
  onToday,
  today,
  now,
}: {
  period: TabelPeriod;
  onKind: (kind: TabelPeriod["kind"]) => void;
  onPeriod: (period: TabelPeriod) => void;
  onStep: (dir: -1 | 1) => void;
  atToday: boolean;
  onToday: () => void;
  today: Ymd;
  now: Date;
}) {
  const range = periodRange(period);
  const unit = period.kind === "month" ? "месяц" : "неделя";
  const pick = (which: "from" | "to", day: Ymd) => {
    const next = which === "from" ? { from: day, to: range.to < day ? day : range.to } : { from: range.from > day ? day : range.from, to: day };
    onPeriod({ kind: "custom", ...clampCustom(next.from, next.to) });
  };
  return (
    <>
      <SegmentTabs aria-label="Период" value={period.kind} onChange={onKind} items={KINDS} />
      {period.kind === "custom" ? (
        <div className="flex items-center gap-1.5" data-testid="desk-period-range">
          <DayPick label="с" value={range.from} max={today} now={now} onPick={(day) => pick("from", day)} />
          <DayPick label="по" value={range.to} max={today} now={now} onPick={(day) => pick("to", day)} />
          <span className="text-[12px] leading-4 text-muted">до {PERIOD_MAX_DAYS} дней</span>
        </div>
      ) : (
        <div className="reports-stepper flex items-center gap-1">
          <button type="button" className={STEP} aria-label={`Предыдущий период: ${unit}`} title="Раньше" onClick={() => onStep(-1)} data-testid="desk-period-prev">
            <Icon name="left" size={16} />
          </button>
          <span key={range.from} className="reports-stepper-title nums min-w-[150px] text-center text-[14px] font-semibold leading-5" data-testid="desk-period-dates">
            {period.kind === "month" ? monthTitle(period.month) : rangeText(range.from, range.to)}
          </span>
          <button type="button" className={STEP} aria-label={`Следующий период: ${unit}`} title="Позже" disabled={atToday} onClick={() => onStep(1)}>
            <Icon name="right" size={16} />
          </button>
          <TodayMove at={atToday} label={period.kind === "month" ? "Этот месяц" : "Эта неделя"} hint="К периоду с сегодняшним днём" onToday={onToday} />
        </div>
      )}
    </>
  );
}
