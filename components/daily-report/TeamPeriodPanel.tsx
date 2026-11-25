"use client";

import { LayoutGroup, motion } from "motion/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import { PersonFace } from "@/components/people/PeoplePicker";
import { CARD_SPRING } from "@/components/tasks/list/TaskList";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { CalendarIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { useGlidingState } from "@/components/ui/motion";
import { markGone, PERIOD_MAX_DAYS, percentText, rangeText, shortHm, type PeriodKind } from "@/lib/daily-report/format";
import type { TeamPeriod, TeamPeriodRow } from "@/lib/daily-report/types";
import { compactYmd, daysBetween, type Ymd, addDays } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { useGoneIds } from "@/lib/people/queries";
import { TONE_VAR } from "@/lib/tasks/tone";

import { DayStrip } from "./DayStrip";
import { LoadFailed } from "./TeamDayPanel";
import { FilterChip } from "./TeamFeedPanel";
import { PeriodRowsBone } from "./TeamSkeletons";

const KINDS: { key: PeriodKind; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "custom", label: "Свой" },
];

/**
 * «Отчёты → Период» (D-152, D-198): a week, a month or any stretch up to 92 days — the team's
 * totals, the line of the days, and the people as a table one taps by the head to sort; a tap on
 * a person opens their reports in the feed. No hours, no «пришёл / ушёл» (owner, answer 7; D-194).
 */
export function TeamPeriodPanel({
  kind,
  onKind,
  range,
  onRange,
  today,
  period,
  stale = false,
  failed = false,
  onRetry,
  now,
  onPerson,
}: {
  kind: PeriodKind;
  onKind: (kind: PeriodKind) => void;
  range: { from: Ymd; to: Ymd };
  onRange: (range: { from: Ymd; to: Ymd }) => void;
  today: Ymd;
  period: TeamPeriod | undefined;
  stale?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  now: Date;
  /** A person's row leads to their reports in the feed (`?who`, D-198). */
  onPerson: (userId: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* the chips of «Подряд»: a pick is light on dark, never the brand colour (D-195) */}
        {KINDS.map((item) => (
          <FilterChip key={item.key} on={kind === item.key} onClick={() => onKind(item.key)} testId={`period-${item.key}`}>
            {item.label}
          </FilterChip>
        ))}
        <span className="nums ml-auto text-[13px] leading-4 text-muted">{rangeText(range.from, range.to)}</span>
      </div>
      {kind === "custom" ? (
        <div className="mt-3">
          <RangeField range={range} today={today} onChange={onRange} now={now} />
        </div>
      ) : null}

      {period ? (
        <div className="transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined}>
          <PeriodSummary period={period} now={now} />
          <PeriodPeople rows={period.rows} onPerson={onPerson} />
        </div>
      ) : failed ? (
        <LoadFailed onRetry={onRetry} />
      ) : (
        <PeriodRowsBone />
      )}
    </>
  );
}

function PeriodSummary({ period, now }: { period: TeamPeriod; now: Date }) {
  const t = period.totals;
  const goneIds = useGoneIds();
  // «N в команде» — the team now, as every screen counts it: the rows are the team and whoever left
  // with a report in the period; the latter are not the team (lib/people/team.ts)
  const team = useMemo(() => markGone(period.rows, goneIds).filter((row) => !row.gone).length, [period.rows, goneIds]);
  const rate = t.submit_rate;
  const tone = rate === null ? "muted" : rate >= 0.9 ? "ok" : rate >= 0.6 ? "warn" : "danger";
  const color = TONE_VAR[tone];
  return (
    <section
      data-testid="team-period-summary"
      className="status-screen relative mt-3 overflow-hidden rounded-[22px] px-4 pb-3 pt-3"
      style={{ "--tone": color } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color }}>
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">Команда за период</span>
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-muted">
          <span className="nums text-text">{team}</span> в команде
        </span>
      </div>

      <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
        <span className="nums shrink-0 text-[44px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color }}>
          {percentText(rate)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">отчётов сдано</p>
          <p className="nums mt-0.5 text-[13px] leading-[18px] text-muted">
            сдали {t.submitted} · не сдали {t.missed}
          </p>
        </div>
      </div>

      {/* no «часов»: the typed times are what the form prefilled, not attendance (D-194) */}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="сдано задач" value={String(t.handed_over)} />
        <Stat label="принято" value={String(t.closed)} />
      </dl>

      <div className="mt-4">
        <DayStrip days={period.days} now={now} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    // the term comes first for a screen reader, the number first for the eye
    <div className="flex flex-col-reverse rounded-[12px] bg-surface-2/70 px-2 py-2 text-center">
      <dt className="text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="nums font-display text-[22px] font-semibold leading-[28px]">{value}</dd>
    </div>
  );
}

