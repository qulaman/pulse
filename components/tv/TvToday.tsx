"use client";

import { AnimatePresence, motion } from "motion/react";

import { aqtobeClock } from "@/lib/tv/clock";
import { meetingOf, type MeetingLine } from "@/lib/tv/overlay";
import type { TvSummary } from "@/lib/tv/queries";
import { greetingOf, type TvSpeech } from "@/lib/tv/voice";
import { weekBars } from "@/lib/tv/week";

import { DayPulse } from "./DayPulse";
import { TvMascot } from "./TvMascot";
import { WeekStrip } from "./WeekStrip";

/**
 * «Сегодня» is the wall's home (D-185): it stands between all the scenes of the round, on screen half the time.
 *
 * Two columns of the wall's grid (`.tv-split`). The main one carries the day: one number, large — what is done today;
 * behind a thin rule, beside it in a column, the tasks in work and the week as seven bars (`WeekStrip`: accepted per
 * day, today framed — the week said once, so neither a «за неделю» figure here nor the band repeats it);
 * from noon on, the day's rhythm by the hour (DayPulse); the next meeting at the bottom. The number always means the
 * same — done today: a day with nothing done yet has the greeting by the hour in its place, never «в работе» standing
 * in for it. The side column is the mascot's: it stands at the bottom band and says the news of the last minute and a
 * half — or a greeting — in a speech bubble with a tail to it, not as a caption under it. The mascot is a quiet second
 * thing on this scene: the number is what the room reads first. The top right corner is the channel mark's.
 *
 * Three sizes of type: the number (tv-hero), the figures beside it (tv-lead), every word (tv-body); a day without a
 * number has its greeting at tv-title instead of the number.
 *
 * Only good news (D-45): no overdue, no declines, no «дел нет».
 */

type Figure = { value: number; label: string };

/** The day's one number — done today — and the figure beside it; zeros are never shown. The week is the strip. */
function figuresOf(summary: TvSummary | null): { done: number | null; more: Figure[] } {
  const today = summary?.today ?? { sent: 0, done: 0, in_work: 0 };
  const done = today.done > 0 ? today.done : null;
  const more: Figure[] = [];
  if (today.in_work > 0) more.push({ value: today.in_work, label: "всего в работе" });
  return { done, more };
}

/** The day's rhythm shows from noon: in the morning it is two bars and an empty scale — a placeholder, not a picture. */
const PULSE_FROM_HOUR = 12;

const EASE = [0.2, 0, 0, 1] as const;

