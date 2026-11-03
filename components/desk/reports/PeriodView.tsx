"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { useDismiss } from "@/components/ui/datetime/PickerShell";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, dayName, hoursText, isoWeekday, PERIOD_MAX_DAYS, percentText, rangeText, shortHm, type PeriodKind } from "@/lib/daily-report/format";
import type { TeamPeriod, TeamPeriodRow } from "@/lib/daily-report/types";
import { compactYmd, daysBetween, parseYmd, type Ymd } from "@/lib/datetime/calendar";
import { formatNum, pointsTone } from "@/lib/desk/format";

import { DeskHero, HeroBone } from "../team/Hero";
import { useBoxWidth } from "../team/shared";
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
function DayColumns({ days, now, onDay }: { days: readonly Day[]; now: Date; onDay: (date: Ymd) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((day) => day.submitted + day.missed));
  const n = days.length;
  const width = n <= 7 ? 22 : n <= 14 ? 16 : n <= 31 ? 10 : 5;
  const gap = n <= 14 ? 8 : n <= 31 ? 4 : 2;
  const chosen = days.find((day) => day.date === hover) ?? null;
  // a fixed width: the line under the columns changes with the hovered day, the columns must not move under the mouse
  const box = Math.max(n * width + (n - 1) * gap, 240);
  return (
    <div className="flex flex-col gap-1.5" style={{ width: box }} data-testid="desk-period-strip" onMouseLeave={() => setHover(null)}>
      <div className="flex items-end border-b border-border" style={{ height: STRIP_H, gap }}>
        {days.map((day) => {
          const total = day.submitted + day.missed;
          return (
            <button
              key={day.date}
              type="button"
              aria-label={`${dayName(day.date, now)}: сдали ${day.submitted}, не сдали ${day.missed}${day.workday ? "" : ", выходной"} — открыть день`}
              onMouseEnter={() => setHover(day.date)}
              onFocus={() => setHover(day.date)}
              onClick={() => onDay(day.date)}
              className="flex h-full shrink-0 cursor-pointer flex-col justify-end gap-[2px] rounded-t-[3px] transition-opacity duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              style={{ width, opacity: hover && hover !== day.date ? 0.45 : day.workday ? 1 : 0.45 }}
              data-day={day.date}
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
            </button>
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
      <p className="nums h-[36px] text-[12px] leading-[18px] text-muted" aria-live="polite">
        {chosen ? (
          <>
            <span className="block truncate text-text">{dayName(chosen.date, now)} — щелчок откроет день</span>
            <span className="block truncate">
              сдали {chosen.submitted} · не сдали {chosen.missed} · задач {chosen.handed_over}
            </span>
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

const STEP =
  "flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-2/60 text-text transition-colors duration-[120ms] hover:border-muted/50 disabled:pointer-events-none disabled:opacity-35";

/**
 * The kind of the period and its stretch — the period's own controls beside the tabs: a week or a
 * month steps back and forth (‹ ›, ← →) and comes back to today (T); «Свой» — two calendars.
 */
export function PeriodControls({
  kind,
  onKind,
  range,
  onRange,
  onStep,
  atToday,
  onToday,
  today,
  now,
}: {
  kind: PeriodKind;
  onKind: (kind: PeriodKind) => void;
  range: { from: Ymd; to: Ymd };
  onRange: (range: { from: Ymd; to: Ymd }) => void;
  onStep: (dir: -1 | 1) => void;
  atToday: boolean;
  onToday: () => void;
  today: Ymd;
  now: Date;
}) {
  const unit = kind === "month" ? "месяц" : "неделя";
  return (
    <>
      <SegmentTabs aria-label="Период" value={kind} onChange={onKind} items={KINDS} />
      {kind === "custom" ? (
        <RangePicker range={range} today={today} now={now} onRange={onRange} />
      ) : (
        <div className="flex items-center gap-1.5">
          <button type="button" className={STEP} aria-label={`Предыдущий период: ${unit}`} title="Раньше (←)" onClick={() => onStep(-1)} data-testid="desk-period-prev">
            <Icon name="left" size={16} />
          </button>
          <span className="nums min-w-[132px] px-1 text-center font-display text-[14px] font-semibold leading-5" data-testid="desk-period-dates">
            {rangeText(range.from, range.to)}
          </span>
          <button type="button" className={STEP} aria-label={`Следующий период: ${unit}`} title="Позже (→)" disabled={atToday} onClick={() => onStep(1)}>
            <Icon name="right" size={16} />
          </button>
          {atToday ? (
            <span className="ml-1 text-[13px] font-semibold leading-4 text-accent">по сегодня</span>
          ) : (
            <Tooltip label="Последние дни по сегодня" keys={["T"]}>
              <Button size="sm" variant="ghost" onClick={onToday}>
                По сегодня
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </>
  );
}

function PanelFact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col-reverse rounded-[10px] bg-surface-2/60 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="nums font-display text-[17px] font-semibold leading-[22px]">{children}</dd>
    </div>
  );
}

/**
 * One person's period in the right-hand panel: every column of the table, even those a narrow
 * window has put aside, read top to bottom — the share and the days, the hours, the tasks, the
 * points; then the way to their last day and to the card.
 */
function PeriodPanel({ row, period, onDay, now }: { row: TeamPeriodRow; period: TeamPeriod; onDay: (date: Ymd) => void; now: Date }) {
  const tone = rateTone(row.submit_rate);
  return (
    <div className="flex flex-col gap-5 pr-8" data-testid="desk-period-panel">
      <div className="flex items-center gap-3">
        <Avatar name={row.full_name} size={40} />
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-semibold leading-[22px]">{row.full_name}</p>
          <p className="truncate text-[13px] leading-[18px] text-muted">{[row.position, rangeText(period.from, period.to)].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="nums font-display text-[32px] font-bold leading-9 tracking-[-0.03em]" style={{ color: tone ? TONE_VAR[tone] : "var(--text-muted)" }}>
          {percentText(row.submit_rate)}
        </span>
        <span className="text-[13px] leading-[18px] text-muted">
          отчётов сдано · {row.submitted} из {row.submitted + row.missed}
          {row.missed > 0 ? <span style={{ color: TONE_VAR.danger }}> · пропущено {row.missed}</span> : null}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <PanelFact label="Приход, в среднем">{row.avg_arrived ? shortHm(row.avg_arrived) : "—"}</PanelFact>
        <PanelFact label="Уход, в среднем">{row.avg_left ? shortHm(row.avg_left) : "—"}</PanelFact>
        <PanelFact label="Часов в день">{row.avg_hours === null ? "—" : hoursText(row.avg_hours)}</PanelFact>
        <PanelFact label="Часов всего">{row.hours_total ? hoursText(row.hours_total) : "—"}</PanelFact>
        <PanelFact label="Задач сдано · принято">
          {row.handed_over} · {row.closed}
        </PanelFact>
        <PanelFact label="В срок · после срока">
          {row.on_time} · <span style={row.late > 0 ? { color: TONE_VAR.warn } : undefined}>{row.late}</span>
        </PanelFact>
        <PanelFact label="Очки за отчёты" wide>
          <span style={{ color: row.points > 0 ? TONE_VAR[pointsTone(row.points)] : "var(--text-muted)" }}>{formatNum(row.points, { signed: true })}</span>
        </PanelFact>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onDay(period.to)}>
          Отчёт за {dayName(period.to, now).toLowerCase()}
        </Button>
        <Link href={`/desk/team/${row.user_id}`} className="text-[13px] font-semibold leading-4 text-accent hover:underline">
          Карточка сотрудника →
        </Link>
      </div>
    </div>
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
 * «Отчёты → Период» on the desk (D-152, D-154; wave 3): the hero — the share of reports in its
 * tone, the work that moved, the days as thin columns (a click opens that day); the people as a
 * sortable table, the worst share first — a row opens the person's period in the panel.
 */
export function PeriodView({
  period,
  stale,
  failed,
  onRetry,
  filter,
  filters,
  narrowed,
  onClear,
  selectedId,
  openId,
  onSelect,
  onOpen,
  onClose,
  onDay,
  pointsOn,
  now,
}: {
  period: TeamPeriod | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  filter: (row: TeamPeriodRow) => boolean;
  /** The people's filters over the table (who, the words). */
  filters: ReactNode;
  narrowed: boolean;
  onClear: () => void;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onDay: (date: Ymd) => void;
  pointsOn: boolean;
  now: Date;
}) {
  const [box, width] = useBoxWidth();
  if (!period) return failed ? <LoadFailed onRetry={onRetry} /> : <PeriodBone />;
  const t = period.totals;
  const rows = period.rows.filter(filter).sort(byRate);
  const open = openId ? (period.rows.find((row) => row.user_id === openId) ?? null) : null;

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
        aside={<DayColumns days={period.days} now={now} onDay={onDay} />}
      />
      {filters}
      <div ref={box}>
        <DataGrid
          aria-label="Сотрудники за период"
          columns={columns.filter((column) => width === 0 || width >= (ROOM[column.key] ?? 0))}
          rows={rows}
          rowKey={(row) => row.user_id}
          selectedKey={selectedId}
          onSelect={(row) => onSelect(row.user_id)}
          onActivate={(row) => onOpen(row.user_id)}
          onRowClick={(row) => onOpen(row.user_id)}
          empty={
            narrowed ? (
              <EmptyState
                title="Никого не нашлось"
                hint="Поиск — по имени и должности; «С пропусками» — над таблицей"
                action={
                  <Button size="sm" variant="secondary" onClick={onClear}>
                    Показать всех
                  </Button>
                }
              />
            ) : (
              <EmptyState title="За этот период отчитываться было некому" hint="Отчёты сдают сотрудники с первого рабочего дня" />
            )
          }
        />
      </div>
      <p className="-mt-2 px-1 text-[12px] leading-4 text-muted">
        Часы — в среднем за сданный день; задачи — сдано / принято; после срока — сданные позже дедлайна. Столбик дня — открыть этот день
      </p>
      {openId ? (
        <InPanel panelKey={`report-period:${openId}`} onClose={onClose}>
          {open ? <PeriodPanel row={open} period={period} onDay={onDay} now={now} /> : <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот период.</p>}
        </InPanel>
      ) : null}
    </div>
  );
}
