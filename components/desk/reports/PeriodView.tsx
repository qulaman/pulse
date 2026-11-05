"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
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
import { LoadFailed, STEP } from "./DayView";

type Day = TeamPeriod["days"][number];

/** A share of reports in ink (D-152, D-158): print while most days are in, the red pencil when many are missed. */
function rateTone(rate: number | null | undefined): Tone | null {
  return rate === null || rate === undefined || rate >= 0.6 ? null : "danger";
}

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Свой" },
];

const LETTERS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** Below this width of the table the column steps aside — the least needed first (a narrow window, the panel open). */
const ROOM: Partial<Record<string, number>> = { total: 1000, late: 920, left: 840, arrived: 780, count: 700 };

const STRIP_H = 44;

/** Under two weeks — every weekday; longer — the Mondays' dates, so the labels never collide. */
function tick(date: string, count: number): string {
  if (count <= 14) return LETTERS[isoWeekday(date)];
  return isoWeekday(date) === 1 ? String(parseYmd(date)?.day ?? "") : "";
}

/**
 * The team's period day by day as thin columns (D-154, D-158): reports handed in from the baseline
 * in print, the missed ones on top in the red pencil, a gap between days and between both — a
 * picture of the rhythm in one line of the sheet, never a wall of blocks. Days off are dimmed; a
 * day says its numbers under the mouse.
 */
