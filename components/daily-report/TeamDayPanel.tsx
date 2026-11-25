"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { PersonFace } from "@/components/people/PeoplePicker";
import { SectionHead } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { useRemindDailyReport } from "@/lib/daily-report/actions";
import { markGone, personDayLine, STATE_DOT, STATE_TITLE, STATE_TONE, teamTotalsLine, timeOf } from "@/lib/daily-report/format";
import type { DailyReportReminder, TeamDay, TeamDayRow, TeamDayState } from "@/lib/daily-report/types";
import { shortName } from "@/lib/people/names";
import { useGoneIds } from "@/lib/people/queries";
import { dotStyle, segmentStyle, TONE_VAR, type BarTone, type Tone } from "@/lib/tasks/tone";

import { RollCallBone } from "./TeamSkeletons";

/**
 * Today's roll call (D-152, D-183, D-198): what «Ждём 4 ›» of «Отчёты → Подряд» opens — the team's
 * day in one card, then the people by state, whom we still wait for first, each with «Напомнить»
 * (one push a person a day, its receipt in the row) and «Напомнить всем». The words of the reports
 * are in the feed itself; no «пришёл / ушёл» and no hours anywhere (owner, answer 7; D-194).
 */
export function TeamRollCall({ day, failed = false, onRetry }: { day: TeamDay | undefined; failed?: boolean; onRetry?: () => void }) {
  if (day) {
    return (
      <>
        <DaySummary day={day} />
        <DayPeople day={day} />
      </>
    );
  }
  return failed ? <LoadFailed onRetry={onRetry} /> : <RollCallBone />;
}

// «ждём» is not done: a hollow segment, never green, never the brand colour (lib/tasks/tone.ts)
const BAR: { state: TeamDayState; tone: BarTone; label: string }[] = [
  { state: "submitted", tone: STATE_DOT.submitted, label: "сдали" },
  { state: "pending", tone: STATE_DOT.pending, label: "ждём" },
  { state: "missed", tone: STATE_DOT.missed, label: "не сдали" },
  { state: "away", tone: STATE_DOT.away, label: "отпуск, больничный" },
];

