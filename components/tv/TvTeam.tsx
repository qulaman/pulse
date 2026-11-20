"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import { pluralRu } from "@/lib/tasks/status-text";
import type { TvSummary } from "@/lib/tv/queries";

import { TvSceneHead } from "./TvSceneHead";

/**
 * The «Команда» scene (D-76 §8, look D-185): everyone in the company alphabetically, in a 4 × 4 grid — first name,
 * surname under it, the number of orders in progress to the right of the name. Rows come from `tv_summary().load`
 * with the guest mask already applied in the DB (D-33): a guest gets no surnames.
 *
 * Someone with no orders is just a name: no zero, no grey dot, no «дел нет» (D-45). The rows' `overdue` field
 * is there and unused on purpose: overdue by name never goes on the wall, neither as a number nor as a colour.
 * The order is alphabetical, not by load: the wall does not show off who has nothing to do right now.
 *
 * More than sixteen — pages, every 20 s by the wall's clock (no timer of its own); a page change is
 * one fade, like the frame's.
 */

/** Four columns, four rows: a name at the scene's body size reads from three metres. */
const COLS = 4;
const PER_PAGE = COLS * 4;
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
  const count = `${people.length} ${pluralRu(people.length, ["человек", "человека", "человек"])}`;

  return (
    <div className="tv-box" data-testid="tv-team">
      <TvSceneHead title="Команда" sub={people.length === 0 ? null : `${count} · цифра — дела в работе${pages > 1 ? ` · ${page + 1} / ${pages}` : ""}`} />
      {people.length === 0 ? (
        <p className="tv-lead text-muted">Команда ещё не заведена</p>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            // four rows of a fixed height: a short last page stands where the full one stood
            className="grid min-h-0 flex-1 grid-rows-4 gap-x-[5vh]"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
            data-page={page}
          >
            {shown.map((person) => (
              <div key={person.key} className="min-w-0">
                {/* the count stands right after the name, so it never reads as the next column's */}
                <p className="flex items-baseline gap-[2vh] whitespace-nowrap">
                  <span className="tv-body font-semibold" style={{ color: "var(--tv-text)" }}>
                    {person.first}
                  </span>
                  {/* nobody's zero is drawn; an unseen digit keeps every name on one baseline */}
                  <span className={`tv-lead tv-num ${person.active > 0 ? "" : "invisible"}`} style={{ color: "var(--accent)" }} aria-hidden={person.active > 0 ? undefined : true}>
                    {person.active > 0 ? person.active : 0}
                  </span>
                </p>
                {person.last ? <p className="tv-small overflow-hidden whitespace-nowrap text-muted">{person.last}</p> : null}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
