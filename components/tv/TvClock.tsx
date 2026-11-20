"use client";

import { tvDate, tvTime } from "@/lib/tv/clock";
import { meetingOf } from "@/lib/tv/overlay";
import type { TvEventRow } from "@/lib/tv/queries";
import type { ClockStyle } from "@/lib/tv/state";

import { TvAnalogClock } from "./TvAnalogClock";
import { TvMeetingLine } from "./TvToday";

/**
 * The «часы» scene: a quiet screen for meetings (D-76 §8, D-185). A conversation is going on in the room — the wall
 * does not pull the eye with the face and news, but does not go black either: a TV switched off reads as broken.
 *
 * Digits nearly the full height, on the left of the grid, the date and the next meeting under them; with hands, a large
 * dial on the left, the date and the meeting on the right. No clock in the bottom band on this scene (TvFrame), no
 * company name — it is in the channel mark.
 *
 * The digits are the one size outside the wall's scale (tv-type.css): this scene is the clock.
 */

/** The digits' size: a share of the wall's height, the same picture on 720p and 4K. */
const DIGITS_VH = 54;

export function TvClock({
  now,
  next,
  clock,
}: {
  company: string;
  logoUrl: string | null;
  now: Date;
  /** Ближайшее мероприятие компании; у гостя без названия (D-33). */
  next: TvEventRow | null;
  clock: ClockStyle;
}) {
  const meeting = next ? meetingOf(next, now) : null;

  if (clock === "analog") {
    const [weekday, date] = splitDate(tvDate(now));
    return (
      <div
        className="flex h-full w-full items-center gap-[9vh] px-[var(--tv-x)] pb-[var(--tv-gap)] pt-[var(--tv-y)]"
        data-testid="tv-clock"
        data-clock="analog"
      >
        <TvAnalogClock now={now} size="74vh" className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="tv-title first-letter:uppercase" style={{ color: "var(--tv-text)" }}>
            {weekday}
          </p>
          {date ? <p className="tv-lead mt-[1.6vh] text-muted">{date}</p> : null}
          {meeting ? <TvMeetingLine meeting={meeting} single className="mt-[7vh]" /> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col justify-center px-[var(--tv-x)] pb-[var(--tv-gap)] pt-[var(--tv-y)]"
      data-testid="tv-clock"
      data-clock="digital"
    >
      <p
        className="tv-num font-bold"
        style={{ fontSize: `${DIGITS_VH}vh`, lineHeight: 0.82, letterSpacing: "-0.035em", color: "var(--tv-text)", marginLeft: "-0.04em" }}
      >
        {tvTime(now)}
      </p>
      <p className="tv-lead mt-[5vh] first-letter:uppercase" style={{ color: "var(--tv-text)" }}>
        {tvDate(now)}
      </p>
      {meeting ? <TvMeetingLine meeting={meeting} single className="mt-[3vh]" /> : null}
    </div>
  );
}

/** «пятница, 25 сентября» → «пятница» и «25 сентября». */
function splitDate(text: string): [string, string | null] {
  const comma = text.indexOf(",");
  if (comma < 0) return [text, null];
  return [text.slice(0, comma), text.slice(comma + 1).trim()];
}
