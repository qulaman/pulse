"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { initialsOf, searchPeople, useRoster, type RosterEntry } from "@/lib/people/roster";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The one way to choose people in the app (D-108): «Поручить» on a note or a board's point,
 * «Кому?» on a card the parser could not place, «Передать» a task, «Участники» of a meeting.
 * A sheet over the screen — the screen stays where it was, nothing navigates.
 *
 *  - `mode: "one"` — a tap on a person is the answer: the sheet closes and `onPick` fires;
 *  - `mode: "many"` — checks, «Все сотрудники» when the caller allows it, «Готово · N».
 *
 * Above the list — what is being handed over (`subject`) and, when the phrase named someone
 * the matcher could not pin down, the shortlist (`suggested`). The search appears once the
 * company is bigger than a glance; a typed word finds the start of a name or a position.
 */

export type PickedPerson = { id: string; full_name: string };

type Base = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What is being handed over, quoted above the list: the point, the thought, the task. */
  subject?: string | null;
  /** A line from the assistant under the title: why it asks. */
  hint?: string | null;
  /** The shortlist on top — the people the phrase most likely meant (D-16). */
  suggestedIds?: readonly string[];
  /** Never in the list: the author of a meeting, who is in anyway. */
  hideIds?: readonly string[];
  /** Marked «сейчас»: the one who holds the task being passed on. */
  currentId?: string | null;
  /** Under the list: the quiet-hours promise or anything else the caller needs said. */
  footer?: ReactNode;
};

type One = Base & { mode?: "one"; onPick: (person: PickedPerson) => void };

type Many = Base & {
  mode: "many";
  selectedIds: readonly string[];
  everyone?: boolean;
  /** «Все сотрудники» above the list — a meeting for the whole company. */
  allowEveryone?: boolean;
  onDone: (next: { everyone: boolean; ids: string[] }) => void;
};

export type PeoplePickerProps = One | Many;

/** Past this many people a glance is not enough: the search field appears. */
const SEARCH_FROM = 7;

export function PeoplePicker(props: PeoplePickerProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      {/* born with every opening: the checks and the search start from what the caller holds now */}
      <PickerBody {...props} />
    </Sheet>
  );
}

