"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeskConfirm } from "@/components/desk/DeskConfirm";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { COMMAND_FIELD_ID } from "@/lib/desk/keys";
import { suggestPeople, wordAtCaret } from "@/lib/desk/suggest";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { useIngestStore, type IngestStage } from "@/lib/store/ingest";
import { STAGE_LINE } from "@/lib/voice/stages";

/** Stages the line shows as a thin bar under itself; the phrase is never silently in flight (D-43). */
const WORKING: ReadonlySet<IngestStage> = new Set(["uploading", "transcribing", "parsing", "sending"]);
/** Stages that have something to show in the panel: the cards, the question, the failure. */
const IN_PANEL: ReadonlySet<IngestStage> = new Set(["confirm", "sending", "question", "error"]);

type Person = { id: string; full_name: string; position: string | null; aliases: string[] | null };

/** What goes in front of the phrase for a pinned person: the name they are called by (as on Пульс). */
function addressOf(person: Person): string {
  return `${person.aliases?.[0] ?? person.full_name.trim().split(/\s+/)[0]}, `;
}

function PulseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,12 7,12 10,5 14,19 17,10 19,12 22,12" />
    </svg>
  );
}

/**
 * The director's order line over the whole desk (D-153 §5, D-154): the product's signature — the
 * pulse mark, a real example in the field, a ring of the accent when it has the caret. Free text
 * goes through the very same parser as speech (principle 1; the errand matcher of D-79 §9 is
 * inside `submitText`); the stage shows under the line, the parsed cards in the right-hand panel.
 * Typing a name offers the people it may be (↑/↓, Tab or Enter): the pick pins the person by id
 * (D-84), the parser no longer guesses «кому из них». «Дать задачу» on a card does the same.
 */
