"use client";

import { useId, useMemo, useState } from "react";

import { Avatar } from "@/components/desk/ui/PersonCell";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { searchPeople } from "@/lib/desk/palette";

export type PickPerson = { id: string; full_name: string; position?: string | null };

/** A row of the list: a person, under «Похоже, это» when the matcher thought of them. */
type Option = { person: PickPerson; suggested: boolean };

function options(people: readonly PickPerson[], suggestedIds: readonly string[], query: string): Option[] {
  const suggested = new Set(suggestedIds);
  if (query.trim()) return searchPeople(people, query).map((person) => ({ person, suggested: suggested.has(person.id) }));
  const first = suggestedIds.flatMap((id) => people.filter((person) => person.id === id));
  return [...first.map((person) => ({ person, suggested: true })), ...people.filter((person) => !suggested.has(person.id)).map((person) => ({ person, suggested: false }))];
}

/**
 * «Кому» on the desk (D-154 wave 3): a field, not a sheet. The name of the chosen person stands in
 * it; typing (or ↓, or a click) opens the people under it — those the matcher thought of first
 * («Похоже, это»), then everybody, narrowed by any part of the name or the position — and
 * ↑/↓ and Enter pick one; Tab picks the highlighted one only when something was typed, then moves
 * on; Esc closes the list and keeps the person. `tone` — the field asks for a person (danger)
 * or for a check (warn).
 */