export function TvToday({ speech, summary, now }: { speech: TvSpeech; summary: TvSummary | null; now: Date }) {
  const { done, more } = figuresOf(summary);
  const bars = weekBars(summary?.week);
  const next = summary?.events[0] ?? null;
  const meeting = next ? meetingOf(next, now) : null;
  // a day without a number has the greeting for its headline: the face then only says the news
  const greeting = done ? null : greetingOf(now, summary?.today);
  const said = greeting && speech.mood === "calm" ? null : speech.text;
  const hour = aqtobeClock(now).h;
  // a number of three digits stacks its figures under it: with a meeting below as well, the rhythm has no room left
  const roomy = done === null || done < 100 || meeting === null;
  const pulse = summary && hour >= PULSE_FROM_HOUR && roomy ? summary.pulse : null;

  return (
    <div className="tv-box" data-testid="tv-today">
      <div className="tv-split min-h-0 flex-1">
        <div className="flex min-w-0 flex-col justify-center gap-[6vh]">
          {done ? (
            // a number of three digits leaves no room beside it: the figures go under it, without the rule
            <div className={done < 100 ? "flex items-end gap-[4vh]" : "flex flex-col gap-[4vh]"}>
              {/* as wide as the number: under a narrow one the caption takes two lines */}
              <div className="w-min shrink-0" data-testid="tv-today-hero">
                <p className="tv-hero" style={{ color: "var(--tv-text)" }}>
                  {done}
                </p>
                <p className="tv-body mt-[1.6vh] text-muted">готово сегодня</p>
              </div>
              {more.length > 0 || bars.length > 0 ? (
                <>
                  {done < 100 ? (
                    <span aria-hidden className="w-[0.3vh] shrink-0 self-stretch" style={{ background: "color-mix(in srgb, var(--text-muted) 32%, var(--bg))" }} />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col justify-end gap-[3vh]">
                    {more.length > 0 ? <Figures figures={more} /> : null}
                    {/* a three-digit day with a meeting below: the week gives way, the scene keeps its height */}
                    {done < 100 || meeting === null ? <WeekStrip bars={bars} /> : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-[4vh]">
              <p className="tv-title" style={{ color: "var(--tv-text)" }}>
                {greeting}
              </p>
              {more.length > 0 ? <Figures figures={more} /> : null}
              <WeekStrip bars={bars} />
            </div>
          )}

          {pulse ? <DayPulse pulse={pulse} hour={hour} /> : null}

          {meeting ? <TvMeetingLine meeting={meeting} /> : null}
        </div>

        <div className="flex min-w-0 flex-col items-start justify-end">
          <AnimatePresence mode="wait">
            {said ? (
              <motion.div
                key={said}
                className="relative mb-[3.4vh] max-w-full rounded-[3vh] px-[3.2vh] py-[2.2vh]"
                style={{ background: "var(--surface-2)", transformOrigin: "10vh 100%" }}
                initial={{ opacity: 0, y: "1.2vh" }}
                animate={{ opacity: 1, y: "0vh" }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE }}
                data-testid="tv-speech"
              >
                <p className="tv-body font-semibold [text-wrap:pretty]" style={{ color: "var(--tv-text)" }}>
                  {said}
                </p>
                {/* the tail: down and to the left, at the mascot's head */}
                <svg aria-hidden viewBox="0 0 30 24" className="absolute left-[9vh] top-[calc(100%-1px)] h-[2.6vh] w-[3.2vh]">
                  <path d="M0 0 H30 L3 24 Z" fill="var(--surface-2)" />
                </svg>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <span className="ml-[1vh]">
            <TvMascot mood={speech.mood} sizeVh={28} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** The figures beside the number: each its value and what it counts, in a column. */
function Figures({ figures }: { figures: readonly Figure[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-[2.4vh]">
      {figures.map((figure) => (
        <p key={figure.label} className="flex items-baseline gap-[1.8vh] whitespace-nowrap">
          <span className="tv-lead tv-num" style={{ color: "var(--tv-text)" }}>
            {figure.value}
          </span>
          <span className="tv-body text-muted">{figure.label}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * The next meeting (D-185): its hour and its name, then how soon — within the hour, «идёт», «завтра» — and where.
 * A meeting under way is the wall's «now» (`.tv-now`). «Сегодня» gives it two lines; the clock, a quiet scene, one —
 * without the place.
 */
export function TvMeetingLine({ meeting, single = false, className = "" }: { meeting: MeetingLine; single?: boolean; className?: string }) {
  const live = meeting.when === "идёт";
  // the plate of «now» keeps to the grid: it starts at the column's edge, the words step in from it
  const plate = live ? "tv-now self-start px-[2.6vh] py-[1.4vh]" : "";
  const head = (
    <>
      <span className="tv-num mr-[2vh] font-semibold">{meeting.time}</span>
      {meeting.title}
    </>
  );

  if (single) {
    return (
      <p className={`tv-body tv-two-lines min-w-0 ${plate} ${className}`} style={{ color: "var(--tv-text)" }} data-testid="tv-meeting">
        {head}
        {meeting.when ? <span className="ml-[2.4vh] whitespace-nowrap text-muted">{meeting.when}</span> : null}
      </p>
    );
  }

  return (
    <div className={`min-w-0 ${plate} ${className}`} data-testid="tv-meeting">
      <p className="tv-body tv-two-lines" style={{ color: "var(--tv-text)" }}>
        {head}
      </p>
      {meeting.when || meeting.place ? (
        <p className="tv-body mt-[0.6vh] flex flex-wrap gap-x-[3vh] text-muted">
          {meeting.when ? <span className={live ? "font-semibold" : undefined} style={live ? { color: "var(--tv-text)" } : undefined}>{meeting.when}</span> : null}
          {meeting.place ? <span>{meeting.place}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
