"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
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

/** Who the director reads first on the desk: those who owe the report, then the rest (D-154). */
const DESK_ORDER: TeamDayState[] = ["missed", "pending", "submitted", "away", "off"];
const GROUP_TONE: Record<TeamDayState, Tone> = { missed: "danger", pending: "muted", submitted: "ok", away: "muted", off: "muted" };

/** The tone of a day: a missed report is the alarm; all in — calm green; a day still running says nothing yet. */
export function dayTone(day: TeamDay | undefined): Tone | null {
  if (!day) return null;
  const t = day.totals;
  if (!day.workday) return "muted";
  if (t.missed > 0) return "danger";
  if (t.pending === 0 && t.submitted > 0) return "ok";
  return null;
}

/** The first line of «Чем занимался» — the row's words; the rest is in the panel. */
function firstLine(text: string | null | undefined): string {
  return (text ?? "").split(/\n/).find((line) => line.trim())?.trim() ?? "";
}

const STEP =
  "flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-2/60 text-text transition-colors duration-[120ms] hover:border-muted/50 disabled:pointer-events-none disabled:opacity-35";

/** ‹ Вторник, 3 ноября › — the day; tomorrow is not a day yet; ← and → step too. */
export function DayStepper({ date, today, onDate }: { date: Ymd; today: Ymd; onDate: (date: Ymd) => void }) {
  const isToday = date === today;
  return (
    <div className="flex items-center gap-1.5" data-testid="desk-day-stepper">
      <button type="button" className={STEP} aria-label="Предыдущий день" title="Предыдущий день (←)" onClick={() => onDate(addDaysYmd(date, -1))}>
        <Icon name="left" size={16} />
      </button>
      <span className="min-w-[188px] px-1 text-center font-display text-[15px] font-semibold leading-5" data-testid="desk-day-title">
        {dayTitle(date)}
      </span>
      <button type="button" className={STEP} aria-label="Следующий день" title="Следующий день (→)" disabled={isToday} onClick={() => onDate(addDaysYmd(date, 1))}>
        <Icon name="right" size={16} />
      </button>
      {isToday ? (
        <span className="ml-1 text-[13px] font-semibold leading-4 text-accent">сегодня</span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onDate(today)}>
          К сегодня
        </Button>
      )}
    </div>
  );
}

/**
 * The bar of the day, honest: handed in — green, missed — red, away — grey, and what is still
 * due stays the empty track; an empty day is a bare track, never a bar filled to the end.
 */
