"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, type ReactNode } from "react";

import { leadersView, RATING_TITLE, type LeaderRow } from "@/lib/tv/leaders";
import type { TvRatingScene } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";
import { TvSceneHead } from "./TvSceneHead";

/**
 * The «Рейтинг» scene (D-123, look D-185) — like a standings column in a broadcast: the leader large on the left —
 * name, points in gold, growth on the previous period; places 2–5 as lines on the right; one line of the team's total below.
 *
 * What is not here and never will be: sixth place and below, drops, «в срок», fines and purchases — nothing bad
 * goes on the wall by name (D-45); awards as lines — an award comes as a full-screen moment.
 * Faces are real photos only, no initials. With a guest in the office the rating is hidden (D-33), with no note
 * about the guest. Rules live in `lib/tv/leaders.ts`, only the layout here.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvLeaders({ data }: { data: TvRatingScene | null; now: Date }) {
  // the scene re-renders every second with the clock; the places change when the data does
  const view = useMemo(() => leadersView(data), [data]);
  if (!data) return null;
  if (view.state !== "ready") {
    // a guest in the office or points off: one calm line, no word about the guest (D-33, D-185)
    return (
      <div className="tv-box" data-testid={view.state === "hidden" ? "tv-rating-hidden" : "tv-rating-off"}>
        <TvSceneHead title={RATING_TITLE[data.period]} />
        <div className="flex min-h-0 flex-1 flex-col justify-center pb-[8vh]">
          <p className="tv-title" style={{ color: "var(--tv-text)" }}>
            {view.state === "hidden" ? "Рейтинг покажем позже" : "Рейтинг появится, когда включат очки"}
          </p>
        </div>
      </div>
    );
  }

  if (!view.leader) {
    // nobody has points yet: the calm line, and what the team did meanwhile
    return (
      <div className="tv-box" data-testid="tv-rating" data-empty>
        <TvSceneHead title={view.title} sub={view.span} />
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-[var(--tv-gap)] pb-[8vh]">
          <p className="tv-title" style={{ color: "var(--tv-text)" }}>
            {data.period === "month" ? "Первые очки месяца — впереди" : "Первые очки недели — впереди"}
          </p>
          {view.team ? <p className="tv-body text-muted">{view.team}</p> : null}
        </div>
      </div>
    );
  }

  // the one number of the scene; ten thousand and more steps down the scale instead of running out of its column
  const hero = view.leader.points.length > 5 ? "tv-title tv-num" : "tv-hero";

  return (
    <div className="tv-box" data-testid="tv-rating">
      <TvSceneHead title={view.title} sub={view.span} />
      <div className="grid min-h-0 flex-1 gap-x-[7vh]" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1fr)" }}>
        {/* the leader: the name, the points in gold, the rise; gold is the points, the number needs no word */}
        <section className="flex min-w-0 flex-col" aria-label="Первое место">
          <Swap id={view.leader.id}>
            <div className="flex flex-col gap-[2vh]">
              <TvAvatar src={view.leader.avatar} size={16} />
              <p className="tv-title tv-two-lines" style={{ color: "var(--tv-text)" }}>
                {view.leader.name}
              </p>
              <p className={`${hero} mt-[1vh] whitespace-nowrap`} style={{ color: "var(--gold)" }} aria-label={`${view.leader.points} ${view.leader.pointsWord}`}>
                {view.leader.points}
              </p>
              {view.leaderGrowth ? (
                <p className="tv-body tv-num font-semibold" style={{ color: "var(--ok)" }}>
                  {view.leaderGrowth}
                </p>
              ) : null}
            </div>
          </Swap>
        </section>

        {/* places two to five; keyed by place — an award that reorders them changes who holds a place, not the rows */}
        <ol className="flex min-w-0 flex-col gap-[3vh]" aria-label="Места 2–5">
          {view.rest.map((row) => (
            <li key={row.rank} className="grid items-baseline gap-x-[2.4vh]" style={{ gridTemplateColumns: "5vh minmax(0, 1fr)" }}>
              <span className="tv-lead tv-num text-muted">{row.rank}</span>
              <Swap id={row.id}>
                <Place row={row} />
              </Swap>
            </li>
          ))}
        </ol>
      </div>
      {view.team ? <p className="tv-small text-muted">{view.team}</p> : null}
    </div>
  );
}

/** One place of two to five: the face if there is a photo, the name, the rise under it, the points on the right. */
function Place({ row }: { row: LeaderRow }) {
  return (
    <div className="flex min-w-0 items-baseline gap-[2.4vh]">
      {row.avatar ? (
        <span className="self-center">
          <TvAvatar src={row.avatar} size={8} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="tv-body tv-two-lines font-semibold" style={{ color: "var(--tv-text)" }}>
          {row.name}
        </p>
        {/* the rise, or its empty line: the four places stand at an even step */}
        <p className="tv-small tv-num font-semibold" style={{ color: "var(--ok)" }} aria-hidden={row.growth ? undefined : true}>
          {row.growth ?? " "}
        </p>
      </div>
      <span className="tv-lead tv-num shrink-0 whitespace-nowrap" style={{ color: "var(--gold)" }}>
        {row.points}
      </span>
    </div>
  );
}

/**
 * Who holds a place. An award that reorders the five changes the holder in place: the one leaving fades
 * out, then the new one fades in — the place never jumps. The first render just shows the holder (the
 * scene's own entrance brings it). Opacity only, as the wall's frame does.
 */
function Swap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        className="min-w-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.5, ease: EASE } }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