function DayColumns({ days, now, onDay }: { days: readonly Day[]; now: Date; onDay: (date: Ymd) => void }) {
  const max = Math.max(1, ...days.map((day) => day.submitted + day.missed));
  const n = days.length;
  const width = n <= 7 ? 22 : n <= 14 ? 16 : n <= 31 ? 10 : 5;
  const gap = n <= 14 ? 8 : n <= 31 ? 4 : 2;
  // the mouse's column is wider than the stroke drawn in it
  const bar = Math.max(4, Math.round(width * 0.55));
  return (
    <div className="flex flex-col gap-1" data-testid="desk-period-strip">
      <div className="flex items-end border-b border-text" style={{ height: STRIP_H, gap }}>
        {days.map((day) => {
          const total = day.submitted + day.missed;
          const words = `${dayName(day.date, now)} · сдали ${day.submitted} · не сдали ${day.missed} · задач ${day.handed_over}`;
          return (
            <Tooltip key={day.date} label={words} side="bottom" className="flex h-full shrink-0">
              <button
                type="button"
                aria-label={`${dayName(day.date, now)}: сдали ${day.submitted}, не сдали ${day.missed}${day.workday ? "" : ", выходной"} — открыть день`}
                onClick={() => onDay(day.date)}
                className="flex h-full shrink-0 cursor-pointer flex-col justify-end gap-px hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                style={{ width, opacity: day.workday ? undefined : 0.45 }}
                data-day={day.date}
              >
                {total === 0 ? null : (
                  <>
                    {day.missed > 0 ? <span className="block self-center" style={{ width: bar, height: `${(day.missed / max) * 100}%`, background: TONE_VAR.danger }} /> : null}
                    {day.submitted > 0 ? <span className="block self-center" style={{ width: bar, height: `${(day.submitted / max) * 100}%`, background: TONE_VAR.ok }} /> : null}
                  </>
                )}
              </button>
            </Tooltip>
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
        className={`field nums flex h-8 items-center gap-1.5 px-2 text-[14px] leading-5 ${open ? "border-accent" : ""}`}
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
        <div className="flex items-center gap-1">
          <button type="button" className={STEP} aria-label={`Предыдущий период: ${unit}`} title="Раньше (←)" onClick={() => onStep(-1)} data-testid="desk-period-prev">
            <Icon name="left" size={16} />
          </button>
          <span className="nums min-w-[132px] text-center text-[14px] leading-5" data-testid="desk-period-dates">
            {rangeText(range.from, range.to)}
          </span>
          <button type="button" className={STEP} aria-label={`Следующий период: ${unit}`} title="Позже (→)" disabled={atToday} onClick={() => onStep(1)}>
            <Icon name="right" size={16} />
          </button>
          {atToday ? (
            <span className="ml-1 w-[72px] text-right text-[13px] leading-4 text-muted">по сегодня</span>
          ) : (
            <Tooltip label="Последние дни по сегодня" keys={["T"]}>
              <Button size="sm" variant="ghost" className="ml-1 !min-h-8 w-[72px] !justify-end !px-0" onClick={onToday}>
                По сегодня
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </>
  );
}

function PanelFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-baseline justify-between gap-3 py-[7px]">
      <dt className="text-[14px] leading-5 text-muted">{label}</dt>
      <dd className="nums text-[14px] leading-5">{children}</dd>
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
    <div className="flex flex-col gap-4 pr-8" data-testid="desk-period-panel">
      <div className="min-w-0">
        <p className="desk-figure truncate text-[22px] leading-7">{row.full_name}</p>
        <p className="truncate text-[13px] leading-[18px] text-muted">{[row.position, rangeText(period.from, period.to)].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="nums desk-figure text-[32px] leading-9" style={tone ? { color: TONE_VAR[tone] } : undefined}>
          {percentText(row.submit_rate)}
        </span>
        <span className="text-[13px] leading-[18px] text-muted">
          отчётов сдано · {row.submitted} из {row.submitted + row.missed}
          {row.missed > 0 ? <span style={{ color: TONE_VAR.danger }}> · пропущено {row.missed}</span> : null}
        </span>
      </div>
      <dl className="desk-list">
        <PanelFact label="Приход, в среднем">{row.avg_arrived ? shortHm(row.avg_arrived) : "—"}</PanelFact>
        <PanelFact label="Уход, в среднем">{row.avg_left ? shortHm(row.avg_left) : "—"}</PanelFact>
        <PanelFact label="Часов в день">{row.avg_hours === null ? "—" : hoursText(row.avg_hours)}</PanelFact>
        <PanelFact label="Часов всего">{row.hours_total ? hoursText(row.hours_total) : "—"}</PanelFact>
        <PanelFact label="Задач сдано · принято">
          {row.handed_over} · {row.closed}
        </PanelFact>
        <PanelFact label="В срок · после срока">
          {row.on_time} · <span style={row.late > 0 ? { color: TONE_VAR.danger } : undefined}>{row.late}</span>
        </PanelFact>
        <PanelFact label="Очки за отчёты">
          <span className={row.points > 0 ? "" : "text-muted"}>{formatNum(row.points, { signed: true })}</span>
        </PanelFact>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onDay(period.to)}>
          Отчёт за {dayName(period.to, now).toLowerCase()}
        </Button>
        <Link href={`/desk/team/${row.user_id}`} className="text-[13px] leading-4 text-muted hover:text-text">
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
      <SkeletonGroup grow className="desk-list">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-[34px] items-center gap-6">
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
 * «Отчёты → Период» on the desk (D-152, D-154; wave 3, D-158): the total — the share of reports,
 * the work that moved, the days as thin columns (a click opens that day); the people as a sortable
 * table, the worst share first — a row opens the person's period in the panel.
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
      render: (row) => <span className="block truncate">{row.full_name}</span>,
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
          <span className="nums" style={tone ? { color: TONE_VAR[tone] } : undefined}>
            {percentText(row.submit_rate)}
          </span>
        );
      },
    },
    {
      key: "count",
      title: "Сдал",
      width: "96px",
      align: "right",
      sort: (a, b) => a.submitted - b.submitted,
      render: (row) => (
        <span className="nums whitespace-nowrap text-muted">
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
      render: (row) => (row.avg_arrived ? <When>{shortHm(row.avg_arrived)}</When> : <span className="text-muted/40">—</span>),
    },
    {
      key: "left",
      title: "Уход",
      width: "72px",
      align: "right",
      sort: (a, b) => (a.avg_left ?? "").localeCompare(b.avg_left ?? ""),
      render: (row) => (row.avg_left ? <When>{shortHm(row.avg_left)}</When> : <span className="text-muted/40">—</span>),
    },
    {
      key: "hours",
      title: <span title="В среднем за сданный день">Часы в день</span>,
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
      title: <span title="Сдано / принято">Задачи</span>,
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
      title: <span title="Сданные позже дедлайна">После срока</span>,
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
    <div className="flex flex-col gap-3.5 transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined} data-testid="desk-reports-period">
      <DeskHero
        testId="desk-period-hero"
        value={percentText(t.submit_rate)}
        tone={rateTone(t.submit_rate)}
        title="отчётов сдано"
        sub={`сдали ${t.submitted} · не сдали ${t.missed} · ${rangeText(period.from, period.to)}`}
        facts={[
          { key: "handed", value: t.handed_over, label: "сдано задач" },
          { key: "closed", value: t.closed, label: "принято" },
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
      {openId ? (
        <InPanel panelKey={`report-period:${openId}`} onClose={onClose}>
          {open ? <PeriodPanel row={open} period={period} onDay={onDay} now={now} /> : <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот период.</p>}
        </InPanel>
      ) : null}
    </div>
  );
}
