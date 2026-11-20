"use client";

import { motion } from "motion/react";

import type { TvMoment as TvMomentData } from "@/lib/tv/moment";

import { TvMascot } from "./TvMascot";

/**
 * A moment (D-185): praise, an award or an announcement over the whole wall for 25 seconds — the most festive
 * thing the wall shows. On the left of the grid, what happened: the points in gold as one number, the name large,
 * what for; an award — the «Награда» caption and what was received; an announcement — in its own words. On the
 * right the pleased mascot announces it. The background is a calm plane in tone: gold for points and awards, the
 * accent for an announcement.
 *
 * One movement: the points number fades in and grows a little once the scene has arrived; the rest
 * comes with the scene (the frame's transition).
 */

/** An announcement up to this long reads as a headline; a longer one goes a step down and wraps. */
const SHORT_ANNOUNCEMENT = 44;

const EASE = [0.2, 0, 0, 1] as const;

export function TvMoment({ moment }: { moment: TvMomentData }) {
  const announcement = moment.kind === "announcement";
  const tone = announcement ? "var(--accent)" : "var(--gold)";

  return (
    <div className="relative h-full w-full" data-testid="tv-moment" data-kind={moment.kind}>
      {/* the plane runs past the screen's edges (the burn-in shift moves the wall a few pixels) and stops at the band */}
      <span aria-hidden className="absolute -inset-x-[1vh] -top-[1vh] bottom-0" style={{ background: `color-mix(in srgb, ${tone} 10%, var(--bg))` }} />
      <div className="relative grid h-full w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[8vh] px-[var(--tv-x)] pb-[var(--tv-gap)] pt-[var(--tv-y)]">
        <div className="flex min-w-0 flex-col">
          {announcement ? <Announcement moment={moment} /> : <Praise moment={moment} />}
        </div>
        <div className="self-end pb-[4vh]">
          <TvMascot mood="happy" sizeVh={36} />
        </div>
      </div>
    </div>
  );
}

function Praise({ moment }: { moment: TvMomentData }) {
  const points = moment.kind === "points" && moment.amount ? moment.amount : null;
  return (
    <>
      {points ? (
        <motion.p
          className="tv-hero origin-left"
          style={{ color: "var(--gold)" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, duration: 0.7, ease: EASE }}
          data-testid="tv-moment-points"
        >
          +{points}
        </motion.p>
      ) : (
        <p className="tv-small font-semibold" style={{ color: "var(--gold)" }}>
          {moment.kind === "merch" ? "Награда" : "Похвала"}
        </p>
      )}
      <p className={`tv-title tv-two-lines [text-wrap:balance] ${points ? "mt-[4vh]" : "mt-[1.6vh]"}`} style={{ color: "var(--tv-text)" }}>
        {moment.name}
      </p>
      {moment.detail ? (
        <p className="tv-lead tv-two-lines mt-[2.4vh] [text-wrap:balance]" style={{ color: "var(--tv-text)", fontWeight: 400 }}>
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
      <p className="tv-small font-semibold" style={{ color: "var(--accent)" }}>
        Объявление
      </p>
      {text ? (
        <p className={`mt-[2vh] [overflow-wrap:anywhere] [text-wrap:pretty] ${short ? "tv-title" : "tv-lead"}`} style={{ color: "var(--tv-text)" }}>
          {text}
        </p>
      ) : null}
      <p className="tv-body mt-[3.4vh] text-muted">— {moment.name}</p>
    </>
  );
}
