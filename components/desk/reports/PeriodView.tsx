"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

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
import { compactYmd, daysBetween, parseYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { formatNum, pointsTone } from "@/lib/desk/format";

import { TileFace } from "../team/TeamGrid";
import { useBoxWidth } from "../team/shared";
import { LoadFailed, STEP } from "./DayView";
import { usePeriodMarks, type PeriodMarks } from "./marks";
import { AxisHead, axisOf, DayCells, minutesOfHm, PanelLine, ReportsHero, ReportsHeroBone, ShareBar, TimeBar, WeekGrid, Who } from "./parts";

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
const ROOM: Partial<Record<string, number>> = { total: 1130, late: 1080, left: 960, arrived: 900, count: 820, days: 560 };

const STRIP_H = 52;

/** Under two weeks — every weekday; longer — the Mondays' dates, so the labels never collide. */
function tick(date: string, count: number): string {
  if (count <= 14) return LETTERS[isoWeekday(date)];
  return isoWeekday(date) === 1 ? String(parseYmd(date)?.day ?? "") : "";
}

/**
 * The team's period day by day as thin columns (D-154, D-158, D-174): reports handed in from the
 * baseline in green, the missed ones on top in the red pencil, a gap between days and between both
 * — a picture of the rhythm in one line, never a wall of blocks. The columns grow from the baseline
 * as they arrive; the one under the mouse stays lit, the rest step back. Days off are dimmed; a day
 * says its numbers under the mouse and opens on a click.
 */
function DayColumns({ days, now, onDay }: { days: readonly Day[]; now: Date; onDay: (date: Ymd) => void }) {
  const max = Math.max(1, ...days.map((day) => day.submitted + day.missed));
  const n = days.length;
  const width = n <= 7 ? 22 : n <= 14 ? 16 : n <= 31 ? 10 : 5;
  const gap = n <= 14 ? 8 : n <= 31 ? 4 : 2;
  // the mouse's column is wider than the stroke drawn in it
  const bar = Math.max(3, Math.round(width * 0.55));
  const today = todayYmd(now);
  return (
    <div className="reports-strip" data-testid="desk-period-strip">
      <div className="reports-strip-plot" style={{ height: STRIP_H, gap }}>
        {days.map((day, index) => {
          const total = day.submitted + day.missed;
          const words = `${dayName(day.date, now)} · сдали ${day.submitted} · не сдали ${day.missed} · задач ${day.handed_over}`;
          return (
            <Tooltip key={day.date} label={words} side="bottom" className="flex h-full shrink-0">
              <button
                type="button"
                aria-label={`${dayName(day.date, now)}: сдали ${day.submitted}, не сдали ${day.missed}${day.workday ? "" : ", выходной"} — открыть день`}
                onClick={() => onDay(day.date)}
                className="reports-strip-col"
                style={{ width, "--bar": `${bar}px`, "--i": Math.min(index, 40) } as CSSProperties}
                data-day={day.date}
                data-off={day.workday ? undefined : ""}
                data-today={day.date === today ? "" : undefined}
              >
                {total === 0 ? (
                  <span className="reports-strip-nil" />
                ) : (
                  <>
                    {day.missed > 0 ? <span className="reports-strip-seg" data-tone="danger" style={{ height: `${(day.missed / max) * 100}%` }} /> : null}
                    {day.submitted > 0 ? <span className="reports-strip-seg" data-tone="ok" style={{ height: `${(day.submitted / max) * 100}%` }} /> : null}
                  </>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex" style={{ gap }} aria-hidden>
        {days.map((day) => (
          <span key={day.date} className="nums reports-strip-tick" data-today={day.date === today ? "" : undefined} style={{ width }}>
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
        className={`field nums flex h-8 items-center gap-1.5 px-2.5 text-[13px] leading-5 ${open ? "border-accent" : ""}`}
      >
        <span className="text-muted">{label}</span>
        {compactYmd(value, now)}
      </button>
      {open ? (
        <div className="desk-pop card absolute left-0 top-[calc(100%+6px)] z-20 w-[320px] p-3" style={{ boxShadow: "var(--shadow-raised)" }}>
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
        <div className="reports-stepper flex items-center gap-1">
          <button type="button" className={STEP} aria-label={`Предыдущий период: ${unit}`} title="Раньше (←)" onClick={() => onStep(-1)} data-testid="desk-period-prev">
            <Icon name="left" size={16} />
          </button>
          <span key={range.from} className="reports-stepper-title nums min-w-[136px] text-center text-[14px] font-semibold leading-5" data-testid="desk-period-dates">
            {rangeText(range.from, range.to)}
          </span>
          <button type="button" className={STEP} aria-label={`Следующий период: ${unit}`} title="Позже (→)" disabled={atToday} onClick={() => onStep(1)}>
            <Icon name="right" size={16} />
          </button>
          {atToday ? (
            <span className="ml-1 w-[76px] text-right text-[13px] leading-4 text-muted">по сегодня</span>
          ) : (
            <Tooltip label="Последние дни по сегодня" keys={["T"]}>
              <Button size="sm" variant="ghost" className="ml-1 !min-h-8 w-[76px] !justify-end !px-0" onClick={onToday}>
                По сегодня
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </>
  );
}

/** «9:05» of minutes of the day. */
function clock(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * One person's period in the right-hand panel (D-174): the face, the share handed in large with
 * its bar, the days as a calendar, the usual working day as a bar on the clock, then every column
 * of the table read top to bottom; the way to their last day and to the card.
 */
function PeriodPanel({ row, period, marks, onDay, now }: { row: TeamPeriodRow; period: TeamPeriod; marks: PeriodMarks | undefined; onDay: (date: Ymd) => void; now: Date }) {
  const tone = rateTone(row.submit_rate);
  const from = minutesOfHm(row.avg_arrived);
  const to = minutesOfHm(row.avg_left);
  const axis = axisOf([{ from, to }], [7 * 60, 21 * 60]);
  return (
    <article className="reports-doc flex flex-col gap-5 pr-8" data-testid="desk-period-panel">
      <header className="flex items-center gap-3.5">
        <TileFace person={{ id: row.user_id, full_name: row.full_name, avatar_url: row.avatar_url }} size={52} />
        <div className="min-w-0">
          <p className="reports-doc-name truncate">{row.full_name}</p>
          <p className="truncate text-[13px] leading-[18px] text-muted">{[row.position, rangeText(period.from, period.to)].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="nums reports-doc-figure" style={tone ? { color: TONE_VAR[tone] } : undefined}>
            {percentText(row.submit_rate)}
          </span>
          <span className="text-[13px] leading-[18px] text-muted">
            отчётов сдано · {row.submitted} из {row.submitted + row.missed}
          </span>
        </div>
        <ShareBar
          label={`Сдано ${row.submitted}, не сдано ${row.missed}`}
          parts={[
            { key: "in", value: row.submitted, label: "сдано", tone: "ok" },
            { key: "missed", value: row.missed, label: "пропущено", tone: "danger" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="reports-doc-label">По дням</h3>
        <WeekGrid days={period.days} marks={marks?.get(row.user_id)} today={todayYmd(now)} now={now} />
      </section>

      {from !== null && to !== null ? (
        <section className="reports-doc-day" aria-label="Обычный день">
          <h3 className="reports-doc-label">Обычный день · в среднем за сданные</h3>
          <dl className="reports-doc-times">
            <div>
              <dt>Приход</dt>
              <dd className="nums">{shortHm(row.avg_arrived)}</dd>
            </div>
            <div>
              <dt>Уход</dt>
              <dd className="nums">{shortHm(row.avg_left)}</dd>
            </div>
            <div>
              <dt>В день</dt>
              <dd className="nums">{row.avg_hours === null ? "—" : hoursText(row.avg_hours)}</dd>
            </div>
          </dl>
          <TimeBar axis={axis} from={from} to={to} size="doc" label={`Обычно с ${clock(from)} до ${clock(to)}`} />
          <AxisHead axis={axis} />
        </section>
      ) : null}

      <dl className="reports-lines">
        <PanelLine label="Часов всего">{row.hours_total ? hoursText(row.hours_total) : "—"}</PanelLine>
        <PanelLine label="Задач сдано · принято">
          {row.handed_over} · {row.closed}
        </PanelLine>
        <PanelLine label="В срок · после срока">
          {row.on_time} · <span style={row.late > 0 ? { color: TONE_VAR.danger } : undefined}>{row.late}</span>
        </PanelLine>
        <PanelLine label="Очки за отчёты">
          <span className={row.points > 0 ? "" : "text-muted"}>{formatNum(row.points, { signed: true })}</span>
        </PanelLine>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => onDay(period.to)}>
          Отчёт за {dayName(period.to, now).toLowerCase()}
        </Button>
        <Link href={`/desk/team/${row.user_id}`} className="reports-doc-link">
          Карточка сотрудника
          <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function PeriodBone() {
  return (
    <>
      <ReportsHeroBone bar={false} />
      <SkeletonGroup grow className="reports-bone-rows">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-[48px] items-center gap-5 px-3">
            <Bone round w={28} h={28} />
            <Bone h={14} w="18%" />
            <Bone h={14} w="6%" />
            <Bone h={12} w="20%" />
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
 * «Отчёты → Период» on the desk (D-152, D-154; wave 3, D-158; D-174): the total — the share of
 * reports, the work that moved, the days as thin columns (a click opens that day); the people as a
 * sortable table, the worst share first, each with their days as a line of cells — a row opens the
 * person's period in the panel.
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
  const marks = usePeriodMarks(period?.from ?? "", period?.to ?? "", Boolean(period));
  if (!period) return failed ? <LoadFailed onRetry={onRetry} /> : <PeriodBone />;
  const t = period.totals;
  const rows = period.rows.filter(filter).sort(byRate);
  const open = openId ? (period.rows.find((row) => row.user_id === openId) ?? null) : null;
  const today = todayYmd(now);
  const marksLoading = marks.isLoading || marks.isPlaceholderData;

  const columns: Column<TeamPeriodRow>[] = [
    {
      key: "who",
      title: "Сотрудник",
      width: "minmax(190px,1.3fr)",
      sort: byName,
      render: (row) => <Who id={row.user_id} name={row.full_name} avatar={row.avatar_url} sub={row.position} />,
    },
    {
      key: "rate",
      title: "Сдача",
      width: "64px",
      align: "right",
      sort: (a, b) => (a.submit_rate ?? -1) - (b.submit_rate ?? -1),
      render: (row) => {
        const tone = rateTone(row.submit_rate);
        return (
          <span className="nums font-medium" style={tone ? { color: TONE_VAR[tone] } : undefined}>
            {percentText(row.submit_rate)}
          </span>
        );
      },
    },
    {
      key: "days",
      title: "По дням",
      width: "minmax(120px,1fr)",
      render: (row) => <DayCells days={period.days} marks={marks.data?.get(row.user_id)} today={today} now={now} loading={marksLoading} />,
    },
    {
      key: "count",
      title: "Сдано",
      width: "84px",
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
      width: "68px",
      align: "right",
      sort: (a, b) => (a.avg_arrived ?? "~").localeCompare(b.avg_arrived ?? "~"),
      render: (row) => (row.avg_arrived ? <When>{shortHm(row.avg_arrived)}</When> : <span className="text-muted/40">—</span>),
    },
    {
      key: "left",
      title: "Уход",
      width: "60px",
      align: "right",
      sort: (a, b) => (a.avg_left ?? "").localeCompare(b.avg_left ?? ""),
      render: (row) => (row.avg_left ? <When>{shortHm(row.avg_left)}</When> : <span className="text-muted/40">—</span>),
    },
    {
      key: "hours",
      title: <span title="В среднем за сданный день">Часы в день</span>,
      width: "116px",
      align: "right",
      sort: (a, b) => (a.avg_hours ?? -1) - (b.avg_hours ?? -1),
      render: (row) => (row.avg_hours === null ? <span className="text-muted/40">—</span> : <span className="nums whitespace-nowrap">{hoursText(row.avg_hours)}</span>),
    },
    {
      key: "total",
      title: "Всего",
      width: "88px",
      align: "right",
      sort: (a, b) => a.hours_total - b.hours_total,
      render: (row) => (row.hours_total ? <span className="nums whitespace-nowrap text-muted">{hoursText(row.hours_total)}</span> : <span className="text-muted/40">—</span>),
    },
    {
      key: "tasks",
      title: <span title="Сдано / принято">Задачи</span>,
      width: "80px",
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
      width: "118px",
      align: "right",
      sort: (a, b) => a.late - b.late,
      render: (row) => <Num value={row.late} tone="danger" />,
    },
  ];
  if (pointsOn) {
    columns.push({
      key: "points",
      title: "Очки",
      width: "64px",
      align: "right",
      sort: (a, b) => a.points - b.points,
      render: (row) => <Num value={row.points} signed tone={pointsTone(row.points)} />,
    });
  }

  const rate = t.submit_rate === null ? null : Math.round(t.submit_rate * 100);
  return (
    <div className="reports-view flex flex-col gap-3.5" data-stale={stale ? "" : undefined} aria-busy={stale || undefined} data-testid="desk-reports-period">
      <ReportsHero
        testId="desk-period-hero"
        figure={rate === null ? { value: 0, empty: true } : { value: rate, suffix: "%", tone: rateTone(t.submit_rate) === "danger" ? "danger" : null }}
        title="отчётов сдано"
        sub={`сдали ${formatNum(t.submitted)} · не сдали ${formatNum(t.missed)} · ${rangeText(period.from, period.to)}`}
        notes={[
          { key: "handed", label: "Сдано задач", value: <Num value={t.handed_over} /> },
          { key: "closed", label: "Принято", value: <Num value={t.closed} /> },
          { key: "hours", label: "Часов", value: <Num value={Math.round(t.hours_total)} /> },
        ]}
        aside={<DayColumns days={period.days} now={now} onDay={onDay} />}
      />
      {filters}
      <div ref={box} className="reports-table">
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
          {open ? (
            <PeriodPanel row={open} period={period} marks={marks.data} onDay={onDay} now={now} />
          ) : (
            <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот период.</p>
          )}
        </InPanel>
      ) : null}
    </div>
  );
}