type SortKey = "name" | "rate" | "tasks";

const COLUMNS: { key: SortKey; label: string; aria: string }[] = [
  { key: "rate", label: "Сдача", aria: "по доле сданных отчётов" },
  { key: "tasks", label: "Задачи", aria: "по сданным задачам" },
];

function valueOf(row: TeamPeriodRow, key: SortKey): number {
  if (key === "rate") return row.submit_rate ?? -1;
  return row.handed_over;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_58px_64px] items-center gap-1";

/**
 * The people of the period as a table that fits a phone: the name, when the report usually comes
 * and two numbers; a tap on a person opens their reports (D-198). A tap on a column's head sorts
 * by it — biggest first, again — smallest first, a third time — by name. Whoever left the team
 * stays at the bottom, quiet, said as gone (D-194).
 */
function PeriodPeople({ rows, onPerson }: { rows: readonly TeamPeriodRow[]; onPerson: (userId: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const goneIds = useGoneIds();

  const sorted = useMemo(() => {
    const list = markGone(rows, goneIds);
    list.sort((a, b) => {
      if (a.gone !== b.gone) return a.gone ? 1 : -1;
      if (sort.key !== "name") {
        const diff = valueOf(a, sort.key) - valueOf(b, sort.key);
        if (diff !== 0) return sort.desc ? -diff : diff;
      }
      return a.full_name.localeCompare(b.full_name, "ru");
    });
    return list;
  }, [rows, goneIds, sort]);

  const press = (key: SortKey) =>
    setSort((was) => (was.key !== key ? { key, desc: true } : was.desc ? { key, desc: false } : { key: "name", desc: false }));

  if (rows.length === 0) {
    return <p className="mt-4 rounded-[20px] border border-border/70 px-6 py-7 text-center text-[15px] text-muted">За этот период отчитываться было некому</p>;
  }

  return (
    <div className="mt-5" data-testid="team-period-people">
      <div className={`${GRID} px-3.5 pb-1.5`}>
        <button
          type="button"
          onClick={() => setSort({ key: "name", desc: false })}
          aria-pressed={sort.key === "name"}
          className={`min-h-[32px] text-left font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] ${sort.key === "name" ? "text-text" : "text-muted"}`}
        >
          Сотрудник
        </button>
        {COLUMNS.map((column) => {
          const on = sort.key === column.key;
          return (
            <button
              key={column.key}
              type="button"
              onClick={() => press(column.key)}
              aria-pressed={on}
              aria-label={`Сортировать ${column.aria}${on ? (sort.desc ? ", сейчас — больше сверху" : ", сейчас — меньше сверху") : ""}`}
              className={`min-h-[32px] text-right font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] ${on ? "text-accent" : "text-muted"}`}
            >
              {column.label}
              {on ? (sort.desc ? " ↓" : " ↑") : ""}
            </button>
          );
        })}
      </div>

      <LayoutGroup>
        <ul className="flex flex-col gap-2">
          {sorted.map((row) => (
            <motion.li key={row.user_id} layout="position" transition={CARD_SPRING} className="task-card overflow-hidden" style={{ borderRadius: 16 }}>
              <button
                type="button"
                onClick={() => onPerson(row.user_id)}
                className={`${GRID} relative min-h-[56px] w-full px-3.5 py-2 text-left transition-transform duration-[120ms] active:scale-[0.99]`}
                data-testid="team-period-person"
              >
                <span className="flex min-w-0 items-center gap-2.5" style={{ opacity: row.gone ? 0.55 : 1 }}>
                  <PersonFace person={row} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] leading-5">{shortName(row.full_name)}</span>
                    <span className="nums block truncate text-[12px] leading-4 text-muted">{personLine(row)}</span>
                  </span>
                </span>
                {/* whoever left is history: their share is said, not lit as a verdict */}
                <span className="nums text-right text-[15px] font-semibold leading-5" style={{ color: row.gone ? "var(--text-muted)" : rateColor(row.submit_rate) }}>
                  {percentText(row.submit_rate)}
                </span>
                <span className="nums text-right text-[15px] leading-5">
                  {row.handed_over}
                  <span className="text-muted">/{row.closed}</span>
                </span>
                <HapticSwitch />
              </button>
            </motion.li>
          ))}
        </ul>
      </LayoutGroup>
      <p className="mt-2 px-1 text-[12px] leading-4 text-muted">Задачи — сдано / принято</p>
    </div>
  );
}

/** A rate as a status: most days in — calm green, many missed — red. */
function rateColor(rate: number | null): string {
  if (rate === null) return "var(--text-muted)";
  return rate >= 0.9 ? "var(--ok)" : rate >= 0.6 ? "var(--warn)" : "var(--danger)";
}

/**
 * Under a person's name: «5 из 5 · около 18:10» — when the report usually comes («обычно сдаёт около …», D-194). No «приход», «уход», «часы»: the typed
 * times were what the form prefilled, not attendance (D-194); when the report usually comes is
 * a fact the phone recorded.
 */
function personLine(row: TeamPeriodRow & { gone: boolean }): string {
  return [
    row.gone ? "не в команде" : "",
    `${row.submitted} из ${row.submitted + row.missed}`,
    row.usual_submitted ? `около ${shortHm(row.usual_submitted)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * «Свой» period: «с» and «по» side by side over one calendar across the full width. Never past
 * today, never longer than the database answers for — the other end follows.
 */
function RangeField({ range, today, onChange, now }: { range: { from: Ymd; to: Ymd }; today: Ymd; onChange: (range: { from: Ymd; to: Ymd }) => void; now: Date }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useGlidingState<"from" | "to" | null>(null, box);
  useDismiss(open !== null, () => setOpen(null), box);

  const pick = (which: "from" | "to", day: Ymd) => {
    let { from, to } = range;
    if (which === "from") {
      from = day;
      if (to < from) to = from;
      if (daysBetween(from, to) >= PERIOD_MAX_DAYS) to = addDays(from, PERIOD_MAX_DAYS - 1);
    } else {
      to = day;
      if (from > to) from = to;
      if (daysBetween(from, to) >= PERIOD_MAX_DAYS) from = addDays(to, -(PERIOD_MAX_DAYS - 1));
    }
    onChange({ from, to });
    setOpen(which === "from" ? "to" : null);
  };

  return (
    <div ref={box}>
      <div className="grid grid-cols-2 gap-2">
        <PickerTrigger
          open={open === "from"}
          onClick={() => setOpen((was) => (was === "from" ? null : "from"))}
          label="С"
          placeholder="С"
          value={`с ${compactYmd(range.from, now)}`}
          icon={<CalendarIcon />}
        />
        <PickerTrigger
          open={open === "to"}
          onClick={() => setOpen((was) => (was === "to" ? null : "to"))}
          label="По"
          placeholder="По"
          value={`по ${compactYmd(range.to, now)}`}
          icon={<CalendarIcon />}
        />
      </div>
      {open ? (
        <PickerPanel>
          <Calendar key={open} value={open === "from" ? range.from : range.to} max={today} now={now} onPick={(day) => pick(open, day)} />
        </PickerPanel>
      ) : null}
      <p className="mt-1.5 px-1 text-[12px] leading-4 text-muted">До {PERIOD_MAX_DAYS} дней</p>
    </div>
  );
}
