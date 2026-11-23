"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import type { TvSummary } from "@/lib/tv/queries";

import { TvSceneHead } from "./TvSceneHead";

/**
 * The «Команда» scene (D-76 §8, look D-185): everyone in the company alphabetically, four to a row — first name,
 * surname under it, the number of orders in progress right after the first name. Rows come from `tv_summary().load`
 * with the guest mask already applied in the DB (D-33): a guest gets no surnames. `load` carries no photos, so the
 * scene has no faces: a face on the wall is a real photo or nothing (D-185).
 *
 * Someone with no orders is just a name: no zero, no grey dot, no «дел нет» (D-45). The rows' `overdue` field
 * is there and unused on purpose: overdue by name never goes on the wall, neither as a number nor as a colour.
 * The numbers are white: green on the wall means «now» and nothing else, and a count in green read as «good».
 * The order is alphabetical, not by load: the wall does not show off who has nothing to do right now.
 *
 * One page: as many rows as the team needs, spread over the height. More than sixteen — pages of four rows,
 * every 20 s by the wall's clock (no timer of its own); a page change is one fade, like the frame's.
 */

/** Four columns, four rows: a name at the scene's body size reads from three metres. */
const COLS = 4;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;
const PAGE_MS = 20_000;

type Person = { key: string; first: string; last: string | null; active: number };

export function TvTeam({ summary, now }: { summary: TvSummary; guest: boolean; now: Date }) {
  // the scene re-renders every second with the clock: the sort runs when the data changes
  const people = useMemo(
    () =>
      [...summary.load]
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .map((row, index): Person => {
          const [first = "", ...rest] = row.name.trim().split(/\s+/);
          return { key: `${row.name}\u0001${index}`, first, last: rest.join(" ") || null, active: row.active };
        }),
    [summary.load],
  );
  const pages = Math.max(1, Math.ceil(people.length / PER_PAGE));
  const page = Math.floor(now.getTime() / PAGE_MS) % pages;
  const shown = people.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  // several pages keep four rows, so a short last page stands where the full one stood
  const rows = pages > 1 ? ROWS : Math.max(1, Math.ceil(people.length / COLS));
  const sub = people.length === 0 ? null : pages > 1 ? `у кого сколько дел в работе · ${page + 1} из ${pages}` : "у кого сколько дел в работе";

  return (
    <div className="tv-box" data-testid="tv-team">
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
            // rows share the height evenly and each name stands in the middle of its row: ten people fill
            // the wall as sixteen do, with no empty lower third
            className="grid min-h-0 flex-1 items-center gap-x-[6vh]"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
            data-page={page}
          >
            {shown.map((person) => (
              <div key={person.key} className="min-w-0">
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
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
