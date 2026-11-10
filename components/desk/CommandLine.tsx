"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DeskConfirm } from "@/components/desk/DeskConfirm";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { formatWhen } from "@/lib/desk/when";
import { COMMAND_FIELD_ID } from "@/lib/desk/keys";
import { matchCommands, matchSections, matchTasks, searchPeople, taskLookup } from "@/lib/desk/palette";
import { DESK_NAV, DESK_PROFILE, DESK_PROFILE_KEY } from "@/lib/desk/routes";
import { suggestPeople, wordAtCaret } from "@/lib/desk/suggest";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { useIngestStore, type IngestStage } from "@/lib/store/ingest";
import { useMe, useSentTasks, useTaskSearch, type TaskWithPeople } from "@/lib/tasks/queries";
import { STAGE_LINE } from "@/lib/voice/stages";

/** Stages the line shows as a thin bar under itself; the phrase is never silently in flight (D-43). */
const WORKING: ReadonlySet<IngestStage> = new Set(["uploading", "transcribing", "parsing", "sending"]);
/** Stages that have something to show in the panel: the cards, the question, the failure. */
const IN_PANEL: ReadonlySet<IngestStage> = new Set(["confirm", "sending", "question", "error"]);

const LIST_ID = "desk-command-list";
const SECTIONS = [...DESK_NAV.director, { href: DESK_PROFILE, label: "Профиль", key: DESK_PROFILE_KEY }];

type Person = { id: string; full_name: string; position: string | null; aliases: string[] | null };

/** One row of the palette: a move named in words, pin a person to the order, or go somewhere. */
type Row =
  | { kind: "command"; key: string; label: string; href: string; lead: boolean }
  | { kind: "pin"; person: Person }
  | { kind: "section"; href: string; label: string; key?: string }
  | { kind: "person"; person: Person }
  | { kind: "task"; task: TaskWithPeople };

const GROUP: Record<Row["kind"], string> = { command: "Действия", pin: "Поручить", section: "Разделы", person: "Люди", task: "Задачи" };

/** What goes in front of the phrase for a pinned person: the name they are called by (as on Пульс). */
function addressOf(person: Person): string {
  return `${person.aliases?.[0] ?? person.full_name.trim().split(/\s+/)[0]}, `;
}

function rowKey(row: Row): string {
  if (row.kind === "command") return `command:${row.key}`;
  if (row.kind === "section") return `section:${row.href}`;
  if (row.kind === "task") return `task:${row.task.id}`;
  return `${row.kind}:${row.person.id}`;
}

