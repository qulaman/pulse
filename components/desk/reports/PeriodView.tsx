"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { useDismiss } from "@/components/ui/datetime/PickerShell";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, dayName, hoursText, isoWeekday, PERIOD_MAX_DAYS, percentText, rangeText, shortHm, type PeriodKind } from "@/lib/daily-report/format";
import type { TeamPeriod, TeamPeriodRow } from "@/lib/daily-report/types";
import { compactYmd, daysBetween, parseYmd, type Ymd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";

import { DeskHero, HeroBone } from "../team/Hero";
import { LoadFailed } from "./DayView";

type Day = TeamPeriod["days"][number];

/** A share of reports as a state: most days in — calm, many missed — the alarm (D-152). */
export function rateTone(rate: number | null | undefined): Tone | null {
  if (rate === null || rate === undefined) return null;
  return rate >= 0.9 ? "ok" : rate >= 0.6 ? "warn" : "danger";
}

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Свой" },
];

const LETTERS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** Below this width of the table the column steps aside — the least needed first (a narrow window, the panel open). */
const ROOM: Partial<Record<string, number>> = { total: 1000, late: 920, left: 840, arrived: 780, count: 700 };

/**
 * The width of a box, followed as the window or the panel changes it; 0 until measured. A
 * callback ref: the box comes later than the screen (after the period has loaded).
 */
function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}
const STRIP_H = 112;

/** Under two weeks — every weekday; longer — the Mondays' dates, so the labels never collide. */
function tick(date: string, count: number): string {
  if (count <= 14) return LETTERS[isoWeekday(date)];
  return isoWeekday(date) === 1 ? String(parseYmd(date)?.day ?? "") : "";
}

/**
 * The team's period day by day as thin columns (D-154): reports handed in from the baseline in
 * green, the missed ones on top in red at 70 %, a gap between days and between both — a picture
 * of the rhythm, never a wall of red blocks. Days off are dimmed; the hovered day is said below.
 */
