"use client";

import { useMemo, useState } from "react";

import { keyLabels } from "@/lib/people/labels";
import { ROLE_LABEL, initialsOf, type Person } from "@/lib/people/queries";

import { Avatar, Dot, Key, PersonName, Slot, padClass, personKeyClass } from "./Device";

/**
 * The people keypad: one rubber key per person, on the body of a device. Tap a key —
 * the caller decides what that person means (on the wall, a filter). One tap, no
 * confirmation sheet (principle 1: value = actions removed). The active person's key
 * is lit, like the active scene; what a second tap does is the caller's.
 *
 * Keys keep their order whoever is active, so the thumb learns where Marat is.
 * Search appears only when the keypad outgrows three rows: a company of ten does not
 * need a field between the switch and the keys. A screen with a search field of its own
 * («Задачи») turns this one off and hands its query in. Role `tv` and inactive people
 * are excluded — the kiosk is not a person.
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
  activeId,
  onPick,
  groupLabel,
  ariaFor,
  searchable = true,
  query: outerQuery,
  dotFor,
}: {
  people: Person[];
  /** Whose key is lit right now. */
  activeId: string | null;
  onPick: (person: Person) => void;
  /** Accessible name of the keypad: what picking a person does («Кого показать»). */
  groupLabel: string;
  /** Accessible name of one key, lit or not. */
  ariaFor: (person: Person, active: boolean) => string;
  /** Off where the screen already has a search field; its text comes in as `query`. */
  searchable?: boolean;
  query?: string;
  /** A dot under each key, lit for the people the caller marks. Without it — no dot row. */
  dotFor?: (person: Person) => "accent" | "danger" | null;
}) {
  const [ownQuery, setQuery] = useState("");
  const q = normalise(searchable ? ownQuery : (outerQuery ?? ""));

  const roster = useMemo(() => people.filter((p) => p.is_active && p.role !== "tv"), [people]);
  const labels = useMemo(() => keyLabels(roster), [roster]);
  const list = useMemo(() => roster.filter((p) => matches(p, q)), [roster, q]);

  return (
    <div>
      {searchable && roster.length > SEARCH_FROM ? (
        <div className="mb-3">
          <Slot>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={ownQuery}
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
        <div className={padClass} role="group" aria-label={groupLabel}>
          {list.map((person) => {
            const active = person.id === activeId;
            const key = (
              <Key
                key={person.id}
                on={active}
                className={personKeyClass}
                aria-label={ariaFor(person, active)}
                title={person.position ?? undefined}
                onClick={() => onPick(person)}
              >
                <Avatar initials={initialsOf(person.full_name)} />
                <PersonName>{labels.get(person.id) ?? person.full_name}</PersonName>
              </Key>
            );
            if (!dotFor) return key;
            const dot = dotFor(person);
            return (
              <div key={person.id} className="flex flex-col items-center gap-1.5">
                {key}
                <Dot on={dot !== null} tone={dot ?? "accent"} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
