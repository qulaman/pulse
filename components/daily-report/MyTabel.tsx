"use client";

import { motion } from "motion/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import { Icon } from "@/components/tasks/icons";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { entryDay, monthRange, monthTally, monthTitle, tallyParts } from "@/lib/daily-report/diary";
import { capitalized, pointsText, reviewFacts } from "@/lib/daily-report/format";
import { finedMiss } from "@/lib/daily-report/history";
import {
  blankMonth,
  cellMark,
  cellTone,
  dayWords,
  monthOfDay,
  monthSteps,
  myTabelMonth,
  withToday,
  type CellTone,
  type MyTabelCell,
} from "@/lib/daily-report/my-tabel";
import { useMyReportMonth, useTabelContext } from "@/lib/daily-report/queries";
import type { DailyReport, MyDailyReportDay } from "@/lib/daily-report/types";
import { parseYmd, WEEKDAYS_SHORT_RU, ymdOf, type Month, type Ymd } from "@/lib/datetime/calendar";
import type { ReportRules } from "@/lib/people/stats";

import { DayTasks } from "./DayTasks";
import { ReviewFacts } from "./ReviewFacts";

/** A sideways flick of this many pixels turns the month — less is a wobbly tap (as on /calendar). */
const SWIPE_PX = 48;

/**
 * «Табель» on /report (D-219): the person's own month — the data and the month on screen; the card
 * itself is `MyTabelCard`. The rows are the past days' (`my_daily_report_history`), the states — the
 * director's табель's (lib/daily-report/my-tabel.ts); today's cell follows the day's own read, so a
 * report handed in a second ago is already green.
 */
export function MyTabel({ day }: { day: MyDailyReportDay }) {
  const today = day.date;
  const [month, setMonth] = useState<Month>(() => monthOfDay(today));
  const [direction, setDirection] = useState(0);
  const { from, to } = monthRange(ymdOf(month.year, month.month, 1));
  const context = useTabelContext();
  const rows = useMyReportMonth(from, to);

  const rules = context.data?.rules;
  const person = context.data?.person;
  const weeks = useMemo(
    () => (rules && person && rows.data ? myTabelMonth(month, withToday(rows.data, day.report), today, rules, person) : null),
    [rules, person, rows.data, month, day.report, today],
  );
  const steps = monthSteps(month, today, person?.created_at);
  const failed = [context, rows].filter((query) => query.isError);

  return (
    <MyTabelCard
      month={month}
      today={today}
      weeks={weeks}
      rules={rules ?? null}
      direction={direction}
      prev={steps.prev}
      next={steps.next}
      onStep={(target, delta) => {
        setDirection(delta);
        setMonth(target);
      }}
      failed={failed.length > 0 && !weeks}
      onRetry={() => {
        for (const query of failed) void query.refetch();
      }}
    />
  );
}

/**
 * The card, from props (the sandbox draws it on fixtures): the month's name with «‹ ›», how the
 * month went in one line, the weeks Monday first — a square a day, painted by its state: ✓ handed
 * in, ✕ missed (red only when it cost points), «у» excused, «о» / «б» away, a day off dimmed, today
 * ringed. A tap on a day says it under the calendar: a handed-in one — what happened to it, the
 * words in full and the tasks of that day; any other — why there is no report. `weeks` null — the
 * month's reports are still on their way: the same squares, unpainted, so nothing moves when they come.
 */