function PickerBody(props: PeoplePickerProps) {
  const roster = useRoster();
  const [query, setQuery] = useState("");
  const many = props.mode === "many";
  const [ids, setIds] = useState<string[]>(() => (props.mode === "many" ? [...props.selectedIds] : []));
  const [all, setAll] = useState(() => (props.mode === "many" ? Boolean(props.everyone) : false));

  const hidden = useMemo(() => new Set(props.hideIds ?? []), [props.hideIds]);
  const people = useMemo(() => (roster.data ?? []).filter((person) => !hidden.has(person.id)), [roster.data, hidden]);
  const found = useMemo(() => searchPeople(people, query), [people, query]);

  // the shortlist keeps its own order (the matcher's), and the same people leave «Все»
  const suggested = useMemo(() => {
    if (query.trim()) return [];
    const byId = new Map(people.map((person) => [person.id, person]));
    return (props.suggestedIds ?? []).map((id) => byId.get(id)).filter((person): person is RosterEntry => Boolean(person));
  }, [people, props.suggestedIds, query]);
  const rest = useMemo(() => {
    const top = new Set(suggested.map((person) => person.id));
    return found.filter((person) => !top.has(person.id));
  }, [found, suggested]);

  const pick = (person: RosterEntry) => {
    if (props.mode === "many") {
      if (all) return;
      haptic(8);
      setIds((was) => (was.includes(person.id) ? was.filter((id) => id !== person.id) : [...was, person.id]));
      return;
    }
    haptic(12);
    props.onPick({ id: person.id, full_name: person.full_name });
    props.onClose();
  };

  const row = (person: RosterEntry) => (
    <PersonRow
      key={person.id}
      person={person}
      many={many}
      checked={all || ids.includes(person.id)}
      inert={many && all}
      current={props.currentId === person.id}
      onClick={() => pick(person)}
    />
  );

  return (
    <div data-testid="people-picker" data-mode={many ? "many" : "one"}>
      {props.subject ? (
        <p className="mb-3 line-clamp-3 rounded-[14px] bg-surface-2/60 px-3 py-2 text-[14px] leading-[19px] text-text/85" data-testid="people-picker-subject">
          «{props.subject}»
        </p>
      ) : null}
      {props.hint ? (
        <div className="mb-3 flex items-center gap-3 px-1">
          <Mascot state="thinking" size={32} />
          <p className="text-[13px] leading-4 text-muted">{props.hint}</p>
        </div>
      ) : null}

      {people.length >= SEARCH_FROM ? (
        <label className="field mb-2 flex items-center gap-2 px-3">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя или должность"
            aria-label="Найти человека"
            data-testid="people-picker-search"
            className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          />
          {query ? (
            <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="px-1 text-[20px] leading-none text-muted">
              ×
            </button>
          ) : null}
        </label>
      ) : null}

      {props.mode === "many" && props.allowEveryone ? (
        <button
          type="button"
          onClick={() => {
            haptic(8);
            setAll((was) => !was);
          }}
          aria-pressed={all}
          data-testid="people-picker-everyone"
          className="mb-1 flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-2 text-left transition-colors duration-[120ms] active:bg-surface-2"
        >
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <TeamIcon />
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-semibold leading-[22px]">Все сотрудники</span>
          <Check on={all} />
        </button>
      ) : null}

      <div className="no-bar -mx-1 max-h-[52vh] overflow-y-auto px-1">
        {roster.isLoading ? <p className="px-2 py-3 text-[14px] text-muted">Загружаю людей…</p> : null}
        {roster.isError ? <p className="px-2 py-3 text-[14px] text-danger">Не смог загрузить список — проверьте связь</p> : null}

        {suggested.length > 0 ? (
          <>
            <Label>Похоже, это</Label>
            {suggested.map(row)}
            <Label>Все</Label>
          </>
        ) : null}
        {rest.map(row)}

        {roster.data && found.length === 0 ? (
          <p className="px-2 py-4 text-center text-[14px] leading-5 text-muted" data-testid="people-picker-empty">
            {query.trim() ? "Никого не нашёл — проверьте имя" : "Пока некого выбрать"}
          </p>
        ) : null}
      </div>

      {props.footer ? <div className="mt-2">{props.footer}</div> : null}

      {props.mode === "many" ? (
        <div className="mt-3">
          <Button
            block
            data-testid="people-picker-done"
            onClick={() => {
              props.onDone({ everyone: all, ids: all ? [] : ids });
              props.onClose();
            }}
          >
            {all ? "Готово · все" : ids.length > 0 ? `Готово · ${ids.length} ${pluralRu(ids.length, ["человек", "человека", "человек"])}` : "Готово"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="px-2 pb-1 pt-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">{children}</p>;
}

function PersonRow({
  person,
  many,
  checked,
  inert,
  current,
  onClick,
}: {
  person: RosterEntry;
  many: boolean;
  checked: boolean;
  inert: boolean;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      aria-pressed={many ? checked : undefined}
      data-testid="people-picker-person"
      data-person-id={person.id}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-[14px] px-2 py-1.5 text-left transition-colors duration-[120ms] active:bg-surface-2"
      style={{ opacity: inert ? 0.5 : 1 }}
    >
      <PersonFace person={person} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-[21px]">{person.full_name}</span>
        {person.position ? <span className="block truncate text-[13px] leading-[18px] text-muted">{person.position}</span> : null}
      </span>
      {current ? <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] leading-4 text-muted">сейчас</span> : null}
      {many ? <Check on={checked} /> : null}
    </button>
  );
}

/** A photo when the person has one, else the initials in the brand circle. */
export function PersonFace({ person, size = 36 }: { person: Pick<RosterEntry, "full_name" | "avatar_url">; size?: number }) {
  if (person.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
      <img src={person.avatar_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold text-bg"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
    >
      {initialsOf(person.full_name)}
    </span>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-[120ms]"
      style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "var(--accent)" : "transparent", color: "var(--bg)" }}
    >
      {on ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3.5,8.5 6.5,11.5 12.5,4.5" />
        </svg>
      ) : null}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3 2.4 3 4.6" />
    </svg>
  );
}
