"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DeskConfirm } from "@/components/desk/DeskConfirm";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { formatWhen } from "@/lib/desk/when";
import { COMMAND_FIELD_ID } from "@/lib/desk/keys";
import { matchSections, matchTasks, searchPeople } from "@/lib/desk/palette";
import { DESK_NAV, DESK_PROFILE, DESK_PROFILE_KEY } from "@/lib/desk/routes";
import { suggestPeople, wordAtCaret } from "@/lib/desk/suggest";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { useIngestStore, type IngestStage } from "@/lib/store/ingest";
import { useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { STAGE_LINE } from "@/lib/voice/stages";

/** Stages the line shows as a thin bar under itself; the phrase is never silently in flight (D-43). */
const WORKING: ReadonlySet<IngestStage> = new Set(["uploading", "transcribing", "parsing", "sending"]);
/** Stages that have something to show in the panel: the cards, the question, the failure. */
const IN_PANEL: ReadonlySet<IngestStage> = new Set(["confirm", "sending", "question", "error"]);

const LIST_ID = "desk-command-list";
const SECTIONS = [...DESK_NAV.director, { href: DESK_PROFILE, label: "Профиль", key: DESK_PROFILE_KEY }];

type Person = { id: string; full_name: string; position: string | null; aliases: string[] | null };

/** One row of the palette: pin a person to the order, or go somewhere. */
type Row =
  | { kind: "pin"; person: Person }
  | { kind: "section"; href: string; label: string; key?: string }
  | { kind: "person"; person: Person }
  | { kind: "task"; task: TaskWithPeople };

const GROUP: Record<Row["kind"], string> = { pin: "Поручить", section: "Разделы", person: "Люди", task: "Задачи" };

/** What goes in front of the phrase for a pinned person: the name they are called by (as on Пульс). */
function addressOf(person: Person): string {
  return `${person.aliases?.[0] ?? person.full_name.trim().split(/\s+/)[0]}, `;
}

function rowKey(row: Row): string {
  if (row.kind === "section") return `section:${row.href}`;
  if (row.kind === "task") return `task:${row.task.id}`;
  return `${row.kind}:${row.person.id}`;
}

function PulseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,12 7,12 10,5 14,19 17,10 19,12 22,12" />
    </svg>
  );
}

function SectionGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h12M13 7l5 5-5 5" />
    </svg>
  );
}

/**
 * The director's order line over the whole desk (D-153 §5, D-154): the product's signature — the
 * pulse mark, a real example in the field, a ring of the accent when it has the caret. Free text
 * goes through the very same parser as speech (principle 1; the errand matcher of D-79 §9 is
 * inside `submitText`); the stage shows under the line, the parsed order in the right-hand panel.
 *
 * It is the desk's palette too (D-154 wave 3): while the words are typed, what they may also mean
 * shows under the line from data already read — whom to give it to (the name under the caret;
 * Tab pins the person by id, D-84, and the parser no longer guesses «кому из них»), a section, a
 * person's card, a task already given. ↑/↓ pick a row and Enter opens it; with no row picked
 * Enter sends the order, as always. The roster and the tasks are asked on the first focus only:
 * asked by the shell at once, they landed before the screen under it hydrated (#418).
 */