export function MyTabelCard({
  month,
  today,
  weeks,
  rules,
  direction = 0,
  prev,
  next,
  onStep,
  failed = false,
  onRetry,
}: {
  month: Month;
  today: Ymd;
  weeks: (MyTabelCell | null)[][] | null;
  rules: ReportRules | null;
  /** Which way the month on screen came from: −1 back, 1 forward, 0 — it was here. */
  direction?: number;
  prev: Month | null;
  next: Month | null;
  onStep: (month: Month, delta: number) => void;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [picked, setPicked] = useState<Ymd | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const monthKey = `${month.year}-${month.month}`;
  // a day picked in another month is not this month's
  const [pickedIn, setPickedIn] = useState(monthKey);
  if (pickedIn !== monthKey) {
    setPickedIn(monthKey);
    setPicked(null);
  }

  const blank = useMemo(() => blankMonth(month), [month]);
  const cell = weeks && picked ? (weeks.flat().find((item) => item?.day === picked) ?? null) : null;
  // one line, as tall as its placeholder: a report of a day off is in the calendar, not in the count —
  // unless it is all the month has
  const tally = weeks && rules ? tallyParts(monthTally(weeks, rules)) : null;
  const counted = tally?.filter((part) => part.key !== "off") ?? [];
  const parts = counted.length ? counted : tally;
  const step = (delta: number) => {
    const target = delta < 0 ? prev : next;
    if (target) onStep(target, delta);
  };

  return (
    <section
      aria-label="Табель"
      data-testid="my-tabel"
      className="mt-2 overflow-hidden rounded-[22px] border px-2 pb-2 pt-1.5"
      style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", background: "var(--surface)", touchAction: "pan-y" }}
      onTouchStart={(event) => {
        const t = event.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between pl-2.5">
        <h3 className="font-display text-[19px] font-semibold leading-6 tracking-[-0.02em]" aria-live="polite" data-testid="my-tabel-month">
          {monthTitle(month, today)}
        </h3>
        <div className="flex items-center">
          <Arrow label="Предыдущий месяц" icon="left" disabled={!prev} onClick={() => step(-1)} />
          <Arrow label="Следующий месяц" icon="right" disabled={!next} onClick={() => step(1)} />
        </div>
      </div>

      {/* how the month went — its place is held while the reports load */}
      <div className="nums -mt-1 h-[18px] truncate px-2.5 text-[13px] leading-[18px] text-muted" data-testid="my-tabel-tally">
        {failed ? (
          "Не получилось загрузить"
        ) : !weeks ? (
          <SkeletonGroup>
            <Bone h={13} w={132} className="mt-[3px]" />
          </SkeletonGroup>
        ) : parts?.length ? (
          capitalized(parts.map((part) => part.text).join(" · "))
        ) : (
          "Отчётов за этот месяц нет"
        )}
      </div>

      <div className="mt-2 grid grid-cols-7 text-center font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.06em]">
        {WEEKDAYS_SHORT_RU.map((name, index) => (
          <span key={name} className="text-muted" style={{ opacity: index > 4 ? 0.6 : 1 }}>
            {name}
          </span>
        ))}
      </div>

      <motion.div
        key={monthKey}
        initial={direction === 0 ? false : { opacity: 0, x: direction * 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="mt-1"
      >
        {(weeks ?? blank).map((week, index) => (
          <div key={index} className="grid grid-cols-7">
            {week.map((item, weekday) => {
              if (!item) return <span key={weekday} aria-hidden className="h-[50px]" />;
              if (typeof item === "string") return <BlankDay key={item} day={item} today={item === today} />;
              return (
                <Day
                  key={item.day}
                  cell={item}
                  words={rules ? dayWords(item, rules) : ""}
                  picked={item.day === picked}
                  onPick={() => setPicked(item.day === picked ? null : item.day)}
                />
              );
            })}
          </div>
        ))}
      </motion.div>

      <div className="mx-1 mt-1.5 border-t border-border/70 px-1.5 pb-1 pt-2.5">
        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="btn-secondary flex min-h-[44px] w-full items-center justify-center rounded-[12px] px-4 font-display text-[15px] font-semibold leading-5 text-text transition-transform duration-[120ms] active:scale-[0.98]"
            data-testid="my-tabel-retry"
          >
            Загрузить ещё раз
          </button>
        ) : cell && rules ? (
          <PickedDay key={cell.day} cell={cell} rules={rules} />
        ) : (
          <p className="text-[13px] leading-[18px] text-muted" data-testid="my-tabel-hint">
            Нажмите на день — покажу его отчёт
          </p>
        )}
      </div>
    </section>
  );
}

/** How a square is painted by its state — a status colour only where it is a status (DESIGN §1.3). */
const TONE: Record<CellTone, CSSProperties> = {
  ok: { background: "color-mix(in srgb, var(--ok) 16%, transparent)", color: "var(--ok)" },
  fined: { background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" },
  // a miss that cost nothing, an excused day, an away one: said by the mark, not by a colour
  missed: { background: "var(--surface-2)", color: "var(--text-muted)" },
  excused: { background: "var(--surface-2)", color: "var(--text-muted)" },
  away: { background: "color-mix(in srgb, var(--surface-2) 60%, transparent)", color: "var(--text-muted)" },
  pending: { color: "var(--text)" },
  quiet: { color: "var(--text-muted)" },
};

const TILE = "nums flex h-[44px] w-full max-w-[46px] flex-col items-center justify-center rounded-[12px] transition-shadow duration-[120ms]";

function ringOf(cell: MyTabelCell, picked: boolean): string | undefined {
  // the chosen day wears the accent ring; today — a thin ring of its own colour
  if (picked) return "0 0 0 2px var(--accent)";
  if (cell.today) return `inset 0 0 0 1.5px ${cell.state === "submitted" ? "var(--ok)" : "color-mix(in srgb, var(--text) 70%, transparent)"}`;
  return undefined;
}

function Day({ cell, words, picked, onPick }: { cell: MyTabelCell; words: string; picked: boolean; onPick: () => void }) {
  const tone = cellTone(cell);
  const mark = cellMark(cell);
  // a day nothing was asked on — a day off, a holiday, a day still to come — steps back
  const dim = tone === "quiet" && (cell.weekend || cell.holiday || cell.state === "future");
  return (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={[entryDay(cell.day), words].filter(Boolean).join(", ")}
      onClick={onPick}
      data-testid="my-tabel-day"
      data-day={cell.day}
      data-state={cell.state}
      className="flex h-[50px] items-center justify-center px-[2px] transition-transform duration-[120ms] active:scale-[0.92] focus-visible:outline-none"
    >
      <span className={TILE} style={{ ...TONE[tone], boxShadow: ringOf(cell, picked), opacity: dim ? 0.55 : 1 }}>
        <span className={`text-[14px] leading-[17px] ${cell.today ? "font-bold" : tone === "quiet" ? "" : "font-semibold"}`}>
          {parseYmd(cell.day)?.day}
        </span>
        <span aria-hidden className="flex h-[13px] items-center text-[11px] font-bold leading-[13px]">
          {mark === "✓" ? <Icon name="check" size={13} /> : mark === "✕" ? <Icon name="x" size={11} /> : mark}
        </span>
      </span>
    </button>
  );
}

/** A square before the month's reports came: the number alone, nothing said about the day yet. */
function BlankDay({ day, today }: { day: Ymd; today: boolean }) {
  return (
    <span className="flex h-[50px] items-center justify-center px-[2px]" data-testid="my-tabel-blank">
      <span
        className={TILE}
        style={{ color: "var(--text-muted)", boxShadow: today ? "inset 0 0 0 1.5px color-mix(in srgb, var(--text) 70%, transparent)" : undefined }}
      >
        <span className={`text-[14px] leading-[17px] ${today ? "font-bold" : ""}`}>{parseYmd(day)?.day}</span>
        <span aria-hidden className="h-[13px]" />
      </span>
    </span>
  );
}

/** The day picked in the calendar, under it: the report as it was handed in, or why there is none. */
function PickedDay({ cell, rules }: { cell: MyTabelCell; rules: ReportRules }) {
  const report = cell.report;
  const handedIn = report?.status === "submitted" ? report : null;
  return (
    <div className="card-in" data-testid="my-tabel-picked" data-day={cell.day}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">{entryDay(cell.day)}</p>
        {handedIn && handedIn.points > 0 ? (
          <span className="nums shrink-0 text-[15px] font-semibold leading-5" style={{ color: "var(--gold)" }}>
            {pointsText(handedIn.points)}
          </span>
        ) : null}
      </div>
      {handedIn ? (
        <HandedIn report={handedIn} offDay={cell.weekend || cell.holiday} holiday={cell.holiday} />
      ) : (
        <>
          <p className="nums text-[13px] leading-[18px] text-muted" data-testid="my-tabel-words">
            {capitalized(dayWords(cell, rules))}
          </p>
          {report && finedMiss(report) ? (
            <p className="mt-1 text-[13px] leading-[18px] text-muted">Минус можно оспорить в истории очков — «Профиль», карточка очков.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function HandedIn({ report, offDay, holiday }: { report: DailyReport; offDay: boolean; holiday: boolean }) {
  const words = report.summary?.trim() ?? "";
  return (
    <>
      <p className="text-[13px] leading-[18px] text-muted">
        <ReviewFacts facts={reviewFacts(report)} capital />
        {offDay ? ` · ${holiday ? "в праздник" : "в выходной"}` : ""}
      </p>
      {words ? <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[22px]">{words}</p> : null}
      {report.tasks.length ? (
        <div className="mt-2.5">
          <DayTasks tasks={report.tasks} flat />
        </div>
      ) : null}
    </>
  );
}

function Arrow({ label, icon, disabled, onClick }: { label: string; icon: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-[transform,color,opacity] duration-[120ms] active:scale-[0.9] active:text-text disabled:opacity-30"
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
