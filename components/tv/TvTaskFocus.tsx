"use client";

import { Fragment, useMemo } from "react";

import { stageOf, taskPath, taskTitle, type PathStep } from "@/lib/tv/focus";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * One order over the whole screen (D-123, look D-185): the director tapped «На экран» on the task screen — the wall
 * shows the order's title large, whose it is and what it is about, the path «Поставлено → В работе → На проверке → Готово»
 * with the current step, and photos from the order's report. Used when two people go over one order.
 *
 * Like the whole wall: not a word of the chat, no message counters, no log, no deadlines, no decline, no
 * «просрочено»; the base does not hand out a declined or revoked order, and the wall goes back on air (D-45).
 * Rework is «В работе» again. A guest gets no title (D-33). Rules live in `lib/tv/focus.ts`.
 */

/** Up to three large photos on the right: one, two side by side, or one big and two stacked. */
const PHOTOS = 3;

export function TvTaskFocus({ focus, photos = [] }: { focus: TvTaskFocusData; remainingMs: number; now: Date; photos?: TvPhoto[] }) {
  const steps = useMemo(() => taskPath(focus.task), [focus.task]);
  const shots = focus.guest ? [] : photos.slice(0, PHOTOS);
  const person = focus.employee;
  const done = stageOf(focus.task.status) === "done";
  // a guest gets no words of the director's from the base (D-33)
  const body = focus.guest ? null : focus.task.body?.trim() || null;

  // with photos the way runs across the bottom; without them it stands as a column on the right
  const across = shots.length > 0;

  return (
    <div className="tv-box" data-testid="tv-task" data-stage={stageOf(focus.task.status) ?? undefined}>
      <div
        className="grid min-h-0 flex-1 gap-x-[8vh]"
        style={{ gridTemplateColumns: across ? "minmax(0, 1fr) minmax(0, 0.9fr)" : "minmax(0, 1fr) auto" }}
      >
        {/* the order: its title and whose it is; kept clear of the channel mark in the top right corner */}
        <section className="flex min-h-0 min-w-0 max-w-[96vh] flex-col gap-[var(--tv-gap)]">
          <h2 className="tv-title max-h-[3lh] overflow-hidden [overflow-wrap:anywhere]" style={{ color: "var(--tv-text)" }}>
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
          {/* what the order is about, in the director's words: five lines at most and only whole lines —
              lines that do not fit flow into a second column, which the box clips (no ellipsis, no half line) */}
          {body ? (
            <div
              // a pixel over five lines: rounding must not push the fifth line out; a line may stand alone
              className="tv-body min-h-0 max-h-[calc(5lh+1px)] flex-1 overflow-hidden"
              style={{ columnWidth: "400vh", columnGap: "10vh", columnFill: "auto", widows: 1, orphans: 1 }}
            >
              <p className="text-muted [overflow-wrap:anywhere]">{body}</p>
            </div>
          ) : null}
        </section>

        {/* the channel mark owns the top right corner: the photos or the way start below it */}
        <section className="min-h-0 min-w-0 pt-[8vh]">{across ? <Photos photos={shots} /> : <Path steps={steps} done={done} vertical />}</section>
      </div>

      {across ? <Path steps={steps} done={done} vertical={false} /> : null}
    </div>
  );
}

/**
 * The way of the order in four big steps. The current one stands on a plane of the scene's colour and
 * reads as «now», the passed ones in plain text, the ones ahead quiet. Accepted — the plane is green:
 * the one good-news colour of the wall. Across the bottom (under photos) the steps go with arrows and
 * the plane hangs into the margin, so the words keep the grid's edge; as a column on the right they
 * stand one under another, a step larger.
 */
function Path({ steps, done, vertical }: { steps: PathStep[]; done: boolean; vertical: boolean }) {
  const tone = done ? "var(--ok)" : "var(--accent)";
  const size = vertical ? "tv-lead" : "tv-body";
  return (
    <ol
      className={vertical ? "flex flex-col items-start gap-y-[1.6vh]" : "ml-[-2.4vh] flex flex-wrap items-center gap-x-[1.6vh] gap-y-[1vh]"}
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
            className={`${size} whitespace-nowrap rounded-[1.4vh] px-[2.4vh] py-[1.2vh]`}
            // the weight inline: `.tv-lead` sets its own and would win over a utility class
            style={
              step.state === "now"
                ? { background: `color-mix(in srgb, ${tone} 26%, var(--bg))`, color: "var(--tv-text)", fontWeight: 600 }
                : step.state === "passed"
                  ? { color: "var(--tv-text)", fontWeight: 400 }
                  : { color: "var(--text-muted)", opacity: 0.6, fontWeight: 400 }
            }
            data-state={step.state}
            aria-current={step.state === "now" ? "step" : undefined}
          >
            {step.label}
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