function DayColumns({ days, now }: { days: readonly Day[]; now: Date }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((day) => day.submitted + day.missed));
  const n = days.length;
  const width = n <= 7 ? 22 : n <= 14 ? 16 : n <= 31 ? 10 : 5;
  const gap = n <= 14 ? 8 : n <= 31 ? 4 : 2;
  const chosen = days.find((day) => day.date === hover) ?? null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="desk-period-strip" onMouseLeave={() => setHover(null)}>
      <div className="flex items-end border-b border-border" style={{ height: STRIP_H, gap }}>
        {days.map((day) => {
          const total = day.submitted + day.missed;
          return (
            <div
              key={day.date}
              role="img"
              aria-label={`${dayName(day.date, now)}: сдали ${day.submitted}, не сдали ${day.missed}${day.workday ? "" : ", выходной"}`}
              onMouseEnter={() => setHover(day.date)}
              className="flex h-full shrink-0 flex-col justify-end gap-[2px] transition-opacity duration-[120ms]"
              style={{ width, opacity: hover && hover !== day.date ? 0.45 : day.workday ? 1 : 0.45 }}
            >
              {total === 0 ? (
                <span className="block h-[2px] rounded-full bg-border" />
              ) : (
                <>
                  {day.missed > 0 ? (
                    <span className="block rounded-t-[3px]" style={{ height: `${(day.missed / max) * 100}%`, background: TONE_VAR.danger, opacity: 0.7 }} />
                  ) : null}
                  {day.submitted > 0 ? (
                    <span className={`block ${day.missed > 0 ? "" : "rounded-t-[3px]"}`} style={{ height: `${(day.submitted / max) * 100}%`, background: TONE_VAR.ok }} />
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex" style={{ gap }} aria-hidden>
        {days.map((day) => (
          <span key={day.date} className="nums shrink-0 overflow-visible whitespace-nowrap text-center text-[11px] leading-[14px] text-muted" style={{ width }}>
            {tick(day.date, n)}
          </span>
        ))}
      </div>
      <p className="nums min-h-[18px] text-[12px] leading-[18px] text-muted" aria-live="polite">
        {chosen ? (
          <>
            <span className="text-text">{dayName(chosen.date, now)}</span> · сдали {chosen.submitted} · не сдали {chosen.missed} · сдано задач {chosen.handed_over}
          </>
        ) : (
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TONE_VAR.ok }} />
              сдали
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TONE_VAR.danger, opacity: 0.7 }} />
              не сдали
            </span>
          </span>
        )}
      </p>
    </div>
  );
}

/** One end of «Свой» period: a field-like button and a calendar under it. */
function DayPick({ label, value, max, min, now, onPick }: { label: string; value: Ymd; max: Ymd; min?: Ymd; now: Date; onPick: (day: Ymd) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), box);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`field nums flex h-9 items-center gap-1.5 px-3 text-[14px] leading-5 ${open ? "border-accent" : ""}`}
      >
        <span className="text-muted">{label}</span>
        {compactYmd(value, now)}
      </button>
      {open ? (
        <div className="card absolute left-0 top-[calc(100%+6px)] z-20 w-[320px] p-3" style={{ boxShadow: "var(--shadow-raised)" }}>
          <Calendar
            value={value}
            min={min}
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

/** «с 28.10 по 03.11» — never past today, never longer than the database answers for: the other end follows. */
function RangePicker({ range, today, now, onRange }: { range: { from: Ymd; to: Ymd }; today: Ymd; now: Date; onRange: (range: { from: Ymd; to: Ymd }) => void }) {
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
    onRange({ from, to });
  };
  return (
    <div className="flex items-center gap-1.5" data-testid="desk-period-range">
      <DayPick label="с" value={range.from} max={today} now={now} onPick={(day) => pick("from", day)} />
      <DayPick label="по" value={range.to} max={today} now={now} onPick={(day) => pick("to", day)} />
      <span className="text-[12px] leading-4 text-muted">до {PERIOD_MAX_DAYS} дней</span>
    </div>
  );
}

/** The kind of the period and its stretch — the period's own controls beside the tabs. */
export function PeriodControls({
  kind,
  onKind,
  range,
  onRange,
  today,
  now,
}: {
  kind: PeriodKind;
  onKind: (kind: PeriodKind) => void;
  range: { from: Ymd; to: Ymd };
  onRange: (range: { from: Ymd; to: Ymd }) => void;
  today: Ymd;
  now: Date;
}) {
  return (
    <>
      <SegmentTabs aria-label="Период" value={kind} onChange={onKind} items={KINDS} />
      {kind === "custom" ? (
        <RangePicker range={range} today={today} now={now} onRange={onRange} />
      ) : (
        <span className="nums text-[13px] leading-4 text-muted" data-testid="desk-period-dates">
          {rangeText(range.from, range.to)}
        </span>
      )}
    </>
  );
}

function PeriodBone() {
  return (
    <>
      <HeroBone />
      <SkeletonGroup grow className="overflow-hidden rounded-[12px] border border-border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 border-b border-border/50 px-3 last:border-b-0">
            <Bone h={14} w="22%" />
            <Bone h={14} w="8%" />
            <Bone h={14} w="30%" />
          </div>
        ))}
      </SkeletonGroup>
    </>
  );
}

const byName = (a: TeamPeriodRow, b: TeamPeriodRow) => a.full_name.localeCompare(b.full_name, "ru");
/** The worst share first — who misses reports is what the director came for; nothing due — last. */
const byRate = (a: TeamPeriodRow, b: TeamPeriodRow) => (a.submit_rate ?? 2) - (b.submit_rate ?? 2) || byName(a, b);

/**
 * «Отчёты → Период» on the desk (D-152, D-154): the hero — the share of reports in its tone, the
 * work that moved, the days as thin columns; the people as a sortable table, the worst share first.
 */
