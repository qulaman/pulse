"use client";

import { useRef, useState } from "react";

import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { useDismiss } from "@/components/ui/datetime/PickerShell";
import { addDaysYmd, dayTitle, PERIOD_MAX_DAYS, rangeText } from "@/lib/daily-report/format";
import { compactYmd, type Ymd } from "@/lib/datetime/calendar";
import { clampCustom, monthTitle, periodRange, type TabelPeriod } from "@/lib/desk/reports-address";

/** A step back or forth: a chevron on the sheet, no box. */
const STEP =
  "reports-step flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35";

function TodayMove({ at, label, hint, onToday }: { at: boolean; label: string; hint: string; onToday: () => void }) {
  return at ? (
    <span className="ml-1 w-[84px] text-right text-[13px] leading-4 text-muted">{label.toLowerCase()}</span>
  ) : (
    <Tooltip label={hint} keys={["T"]}>
      <Button size="sm" variant="ghost" className="ml-1 !min-h-8 w-[84px] !justify-end !px-0" onClick={onToday} data-testid="desk-reports-today">
        {label}
      </Button>
    </Tooltip>
  );
}

/** ‹ Вторник, 3 ноября › — the day of «Сводка»; tomorrow is not a day yet; ← and → step too. */
export function DayStepper({ date, today, onDate }: { date: Ymd; today: Ymd; onDate: (date: Ymd) => void }) {
  const isToday = date === today;
  return (
    <div className="reports-stepper flex items-center gap-1" data-testid="desk-day-stepper">
      <button type="button" className={STEP} aria-label="Предыдущий день" title="Предыдущий день (←)" onClick={() => onDate(addDaysYmd(date, -1))}>
        <Icon name="left" size={16} />
      </button>
      <span key={date} className="reports-stepper-title min-w-[176px] text-center text-[14px] font-semibold leading-5" data-testid="desk-day-title">
        {dayTitle(date)}
      </span>
      <button type="button" className={STEP} aria-label="Следующий день" title="Следующий день (→)" disabled={isToday} onClick={() => onDate(addDaysYmd(date, 1))}>
        <Icon name="right" size={16} />
      </button>
      <TodayMove at={isToday} label="Сегодня" hint="К сегодняшнему дню" onToday={() => onDate(today)} />
    </div>
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
 * The period of «Табель»: a calendar month or a Monday–Sunday week stepping back and forth (‹ ›,
 * ← →) and back to the one with today (T); «Свой» — two calendars, at most 92 days.
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
          <button type="button" className={STEP} aria-label={`Предыдущий период: ${unit}`} title="Раньше (←)" onClick={() => onStep(-1)} data-testid="desk-period-prev">
            <Icon name="left" size={16} />
          </button>
          <span key={range.from} className="reports-stepper-title nums min-w-[150px] text-center text-[14px] font-semibold leading-5" data-testid="desk-period-dates">
            {period.kind === "month" ? monthTitle(period.month) : rangeText(range.from, range.to)}
          </span>
          <button type="button" className={STEP} aria-label={`Следующий период: ${unit}`} title="Позже (→)" disabled={atToday} onClick={() => onStep(1)}>
            <Icon name="right" size={16} />
          </button>
          <TodayMove at={atToday} label={period.kind === "month" ? "Этот месяц" : "Эта неделя"} hint="К периоду с сегодняшним днём" onToday={onToday} />
        </div>
      )}
    </>
  );
}
