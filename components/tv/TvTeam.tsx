"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import type { TvSummary } from "@/lib/tv/queries";
import { teamFigures, teamGrid, teamPosition, type TeamFigure, type TeamSize } from "@/lib/tv/team";

import { TvSceneHead } from "./TvSceneHead";

/**
 * The «Команда» scene (D-76 §8, look D-185): everyone in the company alphabetically. Rows come from
 * `tv_summary().load` with the guest mask already applied in the DB (D-33): a guest gets no surnames. `load` carries
 * no photos, so the scene has no faces: a face on the wall is a real photo or nothing (D-185).
 *
 * The grid follows the size of the team (`teamGrid`, D-194): a small company gets cards — a plate per person with
 * the first name large, the surname and the position under it and the figures with their words at the bottom
 * («2 задачи в работе», «3 готово за неделю»); three people fill the wall as a finished picture, not three names in
 * the middle of the dark.
 * A big company keeps the list: sixteen names a page, the number of tasks right after the first name, pages every
 * 20 s by the wall's clock (no timer of its own); a page change is one fade, like the frame's.
 *
 * Someone with nothing in work is the name and the surname: no zero, no grey dot, no «задач нет» (D-45). Overdue by
 * name never goes on the wall, neither as a number nor as a colour. The numbers are white: green on the wall means
 * «now» and nothing else. The order is alphabetical, not by load: the wall does not show off who has nothing to do.
 */

const PAGE_MS = 20_000;

type Person = { key: string; first: string; last: string | null; position: string | null; active: number; figures: TeamFigure[] };

export function TvTeam({ summary, now }: { summary: TvSummary; guest: boolean; now: Date }) {
  // the scene re-renders every second with the clock: the sort runs when the data changes
  const people = useMemo(
    () =>
      [...summary.load]
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .map((row, index): Person => {
          const [first = "", ...rest] = row.name.trim().split(/\s+/);
          return {
            key: `${row.name}\u0001${index}`,
            first,
            last: rest.join(" ") || null,
            position: teamPosition(row),
            active: row.active,
            figures: teamFigures(row),
          };
        }),
    [summary.load],
  );
  const grid = teamGrid(people.length);
  const pages = Math.max(1, Math.ceil(people.length / grid.perPage));
  const page = Math.floor(now.getTime() / PAGE_MS) % pages;
  const shown = people.slice(page * grid.perPage, (page + 1) * grid.perPage);
  // several pages keep four rows, so a short last page stands where the full one stood
  const rows = grid.size !== "compact" ? grid.rows : pages > 1 ? grid.rows : Math.max(1, Math.ceil(people.length / grid.cols));
  // the cards carry their words: the head needs no line; the list says what its numbers are
  const sub = grid.size !== "compact" || people.length === 0 ? null : pages > 1 ? `у кого сколько задач в работе · ${page + 1} из ${pages}` : "у кого сколько задач в работе";

  return (
    <div className="tv-box" data-testid="tv-team" data-size={grid.size}>
      <TvSceneHead title="Команда" sub={sub} />
      {people.length === 0 ? (
        <p className="tv-body text-muted">Команда ещё не заведена</p>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            // rows share the height evenly: the list's names stand in the middle of their rows, the cards fill them
            className={`grid min-h-0 flex-1 ${grid.size === "compact" ? "items-center gap-x-[6vh]" : "gap-[var(--tv-gap)] pb-[1vh]"}`}
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
            data-page={page}
          >
            {shown.map((person) =>
              grid.size === "compact" ? <ListName key={person.key} person={person} /> : <Card key={person.key} person={person} size={grid.size} />,
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/** The type of a card by the team's size: three people read from across the room at a headline's size. */
const CARD: Record<Exclude<TeamSize, "compact">, { name: string; last: string; position: string; value: string; label: string }> = {
  large: { name: "tv-title", last: "tv-body", position: "tv-small", value: "tv-title", label: "tv-small" },
  medium: { name: "tv-lead", last: "tv-small", position: "tv-small", value: "tv-lead", label: "tv-small" },
};

/**
 * One person of a small team: a quiet plate, the name on top, the figures at the bottom with their words. A name too
 * long for the card wraps inside it (two lines at most), never into the neighbour.
 */
function Card({ person, size }: { person: Person; size: Exclude<TeamSize, "compact"> }) {
  const type = CARD[size];
  return (
    <div
      className="flex min-h-0 min-w-0 flex-col justify-between gap-[2vh] overflow-hidden rounded-[2.4vh] px-[3.6vh] py-[3vh]"
      style={{ background: "color-mix(in srgb, var(--surface) 62%, var(--bg))" }}
      data-testid="tv-team-card"
    >
      <div className="min-w-0">
        <p className={`${type.name} tv-two-lines`} style={{ color: "var(--tv-text)" }}>
          {person.first}
        </p>
        {person.last ? <p className={`${type.last} tv-two-lines mt-[0.8vh] text-muted`}>{person.last}</p> : null}
        {person.position ? <p className={`${type.position} tv-two-lines mt-[1.6vh] text-muted`}>{person.position}</p> : null}
      </div>
      {person.figures.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-[1.2vh]">
          {person.figures.map((figure) => (
            <p key={figure.key} className="flex min-w-0 items-baseline gap-[1.6vh]">
              <span className={`${type.value} tv-num shrink-0`} style={{ color: "var(--tv-text)" }}>
                {figure.value}
              </span>
              <span className={`${type.label} min-w-0 text-muted`}>{figure.label}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One name of the big company's list: the number right after the first name, the surname under it. */
function ListName({ person }: { person: Person }) {
  return (
    <div className="min-w-0">
      {/* the count stands right after the name, so it never reads as the next column's; a name too long
          for its column wraps inside it (the count drops under it), never into the neighbour */}
      <p className="flex flex-wrap items-baseline gap-x-[2vh]">
        <span className="tv-body min-w-0 break-words font-semibold" style={{ color: "var(--tv-text)" }}>
          {person.first}
        </span>
        {/* nobody's zero is drawn; an unseen digit keeps every name on one baseline */}
        <span
          className={`tv-lead tv-num ${person.active > 0 ? "" : "invisible"}`}
          style={{ color: "var(--tv-text)", fontWeight: 400 }}
          aria-hidden={person.active > 0 ? undefined : true}
        >
          {person.active > 0 ? person.active : 0}
        </span>
      </p>
      {person.last ? <p className="tv-small tv-two-lines text-muted">{person.last}</p> : null}
    </div>
  );
}