function DayBar({ day }: { day: TeamDay }) {
  const t = day.totals;
  const total = Math.max(1, t.team);
  const due = Math.max(0, t.team - t.submitted - t.missed - t.away);
  const parts: { key: string; n: number; paint: string; label: string }[] = [
    { key: "submitted", n: t.submitted, paint: TONE_VAR.ok, label: "сдали" },
    { key: "missed", n: t.missed, paint: TONE_VAR.danger, label: "не сдали" },
    { key: "away", n: t.away, paint: "color-mix(in srgb, var(--text-muted) 45%, var(--surface-2))", label: "в отпуске и на больничном" },
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="desk-day-bar">
      <div className="flex h-2 gap-[3px] overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {parts.map((part) => (part.n > 0 ? <span key={part.key} className="h-full first:rounded-l-full" style={{ width: `${(part.n / total) * 100}%`, background: part.paint }} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-[18px]">
        {parts.map((part) =>
          part.n > 0 ? (
            <li key={part.key} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: part.paint }} />
              <span className="nums font-semibold">{part.n}</span>
              <span className="text-muted">{part.label}</span>
            </li>
          ) : null,
        )}
        {due > 0 ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full border border-muted/60" />
            <span className="nums font-semibold">{due}</span>
            <span className="text-muted">{day.today ? "ждём" : "без отчёта"}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** The hero of a day: «6 из 9 сдали отчёт», the bar, and how much work moved. */
function DayHero({ day }: { day: TeamDay }) {
  const t = day.totals;
  return (
    <DeskHero
      testId="desk-day-hero"
      value={t.submitted}
      tone={dayTone(day)}
      title={day.workday ? `из ${t.team} сдали отчёт` : "сдали в выходной"}
      sub={!day.workday ? "не рабочий день — отчёт по желанию, без очков" : day.today ? (t.pending > 0 ? "сегодня — день ещё идёт" : "сегодня") : "итог дня"}
      facts={[
        { key: "handed", value: t.handed_over, label: "сдано задач" },
        { key: "closed", value: t.closed, label: "принято", tone: "gold" },
      ]}
    >
      <DayBar day={day} />
    </DeskHero>
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
  return <span className="block truncate text-muted/60">{personDayLine(row)}</span>;
}

/** A time of the report, or a quiet dash. */
function At({ iso }: { iso: string | null | undefined }) {
  const text = timeOf(iso);
  return text ? <span className="nums">{text}</span> : <span className="text-muted/40">—</span>;
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
    <div className="flex flex-col gap-5 pr-8" data-testid="desk-report-panel">
      <div className="flex items-center gap-3">
        <Avatar name={row.full_name} size={40} />
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-semibold leading-[22px]">{row.full_name}</p>
          <p className="truncate text-[13px] leading-[18px]" style={{ color: TONE_VAR[GROUP_TONE[row.state]] }}>
            {state}
            {points ? <span style={{ color: TONE_VAR[pointsTone(row.report?.points ?? 0)] }}> · {points}</span> : null}
          </p>
        </div>
      </div>
      {facts.length ? (
        <dl className="grid grid-cols-3 gap-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse rounded-[10px] bg-surface-2/60 px-3 py-2">
              <dt className="text-[12px] leading-4 text-muted">{label}</dt>
              <dd className="nums font-display text-[17px] font-semibold leading-[22px]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <section className="flex flex-col gap-1.5">
        <SectionLabel>Чем занимался</SectionLabel>
        {report?.summary ? (
          <p className="whitespace-pre-wrap text-[14px] leading-[21px]">{report.summary}</p>
        ) : (
          <p className="text-[14px] leading-5 text-muted">{row.state === "pending" ? "Отчёт ещё не сдан" : personDayLine(row)}</p>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <SectionLabel count={row.tasks.length}>Задачи дня</SectionLabel>
        {row.tasks.length === 0 ? (
          <p className="text-[14px] leading-5 text-muted">Сданных и принятых нет</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
            {row.tasks.map((task) => (
              <li key={task.id} className="border-t border-border/50 first:border-t-0">
                <Link href={`/desk/tasks?id=${task.id}`} className="flex min-h-[44px] items-center gap-3 px-3 py-2 transition-colors duration-[120ms] hover:bg-surface-2/55">
                  <StatusGlyph status={task.status} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] leading-5">{task.title}</span>
                    <span className="block truncate text-[12px] leading-4 text-muted">{taskMeta(task)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <SectionLabel>В задачах за день</SectionLabel>
        <p className="nums text-[14px] leading-5 text-muted">{activityLine(row.activity)}</p>
      </section>
      <Link href={`/desk/team/${row.user_id}`} className="self-start text-[13px] font-semibold leading-4 text-accent hover:underline">
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
      <SkeletonGroup grow className="overflow-hidden rounded-[12px] border border-border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 border-b border-border/50 px-3 last:border-b-0">
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
 * «Отчёты → День» on the desk (D-152, D-154): the hero — how many handed the report in, an
 * honest bar, how much work moved; the people as one table, 40 px a row, those who owe the
 * report first; a row opens the whole report in the right-hand panel (`?p=`).
 */
export function DayView({
  day,
  stale,
  failed,
  onRetry,
  openId,
  onOpen,
  onClose,
  pointsOn,
}: {
  day: TeamDay | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  pointsOn: boolean;
}) {
  if (!day) return failed ? <LoadFailed onRetry={onRetry} /> : <DayBone />;

  const groups: Group<TeamDayRow>[] = DESK_ORDER.map((state) => ({
    key: state,
    title: STATE_TITLE[state],
    tone: GROUP_TONE[state],
    rows: day.rows.filter((row) => row.state === state),
  }));
  const open = openId ? (day.rows.find((row) => row.user_id === openId) ?? null) : null;

  const columns: Column<TeamDayRow>[] = [
    {
      key: "who",
      title: "Кто",
      width: "minmax(160px,1.1fr)",
      sort: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
      render: (row) => (
        <span className={`flex min-w-0 items-center gap-2.5 ${row.state === "away" || row.state === "off" ? "opacity-60" : ""}`}>
          <Avatar name={row.full_name} size={24} />
          <span className="truncate">{row.full_name}</span>
        </span>
      ),
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
    <div className="flex flex-col gap-5 transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined} data-testid="desk-reports-day">
      <DayHero day={day} />
      <DataGrid
        aria-label="Отчёты за день"
        columns={columns}
        groups={groups}
        rowKey={(row) => row.user_id}
        selectedKey={openId}
        onSelect={(row) => onOpen(row.user_id)}
        onRowClick={(row) => onOpen(row.user_id)}
        empty={<EmptyState title="В команде пока никого" hint="Отчёты сдают сотрудники — появятся, когда в команде будут люди" />}
      />
      {openId ? (
        <InPanel panelKey={`report:${openId}`} onClose={onClose}>
          {open ? <ReportPanel row={open} /> : <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот день.</p>}
        </InPanel>
      ) : null}
    </div>
  );
}