export function PeriodView({
  period,
  stale,
  failed,
  onRetry,
  pointsOn,
  now,
}: {
  period: TeamPeriod | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  pointsOn: boolean;
  now: Date;
}) {
  const [box, width] = useWidth();
  if (!period) return failed ? <LoadFailed onRetry={onRetry} /> : <PeriodBone />;
  const t = period.totals;
  const rows = [...period.rows].sort(byRate);

  const columns: Column<TeamPeriodRow>[] = [
    {
      key: "who",
      title: "Сотрудник",
      width: "minmax(160px,1.4fr)",
      sort: byName,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.full_name} size={24} />
          <span className="truncate">{row.full_name}</span>
        </span>
      ),
    },
    {
      key: "rate",
      title: "Сдача",
      width: "80px",
      align: "right",
      sort: (a, b) => (a.submit_rate ?? -1) - (b.submit_rate ?? -1),
      render: (row) => {
        const tone = rateTone(row.submit_rate);
        return (
          <span className="nums font-semibold" style={{ color: tone ? TONE_VAR[tone] : "var(--text-muted)" }}>
            {percentText(row.submit_rate)}
          </span>
        );
      },
    },
    {
      key: "count",
      title: "Сдал",
      width: "80px",
      align: "right",
      sort: (a, b) => a.submitted - b.submitted,
      render: (row) => (
        <span className="nums text-muted">
          <span className="text-text">{row.submitted}</span> из {row.submitted + row.missed}
        </span>
      ),
    },
    {
      key: "arrived",
      title: "Приход",
      width: "84px",
      align: "right",
      sort: (a, b) => (a.avg_arrived ?? "~").localeCompare(b.avg_arrived ?? "~"),
      render: (row) => (row.avg_arrived ? <span className="nums">{shortHm(row.avg_arrived)}</span> : <span className="text-muted/40">—</span>),
    },
    {
      key: "left",
      title: "Уход",
      width: "72px",
      align: "right",
      sort: (a, b) => (a.avg_left ?? "").localeCompare(b.avg_left ?? ""),
      render: (row) => (row.avg_left ? <span className="nums">{shortHm(row.avg_left)}</span> : <span className="text-muted/40">—</span>),
    },
    {
      key: "hours",
      title: "Часы в день",
      width: "132px",
      align: "right",
      sort: (a, b) => (a.avg_hours ?? -1) - (b.avg_hours ?? -1),
      render: (row) => (row.avg_hours === null ? <span className="text-muted/40">—</span> : <span className="nums">{hoursText(row.avg_hours)}</span>),
    },
    {
      key: "total",
      title: "Всего",
      width: "84px",
      align: "right",
      sort: (a, b) => a.hours_total - b.hours_total,
      render: (row) => (row.hours_total ? <span className="nums text-muted">{hoursText(row.hours_total)}</span> : <span className="text-muted/40">—</span>),
    },
    {
      key: "tasks",
      title: "Задачи",
      width: "88px",
      align: "right",
      sort: (a, b) => a.handed_over - b.handed_over,
      render: (row) => (
        <span className="nums" title={`сдано ${row.handed_over} · принято ${row.closed}`}>
          <Num value={row.handed_over} />
          <span className="text-muted/60"> / </span>
          <Num value={row.closed} className="text-muted" />
        </span>
      ),
    },
    {
      key: "late",
      title: "После срока",
      width: "148px",
      align: "right",
      sort: (a, b) => a.late - b.late,
      render: (row) => <Num value={row.late} />,
    },
  ];
  if (pointsOn) {
    columns.push({
      key: "points",
      title: "Очки",
      width: "72px",
      align: "right",
      sort: (a, b) => a.points - b.points,
      render: (row) => <Num value={row.points} signed tone={pointsTone(row.points)} />,
    });
  }

  return (
    <div className="flex flex-col gap-5 transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined} data-testid="desk-reports-period">
      <DeskHero
        testId="desk-period-hero"
        value={percentText(t.submit_rate)}
        tone={rateTone(t.submit_rate)}
        title="отчётов сдано"
        sub={`сдали ${t.submitted} · не сдали ${t.missed} · ${rangeText(period.from, period.to)}`}
        facts={[
          { key: "handed", value: t.handed_over, label: "сдано задач" },
          { key: "closed", value: t.closed, label: "принято", tone: "gold" },
          { key: "hours", value: Math.round(t.hours_total), label: "часов" },
        ]}
        aside={<DayColumns days={period.days} now={now} />}
      />
      <div ref={box}>
        <DataGrid
          aria-label="Сотрудники за период"
          columns={columns.filter((column) => width === 0 || width >= (ROOM[column.key] ?? 0))}
          rows={rows}
          rowKey={(row) => row.user_id}
          empty={<EmptyState title="За этот период отчитываться было некому" hint="Отчёты сдают сотрудники с первого рабочего дня" />}
        />
      </div>
      <p className="-mt-2 px-1 text-[12px] leading-4 text-muted">Часы — в среднем за сданный день; задачи — сдано / принято; после срока — сданные позже дедлайна</p>
    </div>
  );
}
