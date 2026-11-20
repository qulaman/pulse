"use client";

import { useMemo } from "react";

import { personView, type PersonItem, type PersonStat } from "@/lib/tv/focus";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvFocusEmployee } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * A person on the wall (D-76 §10, D-96; look D-185): the director tapped on the phone — the wall shows the person
 * large and their work. On the left the name, the position and up to three good numbers — done this week, in progress,
 * points this week; on the right photos from their reports and the open orders as lines: title and stage.
 *
 * The wall shows the person, it does not interrogate them: no minute-by-minute history, no deadlines, no «в срок N»,
 * no «Новый срок», no «Снова в работе», no «на экране ещё 7 мин» bar (D-45, D-185). Zeros are not
 * printed. A guest gets the name and the numbers, no orders (D-33). Rules live in `lib/tv/focus.ts`, the layout here.
 */

/** Report photos beside the orders: one or two large in place of part of the list. */
const PHOTOS = 2;

const STAT_COLOR: Record<PersonStat["key"], string> = {
  done: "var(--tv-text)",
  open: "var(--tv-text)",
  points: "var(--gold)",
};

export function TvFocus({ focus, photos = [] }: { focus: TvFocusEmployee; remainingMs: number; now: Date; photos?: TvPhoto[] }) {
  // the scene re-renders every second with the clock; the person changes when the data does
  const view = useMemo(() => personView(focus), [focus]);
  const shots = focus.guest ? [] : photos.slice(0, PHOTOS);
  const right = view.items.length > 0 || shots.length > 0;

  return (
    <div className="tv-box" data-testid="tv-focus" data-mode={view.mode}>
      <div
        className="grid min-h-0 flex-1 gap-x-[8vh]"
        style={{ gridTemplateColumns: right ? "minmax(0, 0.7fr) minmax(0, 1fr)" : "minmax(0, 1fr)" }}
      >
        {/* the person */}
        <section className="flex min-h-0 min-w-0 flex-col gap-[var(--tv-gap)]">
          <TvAvatar src={view.avatar} size={14} />
          <div className="flex flex-col gap-[1.4vh]">
            <h2 className="tv-title tv-two-lines" style={{ color: "var(--tv-text)" }}>
              {view.name}
            </h2>
            {view.position ? <p className="tv-body tv-two-lines text-muted">{view.position}</p> : null}
          </div>
          {view.stats.length > 0 ? <Stats stats={view.stats} row={!right} /> : null}
        </section>

        {/* the work: photos from the reports first, the open orders under them */}
        {right ? (
          // the channel mark owns the top right corner: this column starts below it
          <section className="flex min-h-0 min-w-0 flex-col gap-[var(--tv-gap)] pt-[8vh]">
            {shots.length > 0 ? <Photos photos={shots} tall={view.items.length === 0} /> : null}
            {view.items.length > 0 ? <Items items={view.items} /> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The good numbers, each with its words right after it: in a column beside the work, or in a row of
 * large numbers when the person stands alone (a guest, nothing open) — then they take the width the
 * work would have taken.
 */
function Stats({ stats, row }: { stats: PersonStat[]; row: boolean }) {
  if (row) {
    return (
      <div className="mt-[3vh] flex gap-x-[12vh]">
        {stats.map((stat) => (
          <p key={stat.key} className="flex min-w-0 flex-col gap-[1.4vh]">
            <span className="tv-hero" style={{ color: STAT_COLOR[stat.key] }}>
              {stat.value}
            </span>
            <span className="tv-small text-muted">{stat.label}</span>
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-[1vh] flex flex-col gap-[1.2vh]">
      {stats.map((stat) => (
        <p key={stat.key} className="flex items-baseline gap-[2.4vh]">
          <span className="tv-title tv-num" style={{ color: STAT_COLOR[stat.key] }}>
            {stat.value}
          </span>
          <span className="tv-small text-muted">{stat.label}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * The open orders as a board: the title on the left, where it stands on the right. Only whole orders
 * are drawn — one that would not fit wraps into a second column, which the box clips (no half-drawn
 * title, no «ещё N»).
 */
function Items({ items }: { items: PersonItem[] }) {
  return (
    <ol className="flex min-h-0 flex-1 flex-col flex-wrap content-start gap-x-[10vh] gap-y-[3vh] overflow-hidden" data-testid="tv-focus-items">
      {items.map((item) => (
        <li key={item.id} className="flex w-full min-w-0 items-baseline gap-[4vh]" data-stage={item.stage}>
          <p className="tv-body tv-two-lines min-w-0 flex-1" style={{ color: "var(--tv-text)" }}>
            {item.title}
          </p>
          <p className="tv-small shrink-0 font-semibold" style={{ color: item.stage === "done" ? "var(--ok)" : "var(--accent)" }}>
            {item.word}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Photos from the person's reports, large. Photos of one order share one caption under the row;
 * the caption is the order's title, cut at a line, never with an ellipsis.
 */
function Photos({ photos, tall }: { photos: TvPhoto[]; tall: boolean }) {
  const titles = [...new Set(photos.map((photo) => photo.title).filter((title): title is string => Boolean(title)))];
  const shared = titles.length === 1;
  return (
    <figure className="flex min-w-0 shrink-0 flex-col gap-[1.4vh]" data-testid="tv-focus-photos">
      <div className={`flex min-w-0 gap-[2.4vh] ${tall ? "h-[52vh]" : "h-[32vh]"}`}>
        {photos.map((photo) => (
          <div key={photo.id} className="flex h-full min-w-0 max-w-[64vh] flex-1 flex-col gap-[1.2vh]">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed link from the report bucket */}
            <img src={photo.url} alt="" className="min-h-0 w-full flex-1 rounded-[1.2vh] object-cover" style={{ background: "var(--surface)" }} />
            {!shared && photo.title ? <p className="tv-small max-h-[1lh] overflow-hidden text-muted">{photo.title}</p> : null}
          </div>
        ))}
      </div>
      {shared ? <figcaption className="tv-small max-h-[1lh] overflow-hidden text-muted">{titles[0]}</figcaption> : null}
    </figure>
  );
}
