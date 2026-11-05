"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { shortName } from "@/lib/people/names";
import { foldRu, searchPeople, useRoster } from "@/lib/people/roster";

/** Matches shown under the field at once; the rest — by typing more. */
const SHOWN = 6;
const EVERYONE = "__everyone";

/**
 * Who is invited, on the desk (wave 3): the chosen as chips in one field, a search typed into its
 * end — the matches open under it in the flow of the form (never a second dialog), ↑/↓ move, Enter
 * or a click adds, Backspace in the empty search takes the last chip off. «Все сотрудники» is the
 * first match while nothing is typed. `closeRef` — the form's Esc asks the list to close first.
 */
export function PeopleField({
  ids,
  everyone,
  onChange,
  hideIds = [],
  closeRef,
  placeholder = "Добавить участника — имя или должность",
  testId,
  shown = SHOWN,
}: {
  ids: string[];
  everyone: boolean;
  onChange: (next: { ids: string[]; everyone: boolean }) => void;
  hideIds?: string[];
  /** Set to a function that closes the open list and says whether it was open. */
  closeRef?: RefObject<(() => boolean) | null>;
  placeholder?: string;
  testId?: string;
  /** Matches under the field at once (a small card shows fewer). */
  shown?: number;
}) {
  const roster = useRoster();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  // the arrows chose a line: Enter takes it even with nothing typed («Все сотрудники»)
  const [keyed, setKeyed] = useState(false);

  const people = useMemo(() => (roster.data ?? []).filter((person) => !hideIds.includes(person.id)), [roster.data, hideIds]);
  const byId = useMemo(() => new Map((roster.data ?? []).map((person) => [person.id, person])), [roster.data]);
  const matches = useMemo(() => {
    const found = searchPeople(people, query).filter((person) => !ids.includes(person.id));
    const all = !everyone && (!query.trim() || foldRu("все сотрудники").includes(foldRu(query.trim())));
    return [...(all ? [{ id: EVERYONE, full_name: "Все сотрудники", position: "приглашение каждому" }] : []), ...found].slice(0, shown);
  }, [people, query, ids, everyone, shown]);

  useLayoutEffect(() => {
    if (!closeRef) return;
    closeRef.current = () => {
      if (!open) return false;
      setOpen(false);
      setQuery("");
      return true;
    };
  });

  const add = (id: string) => {
    if (id === EVERYONE) onChange({ ids: [], everyone: true });
    else onChange({ ids: [...ids, id], everyone: false });
    setQuery("");
    setAt(0);
    setKeyed(false);
    input.current?.focus();
  };
  const drop = (id: string | null) => {
    if (id === null) onChange({ ids, everyone: false });
    else onChange({ ids: ids.filter((other) => other !== id), everyone });
    input.current?.focus();
  };

  const listed = open && matches.length > 0;

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div
        className="field flex min-h-9 cursor-text flex-wrap items-center gap-x-3 gap-y-1 px-0 py-1"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {everyone ? <PersonChip label="Все сотрудники" onRemove={() => drop(null)} /> : null}
        {ids.map((id) => (
          <PersonChip key={id} label={shortName(byId.get(id)?.full_name) || "…"} name={byId.get(id)?.full_name} onRemove={() => drop(id)} />
        ))}
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
            setKeyed(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.code === "ArrowDown" || event.code === "ArrowUp") {
              if (!listed) {
                setOpen(true);
                return;
              }
              event.preventDefault();
              setKeyed(true);
              setAt((index) => (keyed ? index + (event.code === "ArrowDown" ? 1 : matches.length - 1) : event.code === "ArrowDown" ? 0 : matches.length - 1) % matches.length);
            } else if ((event.code === "Enter" || event.code === "NumpadEnter") && listed && (query.trim() || keyed) && !event.ctrlKey && !event.metaKey) {
              // Enter picks what is typed or chosen by the arrows; an untouched empty search lets Enter submit the form
              event.preventDefault();
              event.stopPropagation();
              const pick = matches[Math.min(at, matches.length - 1)];
              if (pick) add(pick.id);
            } else if (event.code === "Backspace" && !query) {
              if (everyone) drop(null);
              else if (ids.length > 0) drop(ids[ids.length - 1]);
            }
          }}
          placeholder={ids.length === 0 && !everyone ? placeholder : ""}
          aria-label="Участники"
          role="combobox"
          aria-controls={listId}
          aria-expanded={listed}
          aria-autocomplete="list"
          className="h-7 min-w-[120px] flex-1 bg-transparent text-[14px] leading-5 outline-none placeholder:text-muted"
        />
      </div>
      {listed ? (
        <ul id={listId} role="listbox" className="[&>li]:border-b [&>li]:border-border/60" data-testid="desk-people-options">
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === at && (keyed || Boolean(query.trim()))}
                // the caret stays in the search: a click picks without taking the focus away
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setAt(index)}
                onClick={() => add(person.id)}
                className={`flex h-8 w-full items-center gap-2.5 px-1 text-left ${index === at && (keyed || query.trim()) ? "bg-surface-2" : "hover:bg-surface-2/70"}`}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px]">{person.full_name}</span>
                {person.position ? <span className="max-w-[45%] shrink-0 truncate text-[12px] leading-4 text-muted">{person.position}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersonChip({ label, name, onRemove }: { label: string; name?: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-0.5 text-[14px] font-medium leading-5" title={name}>
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Убрать: ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
        className="flex h-5 w-4 items-center justify-center text-[14px] leading-none text-muted transition-colors duration-[120ms] hover:text-danger"
      >
        ×
      </button>
    </span>
  );
}
