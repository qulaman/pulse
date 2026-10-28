"use client";

import { LayoutGroup, motion, MotionConfig } from "framer-motion";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import { PersonFace } from "@/components/people/PeoplePicker";
import { CARD_SPRING } from "@/components/tasks/list/TaskList";
import { Chip } from "@/components/ui/Chip";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { CalendarIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { useGlidingState } from "@/components/ui/motion";
import {
  addDaysYmd,
  hoursText,
  PERIOD_MAX_DAYS,
  percentText,
  pointsText,
  rangeText,
  shortHm,
  type PeriodKind,
} from "@/lib/daily-report/format";
import type { TeamPeriod, TeamPeriodRow } from "@/lib/daily-report/types";
import { compactYmd, daysBetween, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { TONE_VAR } from "@/lib/tasks/tone";

import { DayStrip } from "./DayStrip";
import { TeamPeriodBone } from "./Skeletons";
import { LoadFailed } from "./TeamDayPanel";

const KINDS: { key: PeriodKind; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "custom", label: "Свой" },
];

/**
 * «Отчёты → Период» (D-152): a week, a month or any stretch up to 92 days — the team's totals,
 * the line of the days, and the people as a table one taps by the head to sort; a tap on a
 * person opens the rest of their numbers in place.
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
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((item) => (
          <Chip key={item.key} tone={kind === item.key ? "accent" : "neutral"} aria-pressed={kind === item.key} onClick={() => onKind(item.key)}>
            {item.label}
          </Chip>
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
          <PeriodPeople rows={period.rows} />
        </div>
      ) : failed ? (
        <LoadFailed onRetry={onRetry} />
      ) : (
        <TeamPeriodBone />
      )}
    </>
  );
}

function PeriodSummary({ period, now }: { period: TeamPeriod; now: Date }) {
  const t = period.totals;
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
          <span className="nums text-text">{t.team}</span> в команде
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

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="сдано задач" value={String(t.handed_over)} />
        <Stat label="принято" value={String(t.closed)} />
        <Stat label="часов" value={hoursText(t.hours_total).replace(" ч", "") || "0"} />
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

type SortKey = "name" | "rate" | "hours" | "tasks";

const COLUMNS: { key: SortKey; label: string; aria: string }[] = [
  { key: "rate", label: "Сдача", aria: "по доле сданных отчётов" },
  { key: "hours", label: "Часы", aria: "по средним часам" },
  { key: "tasks", label: "Задачи", aria: "по сданным задачам" },
];

function valueOf(row: TeamPeriodRow, key: SortKey): number {
  if (key === "rate") return row.submit_rate ?? -1;
  if (key === "hours") return row.avg_hours ?? -1;
  return row.handed_over;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_54px_54px_58px] items-center gap-1";

/**
 * The people of the period as a table that fits a phone: the name and three numbers, the rest
 * a tap away. A tap on a column's head sorts by it — biggest first, again — smallest first,
 * a third time — by name.
 */
function PeriodPeople({ rows }: { rows: readonly TeamPeriodRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      if (sort.key !== "name") {
        const diff = valueOf(a, sort.key) - valueOf(b, sort.key);
        if (diff !== 0) return sort.desc ? -diff : diff;
      }
      return a.full_name.localeCompare(b.full_name, "ru");
    });
    return list;
  }, [rows, sort]);

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

      <MotionConfig reducedMotion="user">
        <LayoutGroup>
          <ul className="flex flex-col gap-2">
            {sorted.map((row) => {
              const open = openId === row.user_id;
              return (
                <motion.li key={row.user_id} layout="position" transition={CARD_SPRING} className="task-card overflow-hidden" style={{ borderRadius: 16 }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : row.user_id)}
                    className={`${GRID} min-h-[56px] w-full px-3.5 py-2 text-left transition-transform duration-[120ms] active:scale-[0.99]`}
                    data-testid="team-period-person"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <PersonFace person={row} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] leading-5">{shortName(row.full_name)}</span>
                        <span className="nums block truncate text-[12px] leading-4 text-muted">
                          {row.submitted} из {row.submitted + row.missed}
                        </span>
                      </span>
                    </span>
                    <span className="nums text-right text-[15px] font-semibold leading-5" style={{ color: rateColor(row.submit_rate) }}>
                      {percentText(row.submit_rate)}
                    </span>
                    <span className="nums text-right text-[15px] leading-5">{row.avg_hours === null ? "—" : hoursText(row.avg_hours).replace(" ч", "")}</span>
                    <span className="nums text-right text-[15px] leading-5">
                      {row.handed_over}
                      <span className="text-muted">/{row.closed}</span>
                    </span>
                  </button>
                  {open ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.06 } }}
                      className="border-t border-border/60 px-3.5 pb-3.5 pt-3"
                    >
                      <PersonNumbers row={row} />
                    </motion.div>
                  ) : null}
                </motion.li>
              );
            })}
          </ul>
        </LayoutGroup>
      </MotionConfig>
      <p className="mt-2 px-1 text-[12px] leading-4 text-muted">Часы — в среднем за сданный день; задачи — сдано / принято</p>
    </div>
  );
}

/** A rate as a status: most days in — calm green, many missed — red. */
function rateColor(rate: number | null): string {
  if (rate === null) return "var(--text-muted)";
  return rate >= 0.9 ? "var(--ok)" : rate >= 0.6 ? "var(--warn)" : "var(--danger)";
}

function PersonNumbers({ row }: { row: TeamPeriodRow }) {
  const lines: [string, string][] = [
    ["Отчёты", `сдал ${row.submitted} из ${row.workdays} рабочих${row.missed ? ` · не сдал ${row.missed}` : ""}`],
    ["Приход и уход", row.avg_arrived && row.avg_left ? `в среднем ${shortHm(row.avg_arrived)} — ${shortHm(row.avg_left)}` : "—"],
    ["Часы", row.avg_hours === null ? "—" : `${hoursText(row.avg_hours)} в день · всего ${hoursText(row.hours_total) || "0 ч"}`],
    ["Задачи", `сдал ${row.handed_over} · принято ${row.closed}`],
    ["По срокам", row.on_time + row.late ? `в срок ${row.on_time} · после срока ${row.late}` : "задач со сроком не было"],
    ["Очки за отчёты", pointsText(row.points) || "0"],
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px] leading-5">
      {lines.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="nums min-w-0 text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
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
      if (daysBetween(from, to) >= PERIOD_MAX_DAYS) to = addDaysYmd(from, PERIOD_MAX_DAYS - 1);
    } else {
      to = day;
      if (from > to) from = to;
      if (daysBetween(from, to) >= PERIOD_MAX_DAYS) from = addDaysYmd(to, -(PERIOD_MAX_DAYS - 1));
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
