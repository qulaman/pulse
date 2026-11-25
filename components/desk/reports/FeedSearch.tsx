"use client";

import { Search, X } from "lucide-react";
import { forwardRef, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";

import { Face } from "@/components/desk/ui/Face";
import { Popover } from "@/components/desk/ui/Popover";
import { searchPeople } from "@/lib/people/search";

/** Who the field can find: the team as the roster has it. */
export type SearchablePerson = { id: string; full_name: string; position: string | null; avatar_url: string | null; aliases?: string[] | null; gone?: boolean };

type Option = { kind: "person"; person: SearchablePerson } | { kind: "words"; text: string };

/** How many people the list under the field offers at most. */
const PEOPLE_MAX = 6;

/**
 * «Найти человека или слово · F» of the feed (D-198): as one types, the people who fit come in a
 * list under the field (the app's one rule of finding a person) and, last, «Искать „…“ в
 * отчётах». ↑ ↓ and Enter pick, Esc clears; a person becomes the label «Имя ×» over the feed, the
 * words — «„смета“ ×», and the field empties for the next search.
 */
export const FeedSearch = forwardRef<{ focus: () => void }, { people: readonly SearchablePerson[]; onPerson: (id: string) => void; onWords: (text: string) => void; width?: number }>(
  function FeedSearch({ people, onPerson, onWords, width = 260 }, ref) {
    const input = useRef<HTMLInputElement>(null);
    const [field, setField] = useState<HTMLLabelElement | null>(null);
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const list = useId();
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

    const typed = text.trim();
    const options: Option[] = typed
      ? [...searchPeople(people, typed, PEOPLE_MAX).map((person) => ({ kind: "person" as const, person })), ...(typed.length >= 2 ? [{ kind: "words" as const, text: typed }] : [])]
      : [];
    const at = Math.min(active, Math.max(options.length - 1, 0));

    const pick = (option: Option | undefined) => {
      if (!option) return;
      if (option.kind === "person") onPerson(option.person.id);
      else onWords(option.text);
      setText("");
      setOpen(false);
      setActive(0);
    };
    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        if (options.length) setActive((at + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        pick(options[at]);
      } else if (event.key === "Escape") {
        event.stopPropagation();
        if (text) setText("");
        else input.current?.blur();
        setOpen(false);
      }
    };

    return (
      <>
        <label ref={setField} className="field desk-search relative flex h-9 items-center px-3" style={{ width }}>
          <Search size={15} strokeWidth={2} aria-hidden className="mr-2 shrink-0 text-muted" />
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={list}
            aria-activedescendant={open && options[at] ? `${list}-${at}` : undefined}
            aria-label="Найти человека или слово в отчётах"
            placeholder="Найти человека или слово  ·  F"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none placeholder:text-muted"
            data-testid="desk-feed-search"
          />
          {text ? (
            <button type="button" aria-label="Очистить" onClick={() => setText("")} className="ml-1 text-muted hover:text-text">
              <X size={14} strokeWidth={2.2} aria-hidden />
            </button>
          ) : null}
        </label>
        <Popover open={open && options.length > 0} onClose={() => setOpen(false)} anchor={field} matchAnchor role="presentation">
          <ul id={list} role="listbox" aria-label="Найдено" className="rep-feed-suggest" data-testid="desk-feed-suggest">
            {options.map((option, index) => (
              <li
                key={option.kind === "person" ? option.person.id : "words"}
                id={`${list}-${index}`}
                role="option"
                aria-selected={index === at}
                data-active={index === at ? "" : undefined}
                data-kind={option.kind}
                className="rep-feed-suggest-item"
                onMouseEnter={() => setActive(index)}
                // the field keeps the focus: a press here is a pick, not a blur
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
              >
                {option.kind === "person" ? (
                  <>
                    <Face person={{ id: option.person.id, full_name: option.person.full_name, avatar_url: option.person.avatar_url }} size={22} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="rep-feed-suggest-name">{option.person.full_name}</span>
                      {option.person.gone ? <span className="rep-feed-suggest-sub"> · больше не в команде</span> : option.person.position ? <span className="rep-feed-suggest-sub"> · {option.person.position}</span> : null}
                    </span>
                    <span className="rep-feed-suggest-hint">его отчёты</span>
                  </>
                ) : (
                  <>
                    <Search size={15} strokeWidth={2} aria-hidden className="ml-0.5 mr-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      Искать <b className="rep-feed-suggest-name">«{option.text}»</b> в отчётах
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Popover>
      </>
    );
  },
);

/** A label over the feed: who or which words it is narrowed to, «×» lifts it. */
export function FilterChip({ face, label, onClear, testId }: { face?: SearchablePerson | null; label: string; onClear: () => void; testId: string }) {
  return (
    <span className="rep-feed-chip" data-testid={testId}>
      {face ? <Face person={{ id: face.id, full_name: face.full_name, avatar_url: face.avatar_url }} size={20} /> : null}
      <span className="truncate">{label}</span>
      <button type="button" className="rep-feed-chip-x desk-focus" aria-label={`Убрать: ${label}`} onClick={onClear}>
        <X size={13} strokeWidth={2.4} aria-hidden />
      </button>
    </span>
  );
}
