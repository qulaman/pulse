"use client";

import { Fragment, useMemo } from "react";

import { stageOf, taskPath, taskTitle, type PathStep } from "@/lib/tv/focus";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * One order over the whole screen (D-123, look D-185): the director tapped «На экран» on the task screen — the wall
 * shows, on its two-column grid, the order's title large, whose it is and what it is about in the main column,
 * photos from the order's report in the side column, and the path «Поручено → В работе → На проверке → Готово» with
 * the current step. Used when two people go over one order.
 *
 * Like the whole wall: not a word of the chat, no message counters, no log, no deadlines, no decline, no
 * «просрочено»; the base does not hand out a declined or revoked order, and the wall goes back on air (D-45).
 * Rework is «В работе» again. A guest gets no title (D-33). Rules live in `lib/tv/focus.ts`.
 */

/** Up to three large photos on the right: one, two side by side, or one big and two stacked. */
const PHOTOS = 3;

/** A tick before a step, with a narrow no-break space: the four steps with their ticks and arrows keep one line across the wall. */
const TICK = "✓\u202f";

/** The director's words a step quieter than the title, still white: grey body text does not read across a room. */
const BODY_COLOR = "color-mix(in srgb, var(--text) 80%, transparent)";

export function TvTaskFocus({ focus, photos = [] }: { focus: TvTaskFocusData; remainingMs: number; now: Date; photos?: TvPhoto[] }) {
  const steps = useMemo(() => taskPath(focus.task), [focus.task]);
  const shots = focus.guest ? [] : photos.slice(0, PHOTOS);
  const person = focus.employee;
  // a guest gets no words of the director's from the base (D-33)
  const body = focus.guest ? null : focus.task.body?.trim() || null;

  // with photos the way runs across the bottom; without them it stands as a column on the right
  const across = shots.length > 0;

  return (
    <div className="tv-box" data-testid="tv-task" data-stage={stageOf(focus.task.status) ?? undefined}>
      <div className="tv-split flex-1">
        {/* the order: its title, whose it is, what it is about */}
        <section className="flex min-h-0 min-w-0 flex-col gap-[var(--tv-gap)]">
          <h2 className="tv-title max-h-[3lh] overflow-hidden break-words" style={{ color: "var(--tv-text)" }}>
            {taskTitle(focus.task)}
          </h2>
          {person ? (
            <div className="flex items-center gap-[2.4vh]">
              <TvAvatar src={person.avatar_url} size={8} />
              <p className="tv-body font-semibold" style={{ color: "var(--tv-text)" }}>
                {person.name}
              </p>
            </div>
          ) : null}
          {/* the director's words: three whole lines at most — the fourth is not drawn, no ellipsis */}
          {body ? (
            <p className="tv-body max-h-[3lh] overflow-hidden break-words" style={{ color: BODY_COLOR }}>
              {body}
            </p>
          ) : null}
        </section>

        {/* the channel mark owns the top right corner: the photos or the way start below it */}
        <section className="min-h-0 min-w-0 pt-[8vh]">{across ? <Photos photos={shots} /> : <Path steps={steps} vertical />}</section>
      </div>

      {across ? <Path steps={steps} vertical={false} /> : null}
    </div>
  );
}

/**
 * The way of the order in four big steps, in the wall's one grammar: the passed ones quiet with a tick, the
 * current one on the «now» plate (`.tv-now`, the same as the meeting under way and the point under discussion),
 * the ones ahead dim. Across the bottom (under photos) the steps go with arrows and the words keep the grid's
 * edge — only the current step has the plate's padding; as a column on the right every step has it, and the
 * plate spans the column.
 */
function Path({ steps, vertical }: { steps: PathStep[]; vertical: boolean }) {
  return (
    <ol
      className={vertical ? "flex flex-col gap-y-[1.6vh]" : "flex flex-nowrap items-center gap-x-[1.6vh]"}
      data-testid="tv-task-steps"
    >
      {steps.map((step, index) => (
        <Fragment key={step.key}>
          {index > 0 && !vertical ? (
            <li aria-hidden className="tv-body text-muted" style={{ opacity: step.state === "next" ? 0.5 : 1 }}>
              →
            </li>
          ) : null}
          <li
            className={`tv-body whitespace-nowrap py-[1.2vh] ${step.state === "now" ? "tv-now px-[2.4vh]" : vertical ? "px-[2.4vh]" : ""}`}
            style={
              step.state === "now"
                ? { color: "var(--tv-text)", fontWeight: 600 }
                : step.state === "passed"
                  ? { color: "var(--text-muted)" }
                  : { color: "var(--text-muted)", opacity: 0.5 }
            }
            data-state={step.state}
            aria-current={step.state === "now" ? "step" : undefined}
          >
            {/* a passed step is done with; the last step reached is done too */}
            {step.state === "passed" || (step.state === "now" && step.key === "done") ? `${TICK}${step.label}` : step.label}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** One photo fills the place; two stand side by side; three — one large and two in a column. */
function Photos({ photos }: { photos: TvPhoto[] }) {
  const three = photos.length >= 3;
  return (
    <div
      className="grid h-full min-h-0 gap-[2vh]"
      style={{
        gridTemplateColumns: photos.length === 1 ? "minmax(0, 1fr)" : three ? "minmax(0, 1.5fr) minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
        gridTemplateRows: three ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
      }}
      data-testid="tv-task-photos"
    >
      {photos.map((photo, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- a signed link from the report bucket
        <img
          key={photo.id}
          src={photo.url}
          alt=""
          className="h-full min-h-0 w-full rounded-[1.2vh] object-cover"
          style={{ background: "var(--surface)", gridRow: three && index === 0 ? "span 2" : undefined }}
        />
      ))}
    </div>
  );
}
