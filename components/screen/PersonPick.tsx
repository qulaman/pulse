"use client";

import { useMemo, useState } from "react";

import { haptic } from "@/lib/haptics";
import { ROLE_LABEL, initialsOf, type Person } from "@/lib/people/queries";

import { channelOnClass, Led } from "./Remote";

/**
 * «Кого показать»: the channel list under the remote. Tap a person — they are on the
 * wall. One tap, no confirmation sheet (principle 1: value = actions removed).
 *
 * Search is the one from `/people`: substring over name, position and aliases.
 * Role `tv` and inactive people are excluded — the kiosk is not shown on the kiosk.
 */

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

function matches(person: Person, query: string): boolean {
  if (!query) return true;
  const hay = normalise([person.full_name, person.position ?? "", ...person.aliases, ROLE_LABEL[person.role]].join(" "));
  return query.split(/\s+/).every((word) => hay.includes(word));
}

export function PersonPick({
  people,
  onScreenId,
  remainingMinutes,
  onPick,
}: {
  people: Person[];
  /** Who is on the wall right now: their row is lit, a second tap extends the time. */
  onScreenId: string | null;
  /** Minutes the current focus has left; shown next to the lit row. */
  remainingMinutes: number;
  onPick: (person: Person) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalise(query);

  const list = useMemo(
    () => people.filter((p) => p.is_active && p.role !== "tv" && matches(p, q)),
    [people, q],
  );

  return (
    <div>
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или должность"
          aria-label="Поиск по команде"
          className="min-h-[44px] w-full field pl-10 pr-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] placeholder:text-muted focus:border-accent"
        />
      </label>

      {list.length === 0 ? (
        <p className="mt-3 text-[14px] leading-[18px] text-muted">Никого не нашёл</p>
      ) : (
        <ul className="mt-2 card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
          {list.map((person) => {
            const onAir = person.id === onScreenId;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onPointerDown={() => haptic(10)}
                  onClick={() => onPick(person)}
                  aria-pressed={onAir || undefined}
                  className={[
                    "flex min-h-[58px] w-full items-center gap-3 px-4 text-left transition-colors duration-[120ms] ease-out active:bg-surface-2",
                    onAir ? channelOnClass : "",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-bg"
                    style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
                  >
                    {initialsOf(person.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-[22px]">{person.full_name}</span>
                    {person.position ? (
                      <span className="block truncate text-[13px] leading-4 text-muted">{person.position}</span>
                    ) : null}
                  </span>
                  {onAir ? (
                    <span className="flex shrink-0 items-center gap-2 font-display text-[12px] font-semibold leading-4 tracking-[-0.01em] text-accent">
                      <Led tone="ok" />
                      <span>
                        на стене
                        <span className="nums font-normal text-muted"> · {remainingMinutes} мин</span>
                      </span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