export function CommandLine() {
  const router = useRouter();
  const submitText = useIngestStore((state) => state.submitText);
  const stage = useIngestStore((state) => state.stage);
  const reset = useIngestStore((state) => state.reset);
  const [value, setValue] = useState("");
  const [pin, setPin] = useState<ComposePin | null>(null);
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState(-1);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const people = usePeople(touched);
  const me = useMe().data;
  const sent = useSentTasks(touched ? me?.userId : undefined);

  useShortcuts("Строка поручения", [
    { keys: ["Ctrl K"], label: "Встать в строку" },
    { keys: ["/"], label: "Встать в строку (вне поля)" },
    { keys: ["Enter"], label: "Отправить поручение — или открыть выбранное" },
    { keys: ["↑", "↓"], label: "Выбрать раздел, человека, задачу" },
    { keys: ["Tab"], label: "Поручить человеку из подсказки" },
    { keys: ["Shift Enter"], label: "Открыть карточку человека" },
    { keys: ["Esc"], label: "Убрать подсказку, выйти из строки" },
  ]);

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

  const team = useMemo<Person[]>(
    () => (people.data ?? []).filter((person) => person.is_active && person.role !== "tv" && person.role !== "director"),
    [people.data],
  );
  const tasks = useMemo(() => {
    const list = sent.data ?? [];
    return {
      byId: new Map(list.map((task) => [task.id, task])),
      // the palette matches the assignee's name too: «смета ерлан»
      plain: list.map((task) => ({ id: task.id, title: task.title, status: task.status, assignee: task.assignee?.full_name ?? null, deadline: task.deadline, created_at: task.created_at })),
    };
  }, [sent.data]);

  // who the word under the caret may be — only while no one is pinned yet
  const at = pin ? null : wordAtCaret(value, caret);
  const query = value.trim();
  const rows = useMemo<Row[]>(() => {
    if (!query) return [];
    const offers = at ? suggestPeople(team, at.word) : [];
    const offered = new Set(offers.map((person) => person.id));
    const sections = matchSections(query, SECTIONS);
    const others = searchPeople(team, query, 3).filter((person) => !offered.has(person.id));
    const found = matchTasks(query, tasks.plain).flatMap((hit) => {
      const task = tasks.byId.get(hit.id);
      return task ? [task] : [];
    });
    return [
      ...offers.map((person): Row => ({ kind: "pin", person })),
      ...sections.map((section): Row => ({ kind: "section", ...section })),
      ...others.map((person): Row => ({ kind: "person", person })),
      ...found.map((task): Row => ({ kind: "task", task })),
    ];
  }, [at, query, team, tasks]);
  const pins = rows.filter((row) => row.kind === "pin").length;
  const open = focused && rows.length > 0 && dismissed !== value;
  const picked = open && chosen >= 0 && chosen < rows.length ? rows[chosen] : null;

  const pinPerson = (person: Person) => {
    // the typed word gives way to the pin; what was before and after it stays
    const rest = at ? `${value.slice(0, at.start)}${value.slice(at.start + at.word.length)}`.replace(/^\s+/, "") : value;
    setPin({ id: person.id, name: shortName(person.full_name), address: addressOf(person) });
    setValue(rest);
    setChosen(-1);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(rest.length, rest.length);
      setCaret(rest.length);
    });
  };

  const go = (href: string) => {
    setValue("");
    setChosen(-1);
    field.current?.blur();
    router.push(href);
  };

  const act = (row: Row, alt: boolean) => {
    if (row.kind === "pin" && !alt) pinPerson(row.person);
    else if (row.kind === "pin" || row.kind === "person") go(`/desk/team/${row.person.id}`);
    else if (row.kind === "section") go(row.href);
    else go(`/desk/tasks?id=${row.task.id}`);
  };

  const working = WORKING.has(stage);
  const submit = () => {
    const text = value.trim();
    if (!text || working) return;
    const person = pin;
    setValue("");
    setPin(null);
    setCaret(0);
    setChosen(-1);
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
            setChosen(-1);
            setDismissed(null);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onFocus={() => {
            setTouched(true);
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            setChosen(-1);
          }}
          onKeyDown={(event) => {
            const composing = event.nativeEvent.isComposing;
            if (!open && event.code === "ArrowDown" && rows.length > 0) {
              // the list hidden by Esc comes back with its first row picked
              event.preventDefault();
              setDismissed(null);
              setChosen(0);
              return;
            }
            if (open && (event.code === "ArrowDown" || event.code === "ArrowUp")) {
              event.preventDefault();
              const down = event.code === "ArrowDown";
              setChosen((index) => (down ? (index + 1 >= rows.length ? -1 : index + 1) : index <= -1 ? rows.length - 1 : index - 1));
              return;
            }
            if (open && pins > 0 && event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const row = picked?.kind === "pin" ? picked : rows[0];
              if (row.kind === "pin") pinPerson(row.person);
              return;
            }
            if (event.key === "Enter" && !composing) {
              event.preventDefault();
              if (picked) act(picked, event.shiftKey);
              else submit();
              return;
            }
            if (open && event.key === "Escape") {
              // the list goes; the next Esc lets go of the field (the desk's own Esc)
              event.preventDefault();
              event.stopPropagation();
              setDismissed(value);
              setChosen(-1);
              return;
            }
            if (event.key === "Backspace" && !value && pin) setPin(null);
          }}
          placeholder={pin ? "Что сделать и к какому сроку — Enter" : "Кому и что сделать: «Ерлану смета по объекту до пятницы» — Enter"}
          aria-label="Поручение"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? LIST_ID : undefined}
          aria-activedescendant={picked ? `${LIST_ID}-${chosen}` : undefined}
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
      {open ? <Palette rows={rows} chosen={chosen} onHover={setChosen} onAct={act} pins={pins} picked={picked} /> : null}
      {IN_PANEL.has(stage) ? (
        <InPanel panelKey="ingest" onClose={reset}>
          <DeskConfirm />
        </InPanel>
      ) : null}
    </div>
  );
}

