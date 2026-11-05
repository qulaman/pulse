"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import {
  activityLine,
  addDaysYmd,
  dayTitle,
  durationText,
  hoursText,
  personDayLine,
  pointsText,
  STATE_TITLE,
  taskMeta,
  timeOf,
} from "@/lib/daily-report/format";
import type { TeamDay, TeamDayRow, TeamDayState } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";

import { DeskHero, HeroBone } from "../team/Hero";
import { useBoxWidth } from "../team/shared";

/** Below this width of the table the column steps aside — «Чем занимался» first: the panel says it whole. */
const ROOM: Partial<Record<string, number>> = { summary: 860, hours: 640 };

/** Who the director reads first on the desk: those who owe the report, then the rest (D-154). */
const DESK_ORDER: TeamDayState[] = ["missed", "pending", "submitted", "away", "off"];
const GROUP_TONE: Record<TeamDayState, Tone> = { missed: "danger", pending: "muted", submitted: "ok", away: "muted", off: "muted" };

/** The ink of a day's figure: a missed report is the red pencil; anything else is print. */
function dayTone(day: TeamDay): Tone | null {
  return day.workday && day.totals.missed > 0 ? "danger" : null;
}

/** The first line of «Чем занимался» — the row's words; the rest is in the panel. */
function firstLine(text: string | null | undefined): string {
  return (text ?? "").split(/\n/).find((line) => line.trim())?.trim() ?? "";
}

/** A step back or forth: a chevron on the sheet, no box. */
export const STEP = "flex h-8 w-8 items-center justify-center rounded-[2px] text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35";