function DaySummary({ day }: { day: TeamDay }) {
  const t = day.totals;
  const goneIds = useGoneIds();
  // the team now (lib/people/team.ts): the day's rows hold whoever left with a report that day too
  const team = useMemo(() => markGone(day.rows, goneIds).filter((row) => !row.gone).length, [day.rows, goneIds]);
  const counts: Record<TeamDayState, number> = { submitted: t.submitted, pending: t.pending, missed: t.missed, away: t.away, off: 0 };
  // «N из M»: M — who owed the report today (D-183), as the feed's strip counts it; away and off are not
  const due = t.submitted + t.pending + t.missed + t.excused;
  // green only when every report that was due is in; waiting is neutral
  const tone: Tone = !day.workday ? "muted" : t.missed > 0 ? "danger" : t.pending > 0 ? "muted" : t.submitted > 0 ? "ok" : "muted";
  const color = TONE_VAR[tone];
  const segments = BAR.filter((segment) => counts[segment.state] > 0);

  return (
    <section
      data-testid="team-day-summary"
      className="status-screen relative overflow-hidden rounded-[22px] px-4 pb-3 pt-3"
      style={{ "--tone": color } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color }}>
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{!day.workday ? "Отчёт сегодня не нужен" : "Сегодня"}</span>
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-muted">
          <span className="nums text-text">{team}</span> в команде
        </span>
      </div>

      <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
        <span className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color }}>
          {t.submitted}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">{day.workday ? `из ${due} сдали отчёт` : "сдали отчёт"}</p>
          {teamTotalsLine(day) ? <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted">{teamTotalsLine(day)}</p> : null}
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
              ...segmentStyle(segment.tone, { first: index === 0, last: index === segments.length - 1 }),
              animationDelay: `${index * 60}ms`,
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex min-h-[18px] flex-wrap gap-x-3.5 gap-y-1">
        {segments.map((segment) => (
          <li key={segment.state} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px]">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={dotStyle(segment.tone)} />
            <span className="nums font-semibold text-text">{counts[segment.state]}</span>
            <span className="text-muted">{segment.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The roll call reads «whom do we wait for» first: the people still owing today's report lead. */
const ROLL_ORDER: TeamDayState[] = ["pending", "missed", "submitted", "away", "off"];

/** «напомнил 17:32 · увидел» / «· не открывал» / «авто 18:00 · в очереди» — principle 8, never «не получил». */
function receiptText(reminder: DailyReportReminder): string {
  const who = reminder.by === "director" ? `напомнил ${timeOf(reminder.at)}` : `авто ${timeOf(reminder.at)}`;
  const state = reminder.seen_at ? "увидел" : reminder.sent_at ? "не открывал" : "в очереди";
  return `${who} · ${state}`;
}

function DayPeople({ day }: { day: TeamDay }) {
  const goneIds = useGoneIds();
  const remind = useRemindDailyReport();
  // reminded from here, the day's rows not back yet: no second button meanwhile (the hook says it in a toast)
  const [sent, setSent] = useState<ReadonlyMap<string, string>>(new Map());
  // whoever left keeps their row of that day, after the team of its state, said as gone
  const rows = useMemo(() => markGone(day.rows, goneIds), [day.rows, goneIds]);
  const groups = ROLL_ORDER.map((state) => ({ state, rows: rows.filter((row) => row.state === state) })).filter((group) => group.rows.length > 0);
  const askable = (row: TeamDayRow & { gone: boolean }) => day.today && row.state === "pending" && !row.gone && !row.reminded && !sent.has(row.user_id);
  const waiting = rows.filter(askable);

  const ask = (userIds: string[]) =>
    remind.mutate(
      { userIds },
      { onSuccess: (answer) => setSent((was) => new Map([...was, ...answer.reminded.map((id) => [id, new Date().toISOString()] as const)])) },
    );

  if (groups.length === 0) {
    return <p className="mt-4 rounded-[20px] border border-border/70 px-6 py-7 text-center text-[15px] text-muted">В команде пока никого</p>;
  }

  return (
    <div className="mt-1 flex flex-col" data-testid="team-day-people">
      {groups.map((group) => (
        <div key={group.state} className="flex flex-col">
          <div className="flex items-end justify-between gap-2">
            <SectionHead title={STATE_TITLE[group.state]} tone={STATE_TONE[group.state]} count={group.rows.length} />
            {group.state === "pending" && waiting.length > 1 ? (
              <Button variant="secondary" size="sm" className="!min-h-[44px]" disabled={remind.isPending} onClick={() => ask(waiting.map((row) => row.user_id))} data-testid="remind-all">
                Напомнить всем ({waiting.length})
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-col">
            {group.rows.map((row) => (
              <li key={row.user_id} className="flex min-h-[56px] items-center gap-3 border-b border-border/50 px-1 py-1.5 last:border-b-0" data-testid="team-day-person">
                <span className="relative shrink-0" style={{ opacity: row.gone ? 0.55 : 1 }}>
                  <PersonFace person={row} size={36} />
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface"
                    style={{ ...dotStyle(STATE_DOT[row.state]), ...(STATE_DOT[row.state] === "wait" ? { background: "var(--surface)" } : {}) }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] leading-[22px]">{shortName(row.full_name)}</span>
                  <span className="nums block truncate text-[13px] leading-[18px] text-muted">
                    {[row.gone ? "больше не в команде" : "", row.reminded && row.state === "pending" ? receiptText(row.reminded) : personDayLine(row)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {askable(row) ? (
                  <button
                    type="button"
                    onClick={() => ask([row.user_id])}
                    disabled={remind.isPending}
                    className="relative min-h-[44px] shrink-0 rounded-[12px] border border-border bg-surface-2 px-3 font-display text-[14px] font-semibold leading-5 transition-transform duration-[120ms] active:scale-[0.96] disabled:opacity-60"
                    data-testid="remind"
                  >
                    Напомнить
                    <HapticSwitch />
                  </button>
                ) : sent.has(row.user_id) && !row.reminded ? (
                  <span className="nums shrink-0 text-[13px] leading-4 text-muted">напомнил {timeOf(sent.get(row.user_id))}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
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