export function CommandLine() {
  const submitText = useIngestStore((state) => state.submitText);
  const stage = useIngestStore((state) => state.stage);
  const reset = useIngestStore((state) => state.reset);
  const [value, setValue] = useState("");
  const [pin, setPin] = useState<ComposePin | null>(null);
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // the roster is asked once the line is touched: asked by the shell at once, it landed before the
  // screen under it hydrated, and a screen drawing people (Команда, Экран) differed from the server's HTML
  const [touched, setTouched] = useState(false);
  const people = usePeople(touched);

  // «Дать задачу» on a person's card: one-shot, consumed here (the phone's sheet does the same)
  useEffect(
    () =>
      useComposeStore.subscribe((state, previous) => {
        if (state.requestId === previous.requestId) return;
        const request = useComposeStore.getState().consume();
        setPin(request.pin);
        if (request.prefill) setValue(request.prefill);
        field.current?.focus();
      }),
    [],
  );

  // who the word under the caret may be — only while no one is pinned yet
  const at = pin ? null : wordAtCaret(value, caret);
  const team = useMemo<Person[]>(
    () => (people.data ?? []).filter((person) => person.is_active && person.role !== "tv" && person.role !== "director"),
    [people.data],
  );
  const offers = useMemo(() => (at && at.word !== dismissed ? suggestPeople(team, at.word) : []), [at, dismissed, team]);
  const open = offers.length > 0;

  const pick = (person: Person) => {
    if (!at) return;
    // the typed word gives way to the pin; what was before and after it stays
    const rest = `${value.slice(0, at.start)}${value.slice(at.start + at.word.length)}`.replace(/^\s+/, "");
    setPin({ id: person.id, name: shortName(person.full_name), address: addressOf(person) });
    setValue(rest);
    setChosen(0);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(rest.length, rest.length);
      setCaret(rest.length);
    });
  };

  const working = WORKING.has(stage);
  const submit = () => {
    const text = value.trim();
    if (!text || working) return;
    const person = pin;
    setValue("");
    setPin(null);
    setCaret(0);
    // the address still goes in front, so the words read as an order to that person
    void submitText(person ? `${person.address}${text}` : text, person ? { id: person.id, name: person.name } : undefined);
  };

  return (
    <div className="relative min-w-0 max-w-[1280px] flex-1">
      <div className="desk-command field flex h-12 items-center gap-2.5 rounded-[14px] pl-3.5 pr-2.5">
        <PulseGlyph />
        {pin ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/50 bg-accent/12 py-0.5 pl-0.5 pr-1 text-[13px] font-semibold leading-[18px]" data-testid="command-pin">
            <Avatar name={pin.name} size={20} />
            {pin.name}
            <button type="button" aria-label="Убрать исполнителя" onClick={() => setPin(null)} className="flex h-5 w-5 items-center justify-center rounded-full text-[14px] leading-none text-muted hover:text-text">
              ×
            </button>
          </span>
        ) : null}
        <input
          ref={field}
          id={COMMAND_FIELD_ID}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setChosen(0);
            setDismissed(null);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onFocus={() => setTouched(true)}
          onKeyDown={(event) => {
            if (open && (event.code === "ArrowDown" || event.code === "ArrowUp")) {
              event.preventDefault();
              setChosen((index) => (index + (event.code === "ArrowDown" ? 1 : offers.length - 1)) % offers.length);
              return;
            }
            if (open && (event.key === "Tab" || (event.key === "Enter" && !event.nativeEvent.isComposing))) {
              event.preventDefault();
              pick(offers[Math.min(chosen, offers.length - 1)]);
              return;
            }
            if (open && event.key === "Escape") {
              // the offer goes; the next Esc lets go of the field (the desk's own Esc)
              event.preventDefault();
              event.stopPropagation();
              setDismissed(at?.word ?? null);
              return;
            }
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            } else if (event.key === "Backspace" && !value && pin) {
              setPin(null);
            }
          }}
          placeholder={pin ? "Что сделать и к какому сроку — Enter" : "Кому и что сделать: «Ерлану смета по объекту до пятницы» — Enter"}
          aria-label="Поручение"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? "desk-command-people" : undefined}
          autoComplete="off"
          spellCheck={false}
          data-testid="command-line"
          className="min-w-0 flex-1 bg-transparent text-[15px] leading-5 outline-none placeholder:text-text/45"
          style={{ caretColor: "var(--accent)" }}
        />
        {working ? (
          <span className="shrink-0 text-[12px] font-medium leading-4 text-accent" data-testid="command-stage">
            {STAGE_LINE[stage]}
          </span>
        ) : (
          <span className="hidden shrink-0 items-center gap-1 lg:flex" aria-hidden>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        )}
      </div>
      {working ? (
        <span aria-hidden className="absolute inset-x-4 -bottom-[3px] h-[2px] overflow-hidden rounded-full bg-accent/15">
          <span className="desk-progress block h-full w-1/3 rounded-full bg-accent" />
        </span>
      ) : null}
      {open ? (
        <ul
          id="desk-command-people"
          role="listbox"
          aria-label="Кому"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[340px] overflow-hidden rounded-[12px] border border-border bg-surface py-1"
          style={{ boxShadow: "var(--shadow-raised)" }}
          data-testid="command-people"
        >
          {offers.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === chosen}>
              <button
                type="button"
                // a mouse pick must not blur the field first
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(person)}
                onMouseEnter={() => setChosen(index)}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${index === chosen ? "bg-surface-2" : ""}`}
              >
                <Avatar name={person.full_name} size={26} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] leading-5">{person.full_name}</span>
                  {person.position ? <span className="truncate text-[12px] leading-4 text-muted">{person.position}</span> : null}
                </span>
                {index === chosen ? <span className="ml-auto shrink-0"><Kbd>Tab</Kbd></span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {IN_PANEL.has(stage) ? (
        <InPanel panelKey="ingest" onClose={reset}>
          <DeskConfirm />
        </InPanel>
      ) : null}
    </div>
  );
}
