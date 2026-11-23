"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { leadersView, RATING_TITLE, type LeaderRow } from "@/lib/tv/leaders";
import type { TvRatingScene } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";
import { TvSceneHead } from "./TvSceneHead";

/**
 * The «Рейтинг» scene (D-123, look D-185) — like a standings column in a broadcast, on the wall's two-column grid:
 * the leader large in the main column — place «1», name, points in gold, growth on the previous period; places 2–5
 * as lines of one height in the side column — place, first name with the rise beside it, surname under it, points in
 * gold in one right-aligned column; one line of the team's total below.
 *
 * What is not here and never will be: sixth place and below, drops, «в срок», fines and purchases — nothing bad
 * goes on the wall by name (D-45); awards as lines — an award comes as a full-screen moment.
 * Faces are real photos only, no initials. With a guest in the office the rating is hidden (D-33), with no note
 * about the guest. Rules and words live in `lib/tv/leaders.ts`, only the layout here.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvLeaders({ data, now }: { data: TvRatingScene | null; now: Date }) {
  // five rows and a date line: cheap enough to build with every second's render
  const view = leadersView(data, now);
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
          {view.team ? <p className="tv-body text-muted [text-wrap:balance]">{view.team}</p> : null}
        </div>
      </div>
    );
  }

  // a photo slot in every line once anybody of the four has a photo: the names keep one x
  const faces = view.rest.some((row) => row.avatar);

  return (
    <div className="tv-box" data-testid="tv-rating">
      <TvSceneHead title={view.title} sub={view.span} />
      <div className="tv-split flex-1">
        <section className="flex min-w-0 flex-col" aria-label="Первое место">
          <Swap id={view.leader.id}>
            <Leader row={view.leader} growth={view.leaderGrowth} />
          </Swap>
        </section>

        {/* places two to five; keyed by place — an award that reorders them changes who holds a place, not the rows */}
        <ol className="flex min-w-0 flex-col gap-[4vh]" aria-label="Места 2–5">
          {view.rest.map((row) => (
            <li
              key={row.rank}
              className="grid min-h-[12vh] items-baseline gap-x-[2.4vh]"
              style={{ gridTemplateColumns: "4vh minmax(0, 1fr)" }}
            >
              <span className="tv-body tv-num text-muted">{row.rank}</span>
              <Swap id={row.id}>
                <Place row={row} faces={faces} />
              </Swap>
            </li>
          ))}
        </ol>
      </div>
      {view.team ? <p className="tv-small text-muted">{view.team}</p> : null}
    </div>
  );
}

/**
 * First place: «1» before the name, the way the places on the right carry theirs, the points in gold — the
 * one number of the scene, gold is the points and the number needs no word — and the rise under it.
 */
function Leader({ row, growth }: { row: LeaderRow; growth: string | null }) {
  // «12 400» still stands in the main column at the hero size; a six-figure sum steps down instead of running out
  const hero = row.points.length > 6 ? "tv-title tv-num" : "tv-hero";
  return (
    <div className="flex flex-col gap-[2vh]">
      <div className="flex min-w-0 items-start gap-x-[2.4vh]">
        <span className="tv-title tv-num text-muted" aria-label="Первое место">
          {row.rank}
        </span>
        {row.avatar ? (
          // a face sits on the name's first line
          <span className="mt-[0.2vh] shrink-0">
            <TvAvatar src={row.avatar} size={10} />
          </span>
        ) : null}
        <p className="tv-title tv-two-lines min-w-0" style={{ color: "var(--tv-text)" }}>
          {row.name}
        </p>
      </div>
      <p className={`${hero} whitespace-nowrap`} style={{ color: "var(--tv-points)" }} aria-label={`${row.points} ${row.pointsWord}`}>
        {row.points}
      </p>
      {growth ? (
        <p className="tv-small font-semibold" style={{ color: "var(--ok)" }}>
          {growth}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One place of two to five, one height for all four: the face if there is a photo, the first name with the rise
 * right after it, the surname under it, the points in gold in a column of one width on the right edge.
 */
function Place({ row, faces }: { row: LeaderRow; faces: boolean }) {
  const [first = "", ...rest] = row.name.trim().split(/\s+/);
  const last = rest.join(" ");
  return (
    <div
      className="grid min-w-0 items-baseline gap-x-[2.4vh]"
      style={{ gridTemplateColumns: faces ? "8vh minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}
    >
      {faces ? (
        <span className="self-start">
          <TvAvatar src={row.avatar} size={8} />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-[2vh]">
          <span className="tv-body min-w-0 break-words font-semibold" style={{ color: "var(--tv-text)" }}>
            {first}
          </span>
          {row.growth ? (
            <span className="tv-small tv-num font-semibold" style={{ color: "var(--ok)" }}>
              {row.growth}
            </span>
          ) : null}
        </p>
        {last ? <p className="tv-small tv-two-lines text-muted">{last}</p> : null}
      </div>
      {/* a column of one width for every place: the numbers stand right-aligned, «12 400» included */}
      <span className="tv-body tv-num w-[5.4ch] whitespace-nowrap text-right font-semibold" style={{ color: "var(--tv-points)" }}>
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