export function PersonField({
  value,
  name,
  people,
  suggestedIds = [],
  tone,
  placeholder = "Кому?",
  label,
  onPick,
  testId,
}: {
  value: string | null;
  /** The chosen person's name as the matcher or the roster knows it. */
  name: string | null;
  people: readonly PickPerson[];
  suggestedIds?: readonly string[];
  tone?: "danger" | "warn";
  placeholder?: string;
  label: string;
  onPick: (person: PickPerson) => void;
  testId?: string;
}) {
  const listId = useId();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const list = useMemo(() => options(people, suggestedIds, query ?? ""), [people, suggestedIds, query]);
  const current = list[Math.min(active, list.length - 1)];

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(0);
  };
  const pick = (person: PickPerson) => {
    onPick(person);
    close();
  };
  const show = () => {
    setActive(0);
    setOpen(true);
  };

  return (
    <div ref={setBox} className="desk-input relative flex h-9 items-center gap-2 px-2" data-tone={!value && !open ? tone : undefined} aria-expanded={open}>
      {value && query === null ? <Avatar name={name ?? ""} size={22} /> : <SearchMark />}
      <input
        value={query ?? name ?? ""}
        placeholder={value ? (name ?? "") : placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onMouseDown={() => {
          if (!open) show();
        }}
        onBlur={() => close()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return show();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((index) => (index + step + list.length) % Math.max(1, list.length));
          } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            if (!open) return show();
            if (current) pick(current.person);
          } else if (event.key === "Tab" && open) {
            // a typed name is meant: the highlighted person; a field passed through keeps its person
            if (query && current) pick(current.person);
            else close();
          }
        }}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && current ? `${listId}-${current.person.id}` : undefined}
        autoComplete="off"
        spellCheck={false}
        data-testid={testId}
        className={`min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none ${value ? "placeholder:text-text/60" : tone === "danger" ? "placeholder:text-danger" : tone === "warn" ? "placeholder:text-warn" : "placeholder:text-muted"}`}
      />
      <span aria-hidden className="pointer-events-none shrink-0 text-muted">
        <Chevron />
      </span>
      <Popover open={open} onClose={close} anchor={box} width={280} matchAnchor track label={label}>
        {/* a press anywhere in the list keeps the caret in the field: the list closes on its blur */}
        <ul id={listId} role="listbox" aria-label={label} className="max-h-[300px] overflow-y-auto py-1" data-testid="person-options" onMouseDown={(event) => event.preventDefault()}>
          {list.length === 0 ? <li className="px-3 py-2 text-[13px] leading-5 text-muted">Никого с таким именем</li> : null}
          {list.map((option, index) => {
            const head = index === 0 ? (option.suggested ? "Похоже, это" : "Все") : option.suggested !== list[index - 1].suggested ? "Все" : null;
            const on = option === current;
            return (
              <li key={option.person.id} role="presentation">
                {head && !query ? <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{head}</p> : null}
                <div
                  id={`${listId}-${option.person.id}`}
                  role="option"
                  aria-selected={on}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(option.person)}
                  onMouseMove={() => {
                    if (!on) setActive(index);
                  }}
                  className={`mx-1 flex h-9 cursor-default items-center gap-2.5 rounded-[8px] px-2 ${on ? "bg-surface-2" : ""}`}
                >
                  <Avatar name={option.person.full_name} size={24} />
                  <span className="min-w-0 truncate text-[14px] leading-5">{option.person.full_name}</span>
                  {option.person.position ? <span className="min-w-0 truncate text-[12px] leading-4 text-muted">{option.person.position}</span> : null}
                  {option.person.id === value ? <span className="ml-auto shrink-0 text-[12px] text-muted">сейчас</span> : on ? <span className="ml-auto shrink-0"><Kbd>Enter</Kbd></span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}

/**
 * «Кто» of a meeting (D-154 wave 3): everybody, only me, or the people ticked — a button that
 * opens the list with its search; Space or Enter ticks the highlighted person, Esc closes.
 * `allowEveryone={false}` — a list of people only (the director's important people).
 */
export function PeopleField({
  everyone,
  ids,
  people,
  summary,
  label,
  onChange,
  allowEveryone = true,
  testId,
}: {
  everyone: boolean;
  ids: readonly string[];
  people: readonly PickPerson[];
  summary: string;
  label: string;
  onChange: (next: { everyone: boolean; ids: string[] }) => void;
  allowEveryone?: boolean;
  testId?: string;
}) {
  const listId = useId();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => searchPeople(people, query), [people, query]);
  // row 0 — «Все сотрудники» (where there is such a choice), then the people
  const lead = allowEveryone ? 1 : 0;
  const count = list.length + lead;
  const chosen = new Set(ids);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
    trigger?.focus();
  };
  const toggle = (index: number) => {
    if (lead && index === 0) return onChange({ everyone: !everyone, ids: [...ids] });
    const person = list[index - lead];
    if (!person) return;
    const next = chosen.has(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id];
    onChange({ everyone: false, ids: next });
  };

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="desk-input flex h-9 w-full items-center gap-2 px-2.5 text-left text-[14px] leading-5"
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span aria-hidden className="shrink-0 text-muted">
          <Chevron />
        </span>
      </button>
      <Popover open={open} onClose={close} anchor={trigger} width={300} matchAnchor track label={label}>
        <div className="border-b border-border/70 p-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActive((index) => (index + step + count) % count);
              } else if (event.key === "Enter" || (event.key === " " && !query)) {
                event.preventDefault();
                toggle(active);
              } else if (event.key === "Tab") {
                event.preventDefault();
                close();
              }
            }}
            placeholder="Найти по имени или должности"
            aria-label="Найти"
            role="combobox"
            aria-controls={listId}
            aria-expanded
            aria-activedescendant={`${listId}-${active}`}
            className="desk-input h-8 w-full px-2.5 text-[14px] leading-5 outline-none"
          />
        </div>
        <ul id={listId} role="listbox" aria-multiselectable aria-label={label} className="max-h-[300px] overflow-y-auto py-1">
          {[...(lead ? [{ id: "__all", full_name: "Все сотрудники", position: null } as PickPerson] : []), ...list].map((person, index) => {
            const on = index === active;
            const all = lead === 1 && index === 0;
            const ticked = all ? everyone : everyone || chosen.has(person.id);
            return (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={ticked}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggle(index)}
                onMouseMove={() => {
                  if (!on) setActive(index);
                }}
                className={`mx-1 flex h-9 cursor-default items-center gap-2.5 rounded-[8px] px-2 ${on ? "bg-surface-2" : ""} ${all ? "mb-1" : ""}`}
              >
                <Tick on={ticked} />
                {all ? null : <Avatar name={person.full_name} size={22} />}
                <span className={`min-w-0 truncate text-[14px] leading-5 ${all ? "font-semibold" : ""}`}>{person.full_name}</span>
                {person.position ? <span className="min-w-0 truncate text-[12px] leading-4 text-muted">{person.position}</span> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[12px] leading-4 text-muted">
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> отметить
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>Esc</Kbd> готово
          </span>
        </div>
      </Popover>
    </>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border"
      style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "var(--accent)" : "transparent" }}
    >
      {on ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5,12.5 10,17 19,7.5" />
        </svg>
      ) : null}
    </span>
  );
}

function SearchMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="mx-1 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}
