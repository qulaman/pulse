"use client";

import { useMemo, useState } from "react";

import { ROLE_LABEL, initialsOf, type Person } from "@/lib/people/queries";
import { keyLabels } from "@/lib/tv/remote";

import { Avatar, Key, PersonName, Slot, padClass, personKeyClass } from "@/components/ui/device/Device";

/**
 * The channel keys: one rubber key per person, on the body of the remote. Tap a key —
 * that person is on the wall. One tap, no confirmation sheet (principle 1: value =
 * actions removed). The key of whoever is on the wall is lit, like the active scene;
 * a second tap extends the time.
 *
 * Keys keep their order whatever is on the wall, so the thumb learns where Marat is.
 * Search appears only when the keypad outgrows three rows: a company of ten does not
 * need a field between the switch and the keys. Role `tv` and inactive people are
 * excluded — the kiosk is not shown on the kiosk.
 */

/** Three rows of four: past this the thumb stops scanning and starts typing. */
const SEARCH_FROM = 12;

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

function matches(person: Person, query: string): boolean {
  if (!query) return true;
  const hay = normalise([person.full_name, person.position ?? "", ...person.aliases, ROLE_LABEL[person.role]].join(" "));
  return query.split(/\s+/).every((word) => hay.includes(word));
}

export function PersonPad({
  people,
  onScreenId,
  onPick,
}: {
  people: Person[];
  /** Who is on the wall right now: their key is lit, a second tap extends the time. */
  onScreenId: string | null;
  onPick: (person: Person) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalise(query);

  const roster = useMemo(() => people.filter((p) => p.is_active && p.role !== "tv"), [people]);
  const labels = useMemo(() => keyLabels(roster), [roster]);
  const list = useMemo(() => roster.filter((p) => matches(p, q)), [roster, q]);

  return (
    <div>
      {roster.length > SEARCH_FROM ? (
        <div className="mb-3">
          <Slot>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Имя или должность"
              aria-label="Поиск по команде"
            />
          </Slot>
        </div>
      ) : null}

      {list.length === 0 ? (
        <p className="py-3 text-center text-[14px] leading-[18px] text-muted">Никого не нашёл</p>
      ) : (
        <div className={padClass} role="group" aria-label="Кого показать">
          {list.map((person) => {
            const onAir = person.id === onScreenId;
            return (
              <Key
                key={person.id}
                on={onAir}
                className={personKeyClass}
                aria-label={onAir ? `${person.full_name} — на стене, продлить` : `Показать: ${person.full_name}`}
                title={person.position ?? undefined}
                onClick={() => onPick(person)}
              >
                <Avatar initials={initialsOf(person.full_name)} />
                <PersonName>{labels.get(person.id) ?? person.full_name}</PersonName>
              </Key>
            );
          })}
        </div>
      )}
    </div>
  );
}