/** The rows under the line, grouped; the footer says what Enter and Tab do right now. */
function Palette({
  rows,
  chosen,
  onHover,
  onAct,
  pins,
  picked,
}: {
  rows: Row[];
  chosen: number;
  onHover: (index: number) => void;
  onAct: (row: Row, alt: boolean) => void;
  pins: number;
  picked: Row | null;
}) {
  return (
    <div
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(560px,100%)] overflow-hidden rounded-[12px] border border-border bg-surface"
      style={{ boxShadow: "var(--shadow-raised)" }}
      data-testid="command-palette"
    >
      <ul id={LIST_ID} role="listbox" aria-label="Подсказки" className="max-h-[min(60vh,440px)] overflow-y-auto py-1" data-testid="command-people">
        {rows.map((row, index) => {
          const head = index === 0 || rows[index - 1].kind !== row.kind;
          const active = index === chosen;
          return (
            <li key={rowKey(row)} role="presentation">
              {head ? <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{GROUP[row.kind]}</p> : null}
              <div
                id={`${LIST_ID}-${index}`}
                role="option"
                aria-selected={active}
                data-kind={row.kind}
                // a mouse pick must not blur the field first
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => onAct(row, event.shiftKey)}
                onMouseMove={() => {
                  if (!active) onHover(index);
                }}
                className={`mx-1 flex h-10 cursor-default items-center gap-2.5 rounded-[8px] px-2.5 ${active ? "bg-surface-2" : ""}`}
              >
                <RowBody row={row} />
                <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
                  {active ? (
                    row.kind === "pin" ? (
                      <>
                        <Kbd>Enter</Kbd>
                        <span className="text-[12px] text-muted">поручить</span>
                      </>
                    ) : (
                      <>
                        <Kbd>Enter</Kbd>
                        <span className="text-[12px] text-muted">открыть</span>
                      </>
                    )
                  ) : row.kind === "pin" && index === 0 ? (
                    <Kbd>Tab</Kbd>
                  ) : row.kind === "section" && row.key ? (
                    <span className="flex items-center gap-1 opacity-70">
                      <Kbd>G</Kbd>
                      <Kbd>{row.key}</Kbd>
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[12px] leading-4 text-muted">
        <Hint keys={["↑", "↓"]}>выбрать</Hint>
        <Hint keys={["Enter"]}>{picked ? (picked.kind === "pin" ? "поручить" : "открыть") : "отправить поручение"}</Hint>
        {pins > 0 ? <Hint keys={["Tab"]}>поручить первому</Hint> : null}
        {picked?.kind === "pin" ? <Hint keys={["Shift", "Enter"]}>карточка</Hint> : null}
        <span className="ml-auto">
          <Hint keys={["Esc"]}>скрыть</Hint>
        </span>
      </div>
    </div>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span>{children}</span>
    </span>
  );
}

function RowBody({ row }: { row: Row }) {
  if (row.kind === "section") {
    return (
      <>
        <SectionGlyph />
        <span className="truncate text-[14px] leading-5">{row.label}</span>
      </>
    );
  }
  if (row.kind === "task") {
    const task = row.task;
    const sub = [task.assignee?.full_name ? shortName(task.assignee.full_name) : null, task.deadline ? `до ${formatWhen(task.deadline)}` : null].filter(Boolean).join(" · ");
    return (
      <>
        <StatusGlyph status={task.status} size={16} />
        <span className="min-w-0 truncate text-[14px] leading-5">{task.title}</span>
        {sub ? <span className="shrink-0 truncate text-[12px] leading-4 text-muted">{sub}</span> : null}
      </>
    );
  }
  const person = row.person;
  return (
    <>
      <Avatar name={person.full_name} size={24} />
      <span className="min-w-0 truncate text-[14px] leading-5">{person.full_name}</span>
      {person.position ? <span className="min-w-0 shrink truncate text-[12px] leading-4 text-muted">{person.position}</span> : null}
    </>
  );
}
