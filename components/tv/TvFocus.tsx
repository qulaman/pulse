"use client";

import { Fragment, useMemo } from "react";

import { personView, type PersonItem, type PersonStat } from "@/lib/tv/focus";
import { formatPoints } from "@/lib/tv/leaders";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvFocusEmployee } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * A person on the wall (D-76 §10, D-96; look D-185): the director tapped on the phone — the wall shows the person
 * large and their work, on the wall's two-column grid. In the main column the name, the position and up to three
 * good numbers — done this week, in progress, points this week — the numbers in one right-aligned column, their words
 * from one x; in the side column photos from their reports with a quiet caption, and the open orders: title and stage.
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
  points: "var(--tv-points)",
};

/** «Поручено» is quiet — not started yet; work, review and done are white; done carries a tick. */
const STAGE_COLOR: Record<PersonItem["stage"], string> = {
  new: "var(--text-muted)",
  work: "var(--tv-text)",
  review: "var(--tv-text)",
  done: "var(--tv-text)",
};

export function TvFocus({ focus, photos = [] }: { focus: TvFocusEmployee; remainingMs: number; now: Date; photos?: TvPhoto[] }) {
  // the scene re-renders every second with the clock; the person changes when the data does
  const view = useMemo(() => personView(focus), [focus]);
  const shots = focus.guest ? [] : photos.slice(0, PHOTOS);
  const side = view.items.length > 0 || shots.length > 0;

  return (
    <div className="tv-box" data-testid="tv-focus" data-mode={view.mode}>
      <div className="tv-split flex-1">
        {/* the person; standing alone (a guest, nothing open, no photos) they take the whole width */}
        <section className="flex min-h-0 min-w-0 flex-col gap-[var(--tv-gap)]" style={side ? undefined : { gridColumn: "1 / -1" }}>
          <TvAvatar src={view.avatar} size={12} />
          <div className="flex flex-col gap-[1.4vh]">
            <h2 className="tv-title tv-two-lines" style={{ color: "var(--tv-text)" }}>
              {view.name}
            </h2>
            {view.position ? <p className="tv-small tv-two-lines text-muted">{view.position}</p> : null}
          </div>
          {view.stats.length > 0 ? side ? <Stats stats={view.stats} /> : <StatsRow stats={view.stats} /> : null}
        </section>

        {/* the work: photos from the reports first, the open orders under them;
            the channel mark owns the top right corner, so this column starts below it */}
        {side ? (
          <section className="flex min-h-0 min-w-0 flex-col gap-[4vh] pt-[8vh]">
            {shots.length > 0 ? <Photos photos={shots} tall={view.items.length === 0} /> : null}
            {view.items.length > 0 ? <Items items={view.items} /> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function statValue(stat: PersonStat): string {
  return stat.key === "points" ? formatPoints(stat.value) : String(stat.value);
}

/** The good numbers beside the work: one grid, so the numbers share a right edge and their words one x. */
function Stats({ stats }: { stats: PersonStat[] }) {
  return (
    <div className="mt-auto grid items-baseline gap-x-[2.4vh] gap-y-[1.2vh]" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
      {stats.map((stat) => (
        <Fragment key={stat.key}>
          <span className="tv-title tv-num text-right" style={{ color: STAT_COLOR[stat.key] }}>
            {statValue(stat)}
          </span>
          <span className="tv-small text-muted">{stat.label}</span>
        </Fragment>
      ))}
    </div>
  );
}

/** The person standing alone: the numbers large in a row across the wall, each word under its number. */
function StatsRow({ stats }: { stats: PersonStat[] }) {
  return (
    <div className="mt-auto flex gap-x-[12vh]">
      {stats.map((stat) => (
        <p key={stat.key} className="flex min-w-0 flex-col gap-[1.4vh]">
          <span className="tv-hero" style={{ color: STAT_COLOR[stat.key] }}>
            {statValue(stat)}
          </span>
          <span className="tv-small text-muted">{stat.label}</span>
        </p>
      ))}
    </div>
  );
}

/** The stages in the order of an order's path — the wall's one grammar: «Поручено → В работе → На проверке → Готово». */
const STAGE_ORDER: PersonItem["stage"][] = ["new", "work", "review", "done"];

/**
 * The orders as a board: the stage word once, its orders under it, the titles large — a narrow column holds
 * three or four orders this way, where a word beside every title would leave room for one. Only whole orders
 * are drawn — one that would not fit wraps into a second column, which the box clips (no half-drawn title, no
 * «ещё N»); a stage's word travels with its first order, so it never stands alone at the bottom.
 */
function Items({ items }: { items: PersonItem[] }) {
  const rows = STAGE_ORDER.flatMap((stage) => items.filter((item) => item.stage === stage).map((item, index) => ({ item, head: index === 0 })));
  return (
    <ol className="flex min-h-0 flex-1 flex-col flex-wrap content-start gap-x-[10vh] gap-y-[1.6vh] overflow-hidden" data-testid="tv-focus-items">
      {rows.map(({ item, head }, index) => (
        <li key={item.id} className={`flex w-full min-w-0 flex-col ${head && index > 0 ? "mt-[2vh]" : ""}`} data-stage={item.stage}>
          {head ? (
            <p className="tv-small font-semibold" style={{ color: STAGE_COLOR[item.stage] }}>
              {item.stage === "done" ? `✓ ${item.word}` : item.word}
            </p>
          ) : null}
          <p className="tv-body tv-two-lines" style={{ color: "var(--tv-text)" }}>
            {item.title}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Photos from the person's reports, large. The caption belongs to the picture: right under it, small and quiet —
 * never the size or the colour of an order's line. Photos of one order share one caption; two lines at most,
 * never an ellipsis.
 */
function Photos({ photos, tall }: { photos: TvPhoto[]; tall: boolean }) {
  const titles = [...new Set(photos.map((photo) => photo.title).filter((title): title is string => Boolean(title)))];
  const shared = titles.length === 1;
  return (
    <figure className="flex min-w-0 shrink-0 flex-col gap-[1.2vh]" data-testid="tv-focus-photos">
      <div className={`flex min-w-0 gap-[2vh] ${tall ? "h-[50vh]" : "h-[22vh]"}`}>
        {photos.map((photo) => (
          <div key={photo.id} className="flex h-full min-w-0 flex-1 flex-col gap-[1.2vh]">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed link from the report bucket */}
            <img src={photo.url} alt="" className="min-h-0 w-full flex-1 rounded-[1.2vh] object-cover" style={{ background: "var(--surface)" }} />
            {!shared && photo.title ? <p className="tv-small max-h-[1lh] overflow-hidden text-muted">{photo.title}</p> : null}
          </div>
        ))}
      </div>
      {shared ? <figcaption className="tv-small tv-two-lines text-muted">{titles[0]}</figcaption> : null}
    </figure>
  );
}
