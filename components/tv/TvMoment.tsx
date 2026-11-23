"use client";

import { motion } from "motion/react";

import type { TvMoment as TvMomentData } from "@/lib/tv/moment";

import { TvMascot } from "./TvMascot";

/**
 * A moment (D-185): praise, an award or an announcement over the whole wall for 25 seconds — the most festive
 * thing the wall shows, so it inverts the wall: the scene becomes one full plane, gold for points and an award,
 * the accent for an announcement, with the words in ink on it. On the main column of the grid, what happened: a
 * caption in plain case («Похвала», «Награда», «Объявление»), the points as one huge number, the name, what for;
 * an award — the name and what was received; an announcement — in its own words, signed. At the band, on the right,
 * the mascot with the megaphone of «Эфир» announces it — never the gold «happy» face (on the wall gold is points).
 *
 * One movement: the points number fades in and grows a little once the scene has arrived; the rest
 * comes with the scene (the frame's transition).
 */

/** An announcement up to this long reads as a headline; a longer one goes a step down and wraps. */
const SHORT_ANNOUNCEMENT = 44;

const EASE = [0.2, 0, 0, 1] as const;

/** The quieter ink: captions and the words under the name. */
const INK_SOFT = "color-mix(in srgb, var(--tv-ink) 72%, transparent)";

export function TvMoment({ moment }: { moment: TvMomentData }) {
  const announcement = moment.kind === "announcement";

  return (
    <div className="relative h-full w-full" data-testid="tv-moment" data-kind={moment.kind}>
      {/* the plane runs past the screen's edges (the burn-in shift moves the wall a few pixels) and stops at the band */}
      <span
        aria-hidden
        className="absolute -inset-x-[1vh] -top-[1vh] bottom-0"
        style={{ background: announcement ? "var(--tv-live)" : "var(--tv-points)" }}
      />
      <div className="tv-box relative" style={{ color: "var(--tv-ink)" }}>
        <div className="tv-split min-h-0 flex-1">
          <div className="flex min-w-0 flex-col justify-center">
            {announcement ? <Announcement moment={moment} /> : moment.kind === "merch" ? <Award moment={moment} /> : <Praise moment={moment} />}
          </div>
          <div className="flex min-w-0 flex-col items-end justify-end pr-[10vh]">
            <TvMascot mood="announcing" sizeVh={30} tone={announcement ? "live" : "gold"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <p className="tv-small font-semibold" style={{ color: INK_SOFT }}>
      {children}
    </p>
  );
}

function Praise({ moment }: { moment: TvMomentData }) {
  const points = moment.amount && moment.amount > 0 ? moment.amount : null;
  return (
    <>
      <Caption>Похвала</Caption>
      {points ? (
        <motion.p
          className="tv-num origin-left font-bold"
          // the one size off the scale (D-185): the celebration's number, a step over the scenes' tv-hero
          style={{ fontSize: "30vh", lineHeight: 0.86, letterSpacing: "-0.04em", marginLeft: "-0.03em" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, duration: 0.7, ease: EASE }}
          data-testid="tv-moment-points"
        >
          +{points}
        </motion.p>
      ) : null}
      <p className={`tv-title tv-two-lines [text-wrap:balance] ${points ? "mt-[3vh]" : "mt-[1.6vh]"}`}>{moment.name}</p>
      {moment.detail ? (
        <p className="tv-small mt-[1.6vh] max-h-[3lh] overflow-hidden [overflow-wrap:anywhere] [text-wrap:pretty]" style={{ color: INK_SOFT }}>
          {moment.detail}
        </p>
      ) : null}
    </>
  );
}

function Award({ moment }: { moment: TvMomentData }) {
  return (
    <>
      <Caption>Награда</Caption>
      <p className="tv-title tv-two-lines mt-[1.6vh] [text-wrap:balance]">{moment.name}</p>
      {moment.detail ? (
        // what was received: the same size as the name, its weight lighter — the two read as one sentence
        <p className="tv-title tv-two-lines mt-[2.4vh] [overflow-wrap:anywhere] [text-wrap:balance]" style={{ fontWeight: 400, color: INK_SOFT }}>
          {moment.detail}
        </p>
      ) : null}
    </>
  );
}

function Announcement({ moment }: { moment: TvMomentData }) {
  const text = moment.detail ?? "";
  const short = text.length <= SHORT_ANNOUNCEMENT;
  return (
    <>
      <Caption>Объявление</Caption>
      {text ? (
        <p className={`mt-[2vh] [overflow-wrap:anywhere] [text-wrap:pretty] ${short ? "tv-title" : "tv-lead"}`} style={short ? undefined : { fontWeight: 600 }}>
          {text}
        </p>
      ) : null}
      <p className="tv-small mt-[3vh]" style={{ color: INK_SOFT }}>
        — {moment.name}
      </p>
    </>
  );
}
