"use client";

import { useMemo, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { ROLE_LABEL, initialsOf, type Person } from "@/lib/people/queries";

/**
 * «Показать сотрудника»: тап по человеку — и он на стене. Один тап, без листа
 * подтверждения (принцип 1: ценность = количество убранных действий).
 *
 * Поиск — тот же, что на `/people`: подстрока по имени, должности и алиасам.
 * Роль `tv` и неработающие из списка исключены — киоск не показывают на киоске.
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
  onPick,
}: {
  people: Person[];
  /** Кто на стене прямо сейчас: у него чип «на экране», повторный тап продлевает. */
  onScreenId: string | null;
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
          {list.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onPick(person)}
                className="flex min-h-[58px] w-full items-center gap-3 px-4 text-left transition-colors duration-[120ms] ease-out active:bg-surface-2"
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
                {person.id === onScreenId ? (
                  <Chip tone="accent" interactive={false}>на экране</Chip>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
