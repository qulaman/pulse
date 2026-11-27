"use client";

import { Send, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { suggestPeople } from "@/lib/desk/suggest";
import { pointLabel } from "@/lib/mindboard/sketch";
import { branchesOf } from "@/lib/mindboard/tree";
import { useAssignNotes, type AssignInput } from "@/lib/notes/assign";
import { firstLine } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import { shortName } from "@/lib/people/names";
import { usePeople, type Person } from "@/lib/people/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { pluralRu, SHORT_STATUS } from "@/lib/tasks/status-text";
import { useQuietHours } from "@/lib/voice/quietHours";


type Chosen = { person: Who; crid: string };
type Who = { id: string; full_name: string };

/**
 * «Раздать поручения» on the desk (D-177, replaces the phone view of D-156): a mode over the board —
 * every line with words and no task yet gets a «Кому» field; a name typed in it (two letters, the
 * desk's `suggestPeople`) and Enter pick the person and go on to the next line; one «Отправить N»
 * sends them all through `useAssignNotes`, one task per line. The `client_request_id` is born with
 * the pick (principle 7): a second press after a lost answer lands on the same tasks. After hours the
 * people get them in the morning unless «сразу» is pressed — the same choice as `AssignSheet`.
 * Esc leaves the mode; what was not sent keeps its pick until then.
 */
export function HandOut({
  rows,
  numbers,
  me,
  taskOf,
  onClose,
}: {
  rows: Note[];
  numbers: Map<string, number>;
  me: { userId: string };
  taskOf: (row: Note) => TaskWithPeople | undefined;
  onClose: () => void;
}) {
  const people = usePeople();
  const assign = useAssignNotes(me);
  // tasks handed out after hours wait for the morning (D-38) — unless «сразу»
  const { quiet, opensAt } = useQuietHours();
  const [now, setNow] = useState(false);
  const [picks, setPicks] = useState<Map<string, Chosen>>(() => new Map());
  const box = useRef<HTMLDivElement>(null);

  const team = useMemo(() => (people.data ?? []).filter((person: Person) => person.is_active && person.role !== "tv" && person.id !== me.userId), [people.data, me.userId]);
  // the lines in the order of the board: points, each with its sub-points
  const lines = useMemo(
    () =>
      branchesOf(rows)
        .flatMap(({ point, children }) => [{ row: point, sub: false }, ...children.map((child) => ({ row: child, sub: true }))])
        .filter(({ row }) => row.text.trim().length > 0),
    [rows],
  );
  const open = lines.filter(({ row }) => row.converted_task_id === null);
  const ready = open.filter(({ row }) => picks.has(row.id));

  const focusField = (index: number) => {
    const fields = box.current?.querySelectorAll<HTMLInputElement>("input[data-handout]");
    fields?.[index]?.focus();
  };

  const pick = (row: Note, person: Who | null) =>
    setPicks((was) => {
      const next = new Map(was);
      // the key is born with the pick: the same person picked again keeps it
      if (person) next.set(row.id, was.get(row.id)?.person.id === person.id ? (was.get(row.id) as Chosen) : { person, crid: crypto.randomUUID() });
      else next.delete(row.id);
      return next;
    });

  const send = () => {
    const inputs: AssignInput[] = ready.map(({ row }) => {
      const chosen = picks.get(row.id) as Chosen;
      return { note: row, person: chosen.person, forceNow: now, client_request_id: chosen.crid };
    });
    if (inputs.length === 0) return;
    assign.mutate(inputs, {
      onSuccess: ({ sent, failed }) => {
        setPicks((was) => {
          const next = new Map(was);
          for (const input of sent) next.delete(input.note.id);
          return next;
        });
        if (failed.length === 0) onClose();
      },
    });
  };

  return (
    <section className="board-handout" aria-label="Раздать поручения" data-testid="board-handout">
      <div className="board-handout-head flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-5">Раздать поручения</p>
          <p className="text-[13px] leading-5 text-muted">Кому — две буквы имени, Enter — и к следующему пункту</p>
        </div>
        {quiet ? (
          <button type="button" aria-pressed={now} onClick={() => setNow((was) => !was)} className="board-quiet desk-focus" data-testid="board-handout-now">
            {now ? "Уйдут сразу, несмотря на тихие часы" : `Тихие часы — получат утром в ${opensAt}`}
            <b>{now ? "утром" : "сразу"}</b>
          </button>
        ) : null}
        <Button size="sm" icon={<Send aria-hidden size={16} />} disabled={ready.length === 0 || assign.isPending} onClick={send} data-testid="board-handout-send">
          {ready.length > 0 ? `Отправить ${ready.length}` : "Отправить"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="board-handout-close">
          Готово <Kbd>Esc</Kbd>
        </Button>
      </div>
      <div ref={box} className="board-handout-list" role="list">
        {lines.length === 0 ? <p className="px-3 py-4 text-[13px] leading-5 text-muted">На доске нет пунктов со словами — раздавать нечего.</p> : null}
        {lines.map(({ row, sub }) => {
          const task = row.converted_task_id ? taskOf(row) : undefined;
          const index = open.findIndex((line) => line.row.id === row.id);
          return (
            <div key={row.id} role="listitem" className="board-handout-row" data-sub={sub ? "" : undefined} data-testid="board-handout-row">
              <span className="board-handout-n nums">{sub ? "·" : (numbers.get(row.id) ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] leading-5" title={row.text}>
                {firstLine(pointLabel(row.text, row.sketch))}
              </span>
              {row.converted_task_id ? (
                <span className="board-handout-done">
                  {task ? `${shortName(task.assignee?.full_name) || "Исполнитель"} · ${SHORT_STATUS[task.status]}` : "поручено"}
                </span>
              ) : (
                <WhoField
                  team={team}
                  chosen={picks.get(row.id)?.person ?? null}
                  onPick={(person) => {
                    pick(row, person);
                    if (person) focusField(index + 1);
                  }}
                  onStep={(to) => focusField(index + to)}
                />
              )}
            </div>
          );
        })}
      </div>
      {assign.isPending ? (
        <p className="mt-2 text-[13px] leading-5 text-muted" aria-live="polite">
          Отправляю {ready.length} {pluralRu(ready.length, ["поручение", "поручения", "поручений"])}…
        </p>
      ) : null}
    </section>
  );
}

/** «Кому»: a name typed, the matches under it, Enter or a click picks; a picked name is a chip with ×. */
function WhoField({ team, chosen, onPick, onStep }: { team: Person[]; chosen: Who | null; onPick: (person: Who | null) => void; onStep: (to: 1 | -1) => void }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);
  const [focused, setFocused] = useState(false);
  const found = useMemo(() => suggestPeople(team, text, 5), [team, text]);
  const choose = (person: Person) => {
    setText("");
    setAt(0);
    onPick({ id: person.id, full_name: person.full_name });
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && found.length > 0) {
      event.preventDefault();
      setAt((was) => Math.min(found.length - 1, was + 1));
    } else if (event.key === "ArrowUp" && found.length > 0) {
      event.preventDefault();
      setAt((was) => Math.max(0, was - 1));
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (found[at]) choose(found[at]);
      else if (!text.trim()) onStep(1);
    } else if (event.key === "Backspace" && !text && chosen) {
      event.preventDefault();
      onPick(null);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      event.stopPropagation();
      setText("");
    }
  };
  return (
    <span className="board-who relative">
      {chosen ? (
        <span className="board-who-chip" data-testid="board-handout-chosen">
          {shortName(chosen.full_name)}
          <button type="button" aria-label={`Убрать ${chosen.full_name}`} onClick={() => onPick(null)} className="desk-focus">
            <X aria-hidden size={12} />
          </button>
        </span>
      ) : null}
      <input
        data-handout
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setAt(0);
        }}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={chosen ? "" : "Кому"}
        aria-label="Кому поручить"
        className={`board-who-field ${chosen ? "w-6" : ""}`}
      />
      {focused && found.length > 0 ? (
        <span className="board-who-list" role="listbox">
          {found.map((person, index) => (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected={index === at}
              // a press before the blur, so the click lands on the name
              onMouseDown={(event) => {
                event.preventDefault();
                choose(person);
              }}
              className="board-who-option"
            >
              <span className="truncate">{person.full_name}</span>
              {person.position ? <span className="truncate text-muted">{person.position}</span> : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
