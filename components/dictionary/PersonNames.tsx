"use client";

import { useState } from "react";

import { EntryChip, SuggestChip } from "@/components/dictionary/chips";
import { EntryInput } from "@/components/dictionary/EntryInput";
import { toast } from "@/components/ui/Toast";
import { ALIAS_MAX, byRussian, planAliases, type NameReport, type RosterPerson } from "@/lib/dictionary";
import { useEditAliases } from "@/lib/dictionary-queries";
import { initialsOf } from "@/lib/people/queries";

function quoted(list: string[]): string {
  return list.map((s) => `«${s}»`).join(", ");
}

/**
 * One person on the names tab (D-111): the forms they answer to as chips, «+ имя» opens
 * the field in place, the forms the app would give them on its own wait as dashed chips —
 * one tap takes one. Saved on the tap; a removed form comes back from the toast.
 */
export function PersonNames({
  person,
  position,
  report,
  people,
  editable,
  fresh,
  onAdded,
}: {
  person: RosterPerson;
  position: string | null;
  report: NameReport;
  people: RosterPerson[];
  /** False for a director seen by the secretary (D-104). */
  editable: boolean;
  fresh: ReadonlySet<string>;
  onAdded: (entries: string[]) => void;
}) {
  const edit = useEditAliases();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const plan = planAliases(person, text, people);
  const aliases = [...person.aliases].sort(byRussian);
  const full = person.aliases.length >= ALIAS_MAX;

  const add = (entries: string[]) => {
    if (!entries.length) return;
    edit.mutate({ id: person.id, add: entries });
    onAdded(entries);
  };

  const submit = () => {
    add(plan.add);
    setText("");
  };

  const remove = (alias: string) => {
    edit.mutate({ id: person.id, remove: [alias] });
    toast(`Убрал «${alias}»`, {
      action: { label: "Вернуть", onClick: () => edit.mutate({ id: person.id, add: [alias] }) },
      lifetimeMs: 5000,
    });
  };

  // what the field will do, said before Enter: a skipped form is never a silent no-op
  const notes: string[] = [];
  if (plan.shared.length) {
    for (const s of plan.shared) notes.push(`«${s.entry}» есть и у других: ${s.people.join(", ")} — на это имя ИИ спросит, кого`);
  }
  if (plan.fullName) notes.push("Полное имя ИИ уже знает из карточки");
  if (plan.existing.length) notes.push(`Уже есть: ${quoted(plan.existing)}`);
  if (plan.tooShort.length) notes.push("Одна буква — слишком коротко");
  if (plan.tooLong.length) notes.push("Слишком длинно — до 60 знаков");
  if (plan.overflow.length) notes.push(`У человека уже ${ALIAS_MAX} имён`);

  return (
    <li className="card px-4 py-3.5" data-testid="dictionary-person">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-bg"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
        >
          {initialsOf(person.full_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold leading-[22px]">{person.full_name}</span>
          {position ? <span className="block truncate text-[13px] leading-4 text-muted">{position}</span> : null}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {aliases.map((alias) => (
          <EntryChip
            key={alias}
            label={alias}
            fresh={fresh.has(`${person.id}:${alias}`)}
            onRemove={editable ? () => remove(alias) : undefined}
          />
        ))}
        {editable && !adding && !full ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-[34px] items-center rounded-full border border-border px-3 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] text-muted transition-transform duration-[120ms] active:scale-[0.96]"
          >
            + имя
          </button>
        ) : null}
        {!aliases.length && !editable ? <span className="text-[14px] leading-[34px] text-muted">только полное имя</span> : null}
      </div>
      {!editable ? <p className="mt-2 text-[13px] leading-[18px] text-muted">Имена директора меняет только директор</p> : null}

      {editable && adding ? (
        <div className="card-in mt-3">
          <EntryInput
            value={text}
            onChange={setText}
            onSubmit={submit}
            canSubmit={plan.add.length > 0}
            label={`Как ещё зовут: ${person.full_name}`}
            placeholder="Жаке, главбух"
            autoFocus
            onCancel={() => {
              setText("");
              setAdding(false);
            }}
          />
          {notes.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {notes.map((note) => (
                <li key={note} className="text-[13px] leading-[18px] text-warn">
                  {note}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] leading-[18px] text-muted">Можно несколько через запятую. Enter — добавить</p>
          )}
        </div>
      ) : null}

      {editable && report.suggestions.length ? (
        <div className="mt-3">
          <p className="text-[13px] leading-[18px] text-muted">
            {aliases.length ? "Стоит добавить:" : "Коротких имён нет — ИИ знает только полное. Стоит добавить:"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {report.suggestions.map((suggestion) => (
              <SuggestChip key={suggestion} label={suggestion} disabled={full} onTake={() => add([suggestion])} />
            ))}
          </div>
        </div>
      ) : null}

      {report.shared.length ? (
        <ul className="mt-3 flex flex-col gap-1">
          {report.shared.map((s) => (
            <li key={s.alias} className="flex gap-2 text-[13px] leading-[18px] text-muted">
              <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--warn)" }} />
              <span>
                «{s.alias}» есть и у других: {s.people.join(", ")} — на одно «{s.alias}» ИИ спросит, кого
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
