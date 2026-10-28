"use client";

import { LayoutGroup, motion, MotionConfig } from "framer-motion";
import { useState, type CSSProperties } from "react";

import { PersonFace } from "@/components/people/PeoplePicker";
import { CARD_SPRING, CardShell, SectionHead } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import {
  activityLine,
  personDayLine,
  STATE_ORDER,
  STATE_TITLE,
  STATE_TONE,
  tasksCount,
  teamTotalsLine,
} from "@/lib/daily-report/format";
import type { TeamDay, TeamDayRow, TeamDayState } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { TONE_VAR, type Tone } from "@/lib/tasks/tone";

import { DayStepper } from "./DayStepper";
import { DayTasks } from "./DayTasks";
import { TeamDayBone } from "./Skeletons";

/**
 * «Отчёты → День» (D-152): the day switch, the team's day in one card — how many handed the
 * report in, who still owes it, who is away, how much work moved — and the people by state;
 * a tap opens a person in place: their words, the day's tasks, what they did in the tasks.
 */
export function TeamDayPanel({
  date,
  today,
  onDate,
  day,
  stale = false,
  failed = false,
  onRetry,
}: {
  date: Ymd;
  today: Ymd;
  onDate: (date: Ymd) => void;
  day: TeamDay | undefined;
  /** Another day is on its way and this one still shows (keepPreviousData). */
  stale?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  return (
    <>
      <DayStepper date={date} today={today} onChange={onDate} />
      {day ? (
        <div className="transition-opacity duration-[150ms]" style={{ opacity: stale ? 0.55 : 1 }} aria-busy={stale || undefined}>
          <DaySummary day={day} />
          <DayPeople day={day} />
        </div>
      ) : failed ? (
        <LoadFailed onRetry={onRetry} />
      ) : (
        <TeamDayBone />
      )}
    </>
  );
}

const BAR: { state: TeamDayState; tone: Tone; label: string }[] = [
  { state: "submitted", tone: "ok", label: "сдали" },
  { state: "pending", tone: "accent", label: "ждём" },
  { state: "missed", tone: "danger", label: "не сдали" },
  { state: "away", tone: "muted", label: "отпуск, больничный" },
];

function DaySummary({ day }: { day: TeamDay }) {
  const t = day.totals;
  const counts: Record<TeamDayState, number> = { submitted: t.submitted, pending: t.pending, missed: t.missed, away: t.away, off: 0 };
  const tone: Tone = !day.workday ? "muted" : t.missed > 0 ? "danger" : t.pending > 0 ? "accent" : t.submitted > 0 ? "ok" : "muted";
  const color = TONE_VAR[tone];
  const segments = BAR.filter((segment) => counts[segment.state] > 0);

  return (
    <section
      data-testid="team-day-summary"
      className="status-screen relative mt-3 overflow-hidden rounded-[22px] px-4 pb-3 pt-3"
      style={{ "--tone": color } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color }}>
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{!day.workday ? "Не рабочий день" : day.today ? "Сегодня" : "Рабочий день"}</span>
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-muted">
          <span className="nums text-text">{t.team}</span> в команде
        </span>
      </div>

      <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
        <span className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color }}>
          {t.submitted}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">из {t.team} сдали отчёт</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted">{teamTotalsLine(day)}</p>
        </div>
      </div>

      <div
        className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full"
        style={{ background: segments.length ? undefined : `color-mix(in srgb, ${color} 22%, var(--surface-2))` }}
        aria-hidden
      >
        {segments.map((segment, index) => (
          <span
            key={segment.state}
            className="bar-grow h-full"
            style={{
              flexGrow: counts[segment.state],
              flexBasis: 0,
              minWidth: 6,
              background: TONE_VAR[segment.tone],
              opacity: segment.tone === "muted" ? 0.55 : 1,
              borderRadius: index === 0 || index === segments.length - 1 ? 999 : 2,
              animationDelay: `${index * 60}ms`,
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex min-h-[18px] flex-wrap gap-x-3.5 gap-y-1">
        {segments.map((segment) => (
          <li key={segment.state} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px]">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_VAR[segment.tone], opacity: segment.tone === "muted" ? 0.55 : 1 }} />
            <span className="nums font-semibold text-text">{counts[segment.state]}</span>
            <span className="text-muted">{segment.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayPeople({ day }: { day: TeamDay }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = STATE_ORDER.map((state) => ({ state, rows: day.rows.filter((row) => row.state === state) })).filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return <p className="mt-4 rounded-[20px] border border-border/70 px-6 py-7 text-center text-[15px] text-muted">В команде пока никого</p>;
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="mt-1 flex flex-col gap-2" data-testid="team-day-people">
          {groups.map((group) => (
            <div key={group.state} className="flex flex-col gap-2">
              <motion.div layout="position" transition={CARD_SPRING}>
                <SectionHead title={STATE_TITLE[group.state]} tone={STATE_TONE[group.state]} count={group.rows.length} />
              </motion.div>
              {group.rows.map((row) => {
                const open = openId === row.user_id;
                return (
                  <motion.div key={row.user_id} layout="position" transition={CARD_SPRING}>
                    <CardShell
                      id={`person-${row.user_id}`}
                      open={open}
                      closed={row.state === "away" || row.state === "off"}
                      onToggle={() => setOpenId(open ? null : row.user_id)}
                      head={<PersonHead row={row} />}
                      testId="team-day-person"
                    >
                      <PersonBody row={row} />
                    </CardShell>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function PersonHead({ row }: { row: TeamDayRow }) {
  const tone = TONE_VAR[STATE_TONE[row.state]];
  return (
    <>
      <span className="relative shrink-0">
        <PersonFace person={row} size={40} />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface" style={{ background: tone }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[22px]">{shortName(row.full_name)}</span>
        <span className="nums block truncate text-[13px] leading-[18px] text-muted">{personDayLine(row)}</span>
      </span>
      {row.tasks.length ? <span className="nums mt-0.5 shrink-0 text-[13px] leading-4 text-muted">{tasksCount(row.tasks.length)}</span> : null}
    </>
  );
}

function PersonBody({ row }: { row: TeamDayRow }) {
  const report = row.report?.status === "submitted" ? row.report : null;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="eyebrow">Чем занимался</p>
        {report?.summary ? (
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-[22px]">{report.summary}</p>
        ) : (
          <p className="mt-1 text-[14px] leading-5 text-muted">{row.state === "pending" ? "Отчёт ещё не сдан" : "Отчёта нет"}</p>
        )}
      </div>
      <div>
        <p className="eyebrow">Задачи дня</p>
        <div className="mt-1.5">
          <DayTasks tasks={row.tasks} flat empty={<p className="text-[14px] leading-5 text-muted">Сданных и принятых нет</p>} />
        </div>
      </div>
      <p className="nums text-[13px] leading-[18px] text-muted">
        <span className="text-text">В задачах:</span> {activityLine(row.activity)}
      </p>
    </div>
  );
}

export function LoadFailed({ onRetry, title = "Не получилось загрузить отчёты" }: { onRetry?: () => void; title?: string }) {
  return (
    <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-8 text-center" role="alert">
      <p className="font-display text-[17px] font-semibold">{title}</p>
      <p className="mt-1 text-[14px] leading-[19px] text-muted">Проверьте связь и попробуйте ещё раз</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
