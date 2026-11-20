"use client";

import { AnimatePresence, motion } from "motion/react";

import { aqtobeClock } from "@/lib/tv/clock";
import { meetingOf, type MeetingLine } from "@/lib/tv/overlay";
import type { TvSummary } from "@/lib/tv/queries";
import { greetingOf, type TvSpeech } from "@/lib/tv/voice";

import { DayPulse } from "./DayPulse";
import { TvMascot } from "./TvMascot";

/**
 * «Сегодня» is the wall's home (D-185): it stands between all the scenes of the round, on screen half the time.
 *
 * On the left of the grid, one number of the day, large: how many were done today, and while nothing is done, how
 * many are in progress; beside it two secondary figures (in progress, this week; zeros are not shown), under them the
 * next meeting and the day's rhythm by the hour with a «сейчас» mark (DayPulse). A day without a single number gets a
 * greeting by the hour in place of the number. On the right, the mascot and its phrase: news of the last minute and a
 * half, or a greeting. The top right corner is the channel mark; the mascot stands below it.
 *
 * Only good news (D-45): no overdue, no declines, no «дел нет».
 */

type Figure = { value: number; label: string };

/** The day's one number and the two beside it — zeros are never shown. */
function figuresOf(summary: TvSummary | null): { hero: Figure | null; more: Figure[] } {
  const today = summary?.today ?? { sent: 0, done: 0, in_work: 0 };
  const week = (summary?.week ?? []).reduce((sum, day) => sum + day.done, 0);
  const hero: Figure | null =
    today.done > 0 ? { value: today.done, label: "сделано сегодня" } : today.in_work > 0 ? { value: today.in_work, label: "в работе" } : null;
  const more: Figure[] = [];
  if (today.done > 0 && today.in_work > 0) more.push({ value: today.in_work, label: "в работе" });
  // beside «сделано сегодня» the week reads as its sibling; alone it says what it counts
  if (week > 0) more.push({ value: week, label: today.done > 0 ? "за неделю" : "сделано за неделю" });
  return { hero, more };
}

export function TvToday({ speech, summary, now }: { speech: TvSpeech; summary: TvSummary | null; now: Date }) {
  const { hero, more } = figuresOf(summary);
  const next = summary?.events[0] ?? null;
  const meeting = next ? meetingOf(next, now) : null;
  // a day without numbers has the greeting for its headline: the face then only says the news
  const greeting = hero ? null : greetingOf(now, summary?.today);
  const said = greeting && speech.mood === "calm" ? null : speech.text;

  return (
    <div
      className="grid h-full w-full grid-cols-[minmax(0,1fr)_60vh] gap-x-[8vh] px-[var(--tv-x)] pb-[var(--tv-gap)] pt-[var(--tv-y)]"
      data-testid="tv-today"
    >
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex flex-wrap items-end gap-x-[10vh] gap-y-[4vh]">
          {hero ? (
            <div data-testid="tv-today-hero">
              <p className="tv-hero" style={{ color: "var(--tv-text)" }}>
                {hero.value}
              </p>
              <p className="tv-body mt-[1.6vh] text-muted">{hero.label}</p>
            </div>
          ) : (
            <p className="tv-title" style={{ color: "var(--tv-text)" }}>
              {greeting}
            </p>
          )}
          {more.length > 0 ? (
            <div className="flex flex-col gap-[2.4vh]">
              {more.map((figure) => (
                <p key={figure.label} className="flex items-baseline gap-[1.6vh]">
                  <span className="tv-lead tv-num" style={{ color: "var(--tv-text)" }}>
                    {figure.value}
                  </span>
                  <span className="tv-body text-muted">{figure.label}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {meeting ? <TvMeetingLine meeting={meeting} className="mt-[7vh]" /> : null}

        {summary ? (
          <div className="mt-[7vh]">
            <DayPulse pulse={summary.pulse} hour={aqtobeClock(now).h} />
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col justify-center pt-[12vh]">
        <TvMascot mood={speech.mood} sizeVh={46} />
        <div className="mt-[3vh] h-[calc(2*1.18*5.6vh)]">
          <AnimatePresence mode="wait">
            {said ? (
              <motion.p
                key={said}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
                className="tv-body tv-two-lines pl-[2.6vh] font-semibold"
                style={{ color: "var(--tv-text)" }}
                data-testid="tv-speech"
              >
                {said}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * The next meeting (D-185): its hour in the accent and its name, then how soon — within the hour,
 * «идёт», «завтра» — and where. «Сегодня» gives it two lines; the clock, a quiet scene, one —
 * without the place.
 */
export function TvMeetingLine({ meeting, single = false, className = "" }: { meeting: MeetingLine; single?: boolean; className?: string }) {
  const when = meeting.when ? (
    <span className="font-semibold" style={{ color: "var(--tv-text)" }}>
      {meeting.when}
    </span>
  ) : null;
  const head = (
    <>
      <span className="tv-num mr-[2vh] font-semibold" style={{ color: "var(--accent)" }}>
        {meeting.time}
      </span>
      {meeting.title}
    </>
  );

  if (single) {
    return (
      <p className={`tv-body tv-two-lines min-w-0 ${className}`} style={{ color: "var(--tv-text)" }} data-testid="tv-meeting">
        {head}
        {when ? <span className="ml-[2.4vh] whitespace-nowrap">{when}</span> : null}
      </p>
    );
  }

  return (
    <div className={`min-w-0 ${className}`} data-testid="tv-meeting">
      <p className="tv-body tv-two-lines" style={{ color: "var(--tv-text)" }}>
        {head}
      </p>
      {when || meeting.place ? (
        <p className="tv-body mt-[0.6vh] flex flex-wrap gap-x-[3vh] text-muted">
          {when}
          {meeting.place ? <span>{meeting.place}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