/** ‹ Вторник, 3 ноября › — the day; tomorrow is not a day yet; ← and → step too. */
export function DayStepper({ date, today, onDate }: { date: Ymd; today: Ymd; onDate: (date: Ymd) => void }) {
  const isToday = date === today;
  return (
    <div className="flex items-center gap-1" data-testid="desk-day-stepper">
      <button type="button" className={STEP} aria-label="Предыдущий день" title="Предыдущий день (←)" onClick={() => onDate(addDaysYmd(date, -1))}>
        <Icon name="left" size={16} />
      </button>
      <span className="min-w-[164px] text-center text-[14px] font-semibold leading-5" data-testid="desk-day-title">
        {dayTitle(date)}
      </span>
      <button type="button" className={STEP} aria-label="Следующий день" title="Следующий день (→)" disabled={isToday} onClick={() => onDate(addDaysYmd(date, 1))}>
        <Icon name="right" size={16} />
      </button>
      {isToday ? (
        <span className="ml-1 w-[72px] text-right text-[13px] leading-4 text-muted">сегодня</span>
      ) : (
        <Tooltip label="К сегодня" keys={["T"]}>
          <Button size="sm" variant="ghost" className="ml-1 !min-h-8 w-[72px] !justify-end !px-0" onClick={() => onDate(today)}>
            К сегодня
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

/** The total of a day: «6 из 9 сдали отчёт», who did not, and how much work moved; the table under it says who is who. */
function DayHero({ day }: { day: TeamDay }) {
  const t = day.totals;
  const away = t.away > 0 ? `${t.away} в отпуске и на больничном` : null;
  const when = !day.workday ? "не рабочий день — отчёт по желанию, без очков" : day.today ? (t.pending > 0 ? "сегодня — день ещё идёт" : "сегодня") : "итог дня";
  return (
    <DeskHero
      testId="desk-day-hero"
      value={t.submitted}
      tone={null}
      title={day.workday ? `из ${t.team} сдали отчёт` : "сдали в выходной"}
      sub={[when, away].filter(Boolean).join(" · ")}
      facts={[
        ...(t.missed > 0 ? [{ key: "missed", value: t.missed, label: "не сдали", tone: dayTone(day) }] : []),
        { key: "handed", value: t.handed_over, label: "сдано задач" },
        { key: "closed", value: t.closed, label: "принято" },
      ]}
    />
  );
}

/** What stands in «Чем занимался» for a person without words: the state, quietly. */
function Summary({ row }: { row: TeamDayRow }) {
  const line = row.report?.status === "submitted" ? firstLine(row.report.summary) : "";
  if (line) {
    return (
      <span className="block truncate text-muted" title={row.report?.summary ?? undefined}>
        {line}
      </span>
    );
  }
  if (row.state === "missed") {
    return (
      <span className="block truncate" style={{ color: TONE_VAR.danger }}>
        {personDayLine(row)}
      </span>
    );
  }
  return <span className="block truncate text-muted/60">{personDayLine(row)}</span>;
}

/** A time of the report, or a quiet dash. */
function At({ iso }: { iso: string | null | undefined }) {
  const text = timeOf(iso);
  return text ? <When>{text}</When> : <span className="text-muted/40">—</span>;
}

/** The whole report of one person in the right-hand panel: the times, the words, the day's tasks, what they did in the tasks. */
function ReportPanel({ row }: { row: TeamDayRow }) {
  const report = row.report?.status === "submitted" ? row.report : null;
  const length = report ? durationText(report.arrived_at, report.left_at) : null;
  const facts: [string, ReactNode][] = report
    ? [
        ["Пришёл", timeOf(report.arrived_at) || "—"],
        ["Ушёл", timeOf(report.left_at) || "—"],
        ["На работе", length ?? (hoursText(row.hours) || "—")],
      ]
    : [];
  const points = row.report ? pointsText(row.report.points) : "";
  const state =
    row.state === "submitted"
      ? `Сдал отчёт в ${timeOf(report?.submitted_at)}`
      : row.state === "pending"
        ? "Ещё не сдал отчёт"
        : row.state === "missed"
          ? "Не сдал отчёт"
          : personDayLine(row).replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="flex flex-col gap-4 pr-8" data-testid="desk-report-panel">
      <div className="min-w-0">
        <p className="desk-figure truncate text-[22px] leading-7">{row.full_name}</p>
        <p className="truncate text-[13px] leading-[18px]" style={{ color: TONE_VAR[GROUP_TONE[row.state]] }}>
          {state}
          {points ? <span style={{ color: TONE_VAR[pointsTone(row.report?.points ?? 0)] }}> · {points}</span> : null}
        </p>
      </div>
      {facts.length ? (
        <dl className="grid grid-cols-3 divide-x divide-border">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse px-3 py-0.5 first:pl-0">
              <dt className="text-[12px] leading-4 text-muted">{label}</dt>
              <dd className="nums desk-figure text-[22px] leading-[26px]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <section className="flex flex-col gap-1">
        <SectionLabel>Чем занимался</SectionLabel>
        {report?.summary ? (
          <p className="whitespace-pre-wrap text-[14px] leading-[21px]">{report.summary}</p>
        ) : (
          <p className="text-[14px] leading-5 text-muted">{row.state === "pending" ? "Отчёт ещё не сдан" : personDayLine(row)}</p>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <SectionLabel count={row.tasks.length}>Задачи дня</SectionLabel>
        {row.tasks.length === 0 ? (
          <p className="text-[14px] leading-5 text-muted">Сданных и принятых нет</p>
        ) : (
          <ul className="desk-list">
            {row.tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/desk/tasks?id=${task.id}`} className="flex min-h-[34px] items-center gap-2.5 hover:bg-surface-2/55" title={taskMeta(task)}>
                  <StatusGlyph status={task.status} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-5">{task.title}</span>
                  <span className="max-w-[40%] shrink-0 truncate text-[13px] leading-5 text-muted">{taskMeta(task)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <SectionLabel>В задачах за день</SectionLabel>
        <p className="text-[14px] leading-5 text-muted">{activityLine(row.activity)}</p>
      </section>
      <Link href={`/desk/team/${row.user_id}`} className="self-start text-[13px] leading-4 text-muted hover:text-text">
        Карточка сотрудника →
      </Link>
    </div>
  );
}

/** The day while it loads: the hero's height and the rows', nothing jumps when they land. */
function DayBone() {
  return (
    <>
      <HeroBone />
      <SkeletonGroup grow className="desk-list">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-[34px] items-center gap-6">
            <Bone h={14} w="22%" />
            <Bone h={14} w="8%" />
            <Bone h={14} w="8%" />
            <Bone h={14} w="40%" />
          </div>
        ))}
      </SkeletonGroup>
    </>
  );
}

export function LoadFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      title="Не получилось загрузить отчёты"
      hint="Проверьте связь и попробуйте ещё раз"
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        ) : null
      }
    />
  );
}

/**
 * «Отчёты → День» on the desk (D-152, D-154, D-158): the total — how many handed the report in,
 * how many did not, how much work moved; the people as one table, 34 px a row, those who owe the
 * report first; a row opens the whole report in the right-hand panel (`?p=`).
 */
export function DayView({
  day,
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
  pointsOn,
}: {
  day: TeamDay | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Who of the day's people the filters above let through. */
  filter: (row: TeamDayRow) => boolean;
  /** The people's filters over the table (who, the words). */
  filters: ReactNode;
  narrowed: boolean;
  onClear: () => void;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  pointsOn: boolean;
}) {
  const [box, width] = useBoxWidth();
  if (!day) return failed ? <LoadFailed onRetry={onRetry} /> : <DayBone />;

  const shown = day.rows.filter(filter);
  const groups: Group<TeamDayRow>[] = DESK_ORDER.map((state) => ({
    key: state,
    title: STATE_TITLE[state],
    tone: GROUP_TONE[state],
    rows: shown.filter((row) => row.state === state),
  }));
  const open = openId ? (day.rows.find((row) => row.user_id === openId) ?? null) : null;

  const columns: Column<TeamDayRow>[] = [
    {
      key: "who",
      title: "Кто",
      width: "minmax(160px,1.1fr)",
      sort: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
      render: (row) => <span className={`block truncate ${row.state === "away" || row.state === "off" ? "text-muted" : ""}`}>{row.full_name}</span>,
    },
    {
      key: "arrived",
      title: "Пришёл",
      width: "84px",
      sort: (a, b) => (a.report?.arrived_at ?? "~").localeCompare(b.report?.arrived_at ?? "~"),
      render: (row) => <At iso={row.report?.status === "submitted" ? row.report.arrived_at : null} />,
    },
    {
      key: "left",
      title: "Ушёл",
      width: "72px",
      sort: (a, b) => (a.report?.left_at ?? "").localeCompare(b.report?.left_at ?? ""),
      render: (row) => <At iso={row.report?.status === "submitted" ? row.report.left_at : null} />,
    },
    {
      key: "hours",
      title: "Часы",
      width: "72px",
      align: "right",
      sort: (a, b) => (a.hours ?? -1) - (b.hours ?? -1),
      // hours come with a handed-in report only
      render: (row) =>
        row.hours === null || row.report?.status !== "submitted" ? <span className="text-muted/40">—</span> : <span className="nums">{hoursText(row.hours)}</span>,
    },
    {
      key: "tasks",
      title: "Задачи",
      width: "80px",
      align: "right",
      sort: (a, b) => a.tasks.length - b.tasks.length,
      render: (row) => <Num value={row.tasks.length} />,
    },
    // the words give way first when the panel narrows the screen
    { key: "summary", title: "Чем занимался", width: "minmax(0,2fr)", render: (row) => <Summary row={row} /> },
  ];
  if (pointsOn) {
    columns.push({
      key: "points",
      title: "Очки",
      width: "72px",
      align: "right",
      sort: (a, b) => (a.report?.points ?? 0) - (b.report?.points ?? 0),
      render: (row) => (row.report ? <Num value={row.report.points} signed tone={pointsTone(row.report.points)} /> : <span className="text-muted/40">—</span>),
    });
  }

  return (
    <div className="flex flex-col gap-3.5 transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined} data-testid="desk-reports-day">
      <DayHero day={day} />
      {filters}
      <div ref={box}>
        <DataGrid
          aria-label="Отчёты за день"
          columns={columns.filter((column) => width === 0 || width >= (ROOM[column.key] ?? 0))}
          groups={groups}
          rowKey={(row) => row.user_id}
          selectedKey={selectedId}
          onSelect={(row) => onSelect(row.user_id)}
          onActivate={(row) => onOpen(row.user_id)}
          onRowClick={(row) => onOpen(row.user_id)}
          empty={
            narrowed ? (
              <EmptyState
                title="Никого не нашлось"
                hint="Поиск — по имени и должности; «Без отчёта» и «Сдали» — над таблицей"
                action={
                  <Button size="sm" variant="secondary" onClick={onClear}>
                    Показать всех
                  </Button>
                }
              />
            ) : (
              <EmptyState title="В команде пока никого" hint="Отчёты сдают сотрудники — появятся, когда в команде будут люди" />
            )
          }
        />
      </div>
      {openId ? (
        <InPanel panelKey={`report:${openId}`} onClose={onClose}>
          {open ? <ReportPanel row={open} /> : <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот день.</p>}
        </InPanel>
      ) : null}
    </div>
  );
}
