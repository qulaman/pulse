"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Quote, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { PanelHeader } from "@/components/desk/ui/DeskPanel";
import { Face } from "@/components/desk/ui/Face";
import { PersonMovesBar, usePersonMoves } from "@/components/desk/team/PersonMoves";
import { IconButton } from "@/components/desk/ui/IconButton";
import { Popover } from "@/components/desk/ui/Popover";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { useExcuseDailyReport, usePersonDailyReports } from "@/lib/daily-report/actions";
import {
  awayWord,
  cellMark,
  cellTitle,
  diaryCalendar,
  entryDay,
  excuseHint,
  hoursLine,
  missedLine,
  missedMove,
  monthIn,
  monthRange,
  monthTally,
  monthTitle,
  REASON_MAX,
  shiftMonth,
  shortDay,
  stampOf,
  tallyParts,
  tasksLine,
  timesText,
  wordsOf,
  type DiaryCell,
} from "@/lib/daily-report/diary";
import { taskMeta } from "@/lib/daily-report/format";
import { dailyReportKeys } from "@/lib/daily-report/queries";
import type { PersonDailyReport } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm, WEEKDAYS_SHORT_RU, weeksInMonth, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { usePeople, type Person } from "@/lib/people/queries";
import { useResolveDispute } from "@/lib/points/game";
import { useNow } from "@/lib/useNow";

/** What the page mounts it with, in the shell's right-hand panel, for «День» and «Табель» alike. */
export type DiaryProps = {
  userId: string;
  /** The day to show first: its month, its entry ringed and scrolled to. */
  focus: Ymd;
  today: Ymd;
  /** A day of the diary's calendar double-clicked or «Открыть день»: the page opens «День» on it. */
  onDay: (day: Ymd) => void;
};

/** The person's reports for the month on screen — the hook's own key, patched after a move. */
const personKey = (userId: string, from: Ymd, to: Ymd) => ["daily-report", "team", "person", userId, from, to] as const;

/**
 * «Дневник» (D-183): one person's daily reports in the desk's right-hand panel, the same for «День»
 * and «Табель». The head — the face, the name, where they are, and the moves every desk card has
 * (D-194): «Дать задачу» (the person pinned in the command line), «Изменить», «Карточка», «⋯» —
 * «Начислить очки…» where the game is on, vacation or sick leave from today, back at work. Under it the
 * month as a calendar of day states (the табель's: ✓ handed in, ✕ missed, «у» excused, «о»/«б»
 * away) with ‹ › for the months; then the reports of the month newest first — the words in full and
 * the day's tasks, a report without words in one line, a missed day in one red line and its one
 * move: answer the person's dispute of the minus, or write a good reason (the minus comes back).
 * A click on a day of the calendar rings its entry and brings it into view, a double click opens
 * that day in «День». Hours are «по времени сдачи», lunch included: grey, never summed.
 */