/**
 * The director's order line over the whole desk (D-153 §5, D-154): the product's signature — a
 * line of a form standing on the sheet's heavy rule, a real example in the field, the rule turning
 * to the pen when it has the caret (D-158). Free text goes through the very same parser as speech (principle 1; the errand matcher of D-79 §9 is
 * inside `submitText`); the stage shows under the line, the parsed order in the right-hand panel.
 *
 * It is the desk's palette too (D-154 wave 3): while the words are typed, what they may also mean
 * shows under the line from data already read — whom to give it to (the name under the caret;
 * Tab pins the person by id, D-84, and the parser no longer guesses «кому из них»), a section, a
 * person's card, a task already given — the ones loaded at once, the rest of history from the
 * server a moment later (`useTaskSearch`, never while a person is pinned: then the words are an
 * order). ↑/↓ pick a row and Enter opens it; with no row picked Enter sends the order, as always —
 * except a move named in words (D-160): «новый сотрудник», «удалить Ерлана» stand first under
 * «Действия», and when the words are short and start with the verb the row is picked by itself:
 * Enter opens the form or the «Удалить» dialog instead of sending a «не разобрал» to the parser.
 * The roster and the tasks are asked on the first focus only: asked by the shell at once, they
 * landed before the screen under it hydrated (#418).
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
    { keys: ["Ctrl K"], label: "«новый сотрудник» или «удалить Ерлана» + Enter — действие, не поручение" },
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
  // the server reads titles: a name among the words goes to the assignee (`taskLookup`)
  const lookup = useMemo(() => taskLookup(value.trim(), team), [value, team]);
  const searched = useTaskSearch({ text: lookup.text, assignees: lookup.assignees, enabled: touched && focused && !pin });
  const tasks = useMemo(() => {
    // a loaded list's own copy wins
    const byId = new Map([...searched.rows, ...(sent.data ?? [])].map((task) => [task.id, task]));
    return {
      byId,
      // the palette matches the assignee's name too: «смета ерлан»
      plain: [...byId.values()].map((task) => ({ id: task.id, title: task.title, status: task.status, assignee: task.assignee?.full_name ?? null, deadline: task.deadline, created_at: task.created_at })),
      // hits of an older text stand under the new words only in the list of known tasks, not as hits
      found: new Set(searched.stale ? [] : searched.rows.map((task) => task.id)),
    };
  }, [sent.data, searched.rows, searched.stale]);

  // who the word under the caret may be — only while no one is pinned yet
  const at = pin ? null : wordAtCaret(value, caret);
  const query = value.trim();
  const rows = useMemo<Row[]>(() => {
    if (!query) return [];
    const offers = at ? suggestPeople(team, at.word) : [];
    const offered = new Set(offers.map((person) => person.id));
    const sections = matchSections(query, SECTIONS);
    const others = searchPeople(team, query, 3).filter((person) => !offered.has(person.id));
    const found = matchTasks(query, tasks.plain, 5, tasks.found).flatMap((hit) => {
      const task = tasks.byId.get(hit.id);
      return task ? [task] : [];
    });
    const commands = matchCommands(query, team).map((command): Row => {
      if (command.kind === "new") return { kind: "command", key: "new", label: "Новый сотрудник", href: "/desk/team/new", lead: command.lead };
      if (command.kind === "list") return { kind: "command", key: "list", label: "Добавить списком из Excel", href: "/desk/team/new?tab=list", lead: false };
      if (command.kind === "team") return { kind: "command", key: "team", label: "Удалить сотрудника — выбрать в «Команде»", href: "/desk/team", lead: false };
      const who = command.person;
      return { kind: "command", key: `remove:${who.id}`, label: `Удалить: ${who.full_name}…`, href: `/desk/team?p=${who.id}&remove=1`, lead: command.lead };
    });
    // a command's words are not a name to pin: «удалить ерлана» offers no «Поручить Ерлану»
    const pinning = commands.length === 0;
    return [
      ...commands,
      ...(pinning ? offers : []).map((person): Row => ({ kind: "pin", person })),
      ...sections.map((section): Row => ({ kind: "section", ...section })),
      ...others.map((person): Row => ({ kind: "person", person })),
      ...found.map((task): Row => ({ kind: "task", task })),
    ];
  }, [at, query, team, tasks]);
  const pins = rows.filter((row) => row.kind === "pin").length;
  const open = focused && rows.length > 0 && dismissed !== value;
  // a move named in short words is picked by itself; the arrows take over (-2: nothing, on purpose)
  const lead = rows[0]?.kind === "command" && rows[0].lead;
  const current = chosen >= 0 ? chosen : chosen === -1 && lead ? 0 : -1;
  const picked = open && current >= 0 && current < rows.length ? rows[current] : null;

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
    if (row.kind === "command") go(row.href);
    else if (row.kind === "pin" && !alt) pinPerson(row.person);
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
    <div className="relative min-w-0 flex-1">
      <div className="desk-command field flex h-12 items-center gap-2.5 rounded-[2px] pl-3.5 pr-2.5">
        {pin ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[15px] font-medium leading-5 text-accent" data-testid="command-pin">
            {pin.name}
            <button type="button" aria-label="Убрать исполнителя" onClick={() => setPin(null)} className="flex h-5 w-5 items-center justify-center text-[15px] leading-none text-muted hover:text-text">
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
              const index = current;
              setChosen(down ? (index + 1 >= rows.length ? -2 : index + 1) : index <= -1 ? rows.length - 1 : index === 0 ? -2 : index - 1);
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
        // the bar runs along the sheet's heavy rule: the pen on a pale track, whatever the rule's own ink
        <span aria-hidden className="absolute inset-x-0 -bottom-[10px] h-[2px] overflow-hidden bg-border">
          <span className="desk-progress block h-full w-1/3 bg-accent" />
        </span>
      ) : null}
      {open ? <Palette rows={rows} chosen={current} onHover={setChosen} onAct={act} pins={pins} picked={picked} /> : null}
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
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(560px,100%)] overflow-hidden rounded-[2px] border border-text bg-surface"
      style={{ boxShadow: "var(--shadow-raised)" }}
      data-testid="command-palette"
    >
      <ul id={LIST_ID} role="listbox" aria-label="Подсказки" className="max-h-[min(60vh,440px)] overflow-y-auto py-1" data-testid="command-people">
        {rows.map((row, index) => {
          const head = index === 0 || rows[index - 1].kind !== row.kind;
          const active = index === chosen;
          return (
            <li key={rowKey(row)} role="presentation">
              {head ? <p className="desk-label px-3 pb-1 pt-2 uppercase">{GROUP[row.kind]}</p> : null}
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
                className={`flex h-9 cursor-default items-center gap-2.5 px-3 ${active ? "bg-surface-2" : ""}`}
              >
                <RowBody row={row} />
                <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
                  {active ? (
                    row.kind === "command" ? (
                      <>
                        <Kbd>Enter</Kbd>
                        <span className="text-[12px] text-muted">сделать</span>
                      </>
                    ) : row.kind === "pin" ? (
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
      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[12px] leading-4 text-muted">
        <Hint keys={["Enter"]}>{picked ? (picked.kind === "pin" ? "поручить" : picked.kind === "command" ? "сделать" : "открыть") : "отправить поручение"}</Hint>
        {pins > 0 ? <Hint keys={["Tab"]}>поручить первому</Hint> : null}
        {picked?.kind === "pin" ? <Hint keys={["Shift Enter"]}>карточка</Hint> : null}
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
  if (row.kind === "command") {
    return (
      <span className={`truncate text-[14px] leading-5 ${row.key.startsWith("remove") ? "text-danger" : "font-medium"}`} data-testid="command-action">
        {row.label}
      </span>
    );
  }
  if (row.kind === "section") {
    return <span className="truncate text-[14px] leading-5">{row.label}</span>;
  }
  if (row.kind === "task") {
    const task = row.task;
    // closed work is found by when it closed; its deadline no longer says anything
    const closed = task.status === "done" || task.status === "revoked";
    // a task handed over is «передана», as in «Задачи» and on the person's card
    const closedWord = task.status === "revoked" && task.passed_to ? "передана" : "закрыта";
    const when = closed && task.closed_at ? `${closedWord} ${formatWhen(task.closed_at)}` : task.deadline ? `до ${formatWhen(task.deadline)}` : null;
    const sub = [task.assignee?.full_name ? shortName(task.assignee.full_name) : null, when].filter(Boolean).join(" · ");
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
      <span className="min-w-0 truncate text-[14px] leading-5">{person.full_name}</span>
      {person.position ? <span className="min-w-0 shrink truncate text-[12px] leading-4 text-muted">{person.position}</span> : null}
    </>
  );
}