export function Diary({ userId, focus, today, onDay }: DiaryProps) {
  const { pointsEnabled } = useDeskScope();
  const people = usePeople();
  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const person = people.data?.find((row) => row.id === userId) ?? null;
  const now = useNow();

  // the month on screen and the ringed day follow the page whenever it moves the focus or the person
  const [seen, setSeen] = useState({ userId, focus });
  const [monthStart, setMonthStart] = useState(() => monthRange(focus).from);
  const [ringed, setRinged] = useState<Ymd | null>(focus);
  // a day asked to come into view: each ask once (`n`), as soon as its entry is on the page
  const [ask, setAsk] = useState<{ day: Ymd; n: number }>({ day: focus, n: 0 });
  if (seen.userId !== userId || seen.focus !== focus) {
    setSeen({ userId, focus });
    setMonthStart(monthRange(focus).from);
    setRinged(focus);
    setAsk({ day: focus, n: ask.n + 1 });
  }

  const range = monthRange(monthStart);
  const reports = usePersonDailyReports(userId, range.from, range.to, Boolean(rules?.enabled ?? true));
  // the hook holds the month before while ‹ › fetches the next: its days would lie under the new
  // month's squares, so until the month's own answer comes the calendar and the list wait in bones
  const data = reports.isPlaceholderData ? undefined : reports.data;
  const entries = useMemo(
    () => [...(data ?? [])].filter((row) => row.report_date >= range.from && row.report_date <= range.to).sort((a, b) => b.report_date.localeCompare(a.report_date)),
    [data, range.from, range.to],
  );
  const cells = useMemo(
    () => (rules && person && data ? diaryCalendar(monthRange(monthStart).month, data, today, rules, person) : null),
    [rules, person, data, monthStart, today],
  );

  // the entry asked for comes into view once it is on the page (a click, the page's focus)
  const list = useRef<HTMLDivElement>(null);
  const answered = useRef(-1);
  const shown = person !== null;
  useEffect(() => {
    // the list mounts with the person (the roster may come after the reports)
    if (!data || !shown || !list.current || answered.current === ask.n) return;
    answered.current = ask.n;
    const node = list.current.querySelector<HTMLElement>(`[data-testid="desk-diary-entry"][data-day="${ask.day}"]`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [ask, data, shown]);

  const ring = (day: Ymd) => {
    setRinged(day);
    setAsk((current) => ({ day, n: current.n + 1 }));
  };
  const step = (delta: -1 | 1) => {
    setMonthStart(shiftMonth(monthStart, delta));
    setRinged(null);
  };

  if (!person) {
    if (people.isPending || (!people.data && !people.isError)) return <DiaryBone />;
    return (
      <article className="rep-diary" data-testid="desk-diary">
        <PanelHeader>
          <p className="rep-diary-name">{people.isError ? "Не получилось загрузить" : "Этого человека нет в команде"}</p>
        </PanelHeader>
        {people.isError ? (
          <Button size="sm" variant="secondary" onClick={() => void people.refetch()}>
            Повторить
          </Button>
        ) : null}
      </article>
    );
  }

  const nowMonth = monthRange(today).from;
  // the Aqtobe day they came, not the UTC one: 20:00Z on the 30th is already the 1st here
  const joinedMonth = monthRange(aqtobeIsoToYmdHm(person.created_at)?.ymd ?? person.created_at.slice(0, 10)).from;
  const tally = cells && rules ? tallyParts(monthTally(cells, rules)) : null;
  const emptyMonth = `В${monthIn(range.month).slice(1)} отчётов ${monthStart === nowMonth ? "пока нет" : "нет"}`;

  return (
    <article className="rep-diary flex flex-col" data-testid="desk-diary" data-user={userId}>
      <DiaryHead person={person} />

      <section className="rep-diary-month" aria-label="Месяц">
        <div className="rep-diary-month-row">
          <h3 className="rep-diary-month-name" data-testid="desk-diary-month">
            {monthTitle(range.month, today)}
          </h3>
          <div className="rep-diary-stepper">
            <IconButton label="Предыдущий месяц" icon={<ChevronLeft size={16} strokeWidth={2.2} />} disabled={monthStart <= joinedMonth} onClick={() => step(-1)} testId="desk-diary-prev" />
            <IconButton label="Следующий месяц" icon={<ChevronRight size={16} strokeWidth={2.2} />} disabled={monthStart >= nowMonth} onClick={() => step(1)} testId="desk-diary-next" />
          </div>
        </div>
        <p className="rep-diary-tally nums" data-testid="desk-diary-tally">
          {cells === null ? (
            reports.isError ? null : <Bone h={14} w={220} className="my-0.5" />
          ) : (
            // an empty month says so once, in the list under the calendar
            tally?.map((part, index) => (
              <span key={part.key} data-tone={part.tone}>
                {index > 0 ? " · " : ""}
                {part.text}
              </span>
            ))
          )}
        </p>
        <MonthGrid cells={cells} weeks={weeksInMonth(range.month)} ringed={ringed} onRing={ring} onDay={onDay} />
      </section>

      <section ref={list} className="rep-diary-list" aria-label="Дневник">
        <h3 className="rep-diary-label">
          Дневник <span>сначала новые · щелчок по дню в календаре — к нему</span>
        </h3>
        {reports.isError && !data ? (
          <div className="rep-diary-empty">
            <p>{reports.error.message || "Не получилось загрузить отчёты"}</p>
            <Button size="sm" variant="secondary" loading={reports.isFetching} onClick={() => void reports.refetch()}>
              Повторить
            </Button>
          </div>
        ) : !data ? (
          <EntriesBone />
        ) : entries.length === 0 ? (
          <p className="rep-diary-empty">{emptyMonth}</p>
        ) : (
          entries.map((report) => (
            <Entry
              key={report.id}
              report={report}
              ringed={ringed === report.report_date}
              pointsOn={pointsEnabled}
              now={now}
              listKey={personKey(userId, range.from, range.to)}
              onRing={() => setRinged(report.report_date)}
              onDay={onDay}
            />
          ))
        )}
      </section>
    </article>
  );
}

/* ---- the head ---------------------------------------------------------------------------------- */

/** The person over their diary, with the moves every desk card has (D-194) — «Начислить очки…» and today's availability under «⋯». */
function DiaryHead({ person }: { person: Person }) {
  const moves = usePersonMoves("diary");
  const where = awayWord(person.availability, person.is_active);
  return (
    <PanelHeader>
      <div className="flex items-center gap-3.5">
        <Face person={person} size={52} />
        <div className="min-w-0">
          <h2 className="rep-diary-name truncate">{person.full_name}</h2>
          <p className="rep-diary-sub truncate">
            {person.position}
            {person.position && where ? " · " : ""}
            {where ? <span data-away={person.availability}>{where}</span> : null}
          </p>
        </div>
      </div>
      <PersonMovesBar person={person} moves={moves} testId="desk-diary" className="rep-diary-moves" />
      {moves.node}
    </PanelHeader>
  );
}

/* ---- the calendar ------------------------------------------------------------------------------ */

function MonthGrid({
  cells,
  weeks,
  ringed,
  onRing,
  onDay,
}: {
  cells: (DiaryCell | null)[][] | null;
  weeks: number;
  ringed: Ymd | null;
  onRing: (day: Ymd) => void;
  onDay: (day: Ymd) => void;
}) {
  return (
    <div className="rep-diary-cal" role="grid" aria-label="Отчёты по дням" data-testid="desk-diary-cal">
      {WEEKDAYS_SHORT_RU.map((name) => (
        <span key={name} className="rep-diary-wd" aria-hidden>
          {name}
        </span>
      ))}
      {cells === null
        ? Array.from({ length: weeks * 7 }, (_, index) => <span key={index} className="rep-diary-cell" data-state="loading" aria-hidden />)
        : cells.flat().map((cell, index) =>
            cell === null ? (
              <span key={`out-${index}`} className="rep-diary-cell" data-state="out" aria-hidden />
            ) : (
              <Tooltip key={cell.day} label={cellTitle(cell)} className="block">
                <button
                  type="button"
                  role="gridcell"
                  className="rep-diary-cell nums"
                  data-testid="desk-diary-day"
                  data-day={cell.day}
                  data-state={cell.state}
                  data-today={cell.today ? "" : undefined}
                  data-ringed={ringed === cell.day ? "" : undefined}
                  aria-label={cellTitle(cell)}
                  aria-selected={ringed === cell.day}
                  onClick={() => onRing(cell.day)}
                  onDoubleClick={() => onDay(cell.day)}
                >
                  <span className="rep-diary-dn">{Number(cell.day.slice(8))}</span>
                  <span className="rep-diary-mark" data-long={cell.state === "pending" ? "" : undefined}>
                    {cellMark(cell)}
                  </span>
                </button>
              </Tooltip>
            ),
          )}
    </div>
  );
}

/* ---- an entry ---------------------------------------------------------------------------------- */

function Entry({
  report,
  ringed,
  pointsOn,
  now,
  listKey,
  onRing,
  onDay,
}: {
  report: PersonDailyReport;
  ringed: boolean;
  pointsOn: boolean;
  now: Date;
  listKey: readonly unknown[];
  onRing: () => void;
  onDay: (day: Ymd) => void;
}) {
  const move = missedMove(report);
  const words = wordsOf(report);
  const stamp = stampOf(report, now);
  const submitted = report.status === "submitted";
  const state = submitted ? "submitted" : move === "excused" ? "excused" : "missed";
  return (
    <article
      className="rep-diary-entry"
      data-testid="desk-diary-entry"
      data-day={report.report_date}
      data-state={state}
      data-words={submitted ? (words ? "1" : "0") : undefined}
      data-ringed={ringed ? "" : undefined}
      onClick={(event) => {
        // a press on a move of the entry is that move's; anywhere else rings the entry
        if (!(event.target as HTMLElement).closest("button, a, input, textarea")) onRing();
      }}
    >
      <header className="rep-diary-entry-head">
        <Tooltip label="Открыть этот день" side="top">
          <button type="button" className="rep-diary-date desk-focus" onClick={() => onDay(report.report_date)}>
            {entryDay(report.report_date)}
          </button>
        </Tooltip>
        {submitted ? (
          stamp ? (
            <span className="rep-diary-stamp nums" data-late={stamp.late ? "" : undefined}>
              {stamp.fresh ? <span className="rep-diary-fresh">только что · </span> : null}
              {stamp.text}
              {stamp.edited ? ` · ${stamp.edited}` : ""}
            </span>
          ) : null
        ) : (
          <span className="rep-diary-missed nums" data-excused={move === "excused" ? "" : undefined}>
            {missedLine(report, pointsOn)}
          </span>
        )}
      </header>

      {submitted ? (
        words ? (
          <>
            <p className="rep-diary-hours nums">{hoursLine(report)}</p>
            <p className="rep-diary-words">{words}</p>
            {report.tasks.length > 0 ? (
              <ul className="rep-diary-tasks">
                {report.tasks.map((task) => (
                  <li key={task.id}>
                    <Link href={`/desk/tasks?id=${task.id}`} className="rep-diary-task" title={taskMeta(task)}>
                      <StatusGlyph status={task.status} size={16} />
                      <span className="rep-diary-task-title">{task.title}</span>
                      <span className="rep-diary-task-meta" data-late={task.on_time === false ? "" : undefined}>
                        {taskMeta(task)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          // no words (a one-tap report from Лента): the time and the day's tasks, one line
          <p className="rep-diary-compact nums" title={tasksLine(report) || undefined}>
            {report.tasks.length > 0 ? (
              <>
                <span className="rep-diary-compact-time">{timesText(report)}</span>
                {timesText(report) ? " · " : ""}
                {tasksLine(report)}
              </>
            ) : (
              <span className="rep-diary-compact-time">{hoursLine(report)}</span>
            )}
          </p>
        )
      ) : move === "dispute" && report.dispute ? (
        <Dispute report={report} listKey={listKey} />
      ) : move === "excused" ? (
        <p className="rep-diary-excused">Уважительная: {report.excused_reason}</p>
      ) : (
        <Excuse report={report} pointsOn={pointsOn} />
      )}
    </article>
  );
}

/**
 * The person disputes the minus: their words, then «Вернуть очки» or «Оставить минус». The answer is
 * on screen at once (принцип 1a); a refusal puts the dispute back (the hook says why in a toast).
 */
function Dispute({ report, listKey }: { report: PersonDailyReport; listKey: readonly unknown[] }) {
  const queryClient = useQueryClient();
  const resolve = useResolveDispute();
  const dispute = report.dispute;
  if (!dispute) return null;
  const answer = (refund: boolean) => {
    const before = queryClient.getQueryData<PersonDailyReport[]>(listKey);
    queryClient.setQueryData<PersonDailyReport[]>(listKey, (list) =>
      list?.map((row) => (row.id === report.id ? { ...row, points: refund ? Math.max(row.points, 0) : row.points, dispute: { ...dispute, resolved: true } } : row)),
    );
    // the entry leaves this move at once, so the answer is awaited outside the component's life
    resolve
      .mutateAsync({ id: dispute.id, refund })
      .catch(() => {
        if (before) queryClient.setQueryData(listKey, before);
      })
      .finally(() => void queryClient.invalidateQueries({ queryKey: dailyReportKeys.team }));
  };
  return (
    <div className="rep-diary-dispute" data-testid="desk-diary-dispute">
      <p className="rep-diary-dispute-who">Оспаривает минус:</p>
      <blockquote className="rep-diary-quote">
        <Quote size={13} strokeWidth={2} aria-hidden />
        «{dispute.text}»
      </blockquote>
      <div className="rep-diary-row">
        <Button size="sm" variant="secondary" icon={<Undo2 size={14} strokeWidth={2.2} aria-hidden />} disabled={resolve.isPending} onClick={() => answer(true)} data-testid="desk-diary-refund">
          Вернуть очки
        </Button>
        <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => answer(false)} data-testid="desk-diary-keep">
          Оставить минус
        </Button>
      </div>
    </div>
  );
}

/**
 * «Уважительная причина…»: a reason, required; the day stays missed, the minus comes back. The hook
 * writes the reason into the entry at once and says the outcome in a toast; the popover just closes.
 */
function Excuse({ report, pointsOn }: { report: PersonDailyReport; pointsOn: boolean }) {
  const excuse = useExcuseDailyReport();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [reason, setReason] = useState("");
  const text = reason.trim();

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text || excuse.isPending) return;
    excuse.mutate({ reportId: report.id, reason: text });
    setAnchor(null);
    setReason("");
  };

  return (
    <div className="rep-diary-row">
      <Button size="sm" variant="secondary" onClick={(event) => setAnchor(anchor ? null : event.currentTarget)} aria-expanded={Boolean(anchor)} data-testid="desk-diary-excuse">
        Уважительная причина…
      </Button>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} width={340} track label="Уважительная причина">
        <form className="rep-diary-excuse-form" onSubmit={save}>
          <label htmlFor={`excuse-${report.id}`} className="rep-diary-excuse-label">
            Почему не было отчёта за {shortDay(report.report_date)}
          </label>
          <input
            id={`excuse-${report.id}`}
            data-autofocus=""
            value={reason}
            maxLength={REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Например: весь день на объекте без связи"
            className="field h-9 w-full text-[14px] leading-5 outline-none"
            data-testid="desk-diary-excuse-reason"
          />
          <p className="rep-diary-excuse-hint">{excuseHint(report.points, pointsOn)}</p>
          <div className="rep-diary-row justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAnchor(null)}>
              Отмена
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={!text} data-testid="desk-diary-excuse-save">
              Записать
            </Button>
          </div>
        </form>
      </Popover>
    </div>
  );
}

/* ---- while it loads ---------------------------------------------------------------------------- */

function EntriesBone() {
  return (
    <SkeletonGroup grow>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 py-3">
          <div className="flex justify-between">
            <Bone h={14} w={120} />
            <Bone h={12} w={70} />
          </div>
          <Bone h={12} w={190} />
          <Bone h={14} w="92%" />
          <Bone h={14} w="64%" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

function DiaryBone() {
  return (
    <article className="rep-diary" data-testid="desk-diary" aria-busy="true">
      <SkeletonGroup>
        <div className="flex items-center gap-3.5">
          <Bone round w={52} h={52} />
          <div className="flex flex-col gap-2">
            <Bone h={18} w={180} />
            <Bone h={13} w={110} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Bone h={36} w={130} />
          <Bone h={36} w={120} />
        </div>
        <Bone h={240} className="mt-5" />
      </SkeletonGroup>
    </article>
  );
}
