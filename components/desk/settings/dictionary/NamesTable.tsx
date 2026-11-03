"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { OfferPill, Pill } from "@/components/desk/settings/dictionary/parts";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { toast } from "@/components/ui/Toast";
import { ALIAS_MAX, byRussian, entryKey, nameReport, planAliases, type NameReport, type RosterPerson } from "@/lib/dictionary";
import { useEditAliases } from "@/lib/dictionary-queries";
import type { Person } from "@/lib/people/queries";

export type NamesFilter = "all" | "suggest" | "shared";

type Line = { person: Person; roster: RosterPerson; report: NameReport; editable: boolean };

const quoted = (list: string[]) => list.map((s) => `«${s}»`).join(", ");

/** What the add field will do with its text, said before Enter: a skipped form is never a silent no-op. */
function planNotes(plan: ReturnType<typeof planAliases>): string[] {
  const notes: string[] = [];
  for (const s of plan.shared) notes.push(`«${s.entry}» есть и у других: ${s.people.join(", ")} — на это имя ИИ спросит, кого`);
  if (plan.fullName) notes.push("Полное имя ИИ уже знает из карточки");
  if (plan.existing.length) notes.push(`Уже есть: ${quoted(plan.existing)}`);
  if (plan.tooShort.length) notes.push("Одна буква — слишком коротко");
  if (plan.tooLong.length) notes.push("Слишком длинно — до 60 знаков");
  if (plan.overflow.length) notes.push(`У человека уже ${ALIAS_MAX} имён`);
  return notes;
}

/** The field that opens in a row: several names through a comma, Enter adds them, Esc closes. */
function AddField({ line, people, onDone, onAdded }: { line: Line; people: RosterPerson[]; onDone: () => void; onAdded: (entries: string[]) => void }) {
  const edit = useEditAliases();
  const [text, setText] = useState("");
  const plan = planAliases(line.roster, text, people);
  const notes = text.trim() ? planNotes(plan) : [];
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // the table's own keys stay outside the field
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onDone();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!plan.add.length) return;
      edit.mutate({ id: line.person.id, add: plan.add });
      onAdded(plan.add);
      setText("");
    }
  };
  return (
    <div className="mt-1.5 flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!text.trim()) onDone();
        }}
        placeholder="Жаке, главбух — Enter добавит, Esc закроет"
        aria-label={`Как ещё зовут: ${line.person.full_name}`}
        className="field h-8 w-full max-w-[420px] px-2.5 text-[13px] leading-5 outline-none"
      />
      {notes.map((note) => (
        <span key={note} className="text-[12px] leading-4 text-warn">
          {note}
        </span>
      ))}
      {plan.add.length ? <span className="text-[12px] leading-4 text-muted">Enter — добавить {quoted(plan.add)} · Esc — закрыть</span> : null}
    </div>
  );
}

/**
 * «Имена» as a table (D-111): a person, the names they answer to — × on each, a field in the row
 * for more — the forms the app would add by itself, and the forms two people share. ↑/↓ choose a
 * person, Enter (or a double click) opens the field, Esc closes it; a right click — the row's menu.
 */
export function NamesTable({
  people,
  canEdit,
  query,
  filter,
  fresh,
  waiting,
  onAdded,
}: {
  people: Person[];
  canEdit: (person: Person) => boolean;
  query: string;
  filter: NamesFilter;
  fresh: ReadonlySet<string>;
  waiting: ReadonlySet<string>;
  onAdded: (id: string, entries: string[]) => void;
}) {
  const edit = useEditAliases();
  const menu = useContextMenu();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const roster = useMemo<RosterPerson[]>(() => people.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })), [people]);
  const lines = useMemo<Line[]>(
    () =>
      people.map((person, index) => ({
        person,
        roster: roster[index],
        report: nameReport(roster[index], roster),
        editable: canEdit(person),
      })),
    [people, roster, canEdit],
  );

  const q = entryKey(query);
  const shown = lines
    .filter((line) => !q || q.split(" ").every((word) => entryKey([line.person.full_name, line.person.position ?? "", ...line.person.aliases].join(" ")).includes(word)))
    .filter((line) => (filter === "suggest" ? line.editable && line.report.suggestions.length > 0 : filter === "shared" ? line.report.shared.length > 0 : true))
    .sort((a, b) => byRussian(a.person.full_name, b.person.full_name));

  const remove = (line: Line, alias: string) => {
    edit.mutate({ id: line.person.id, remove: [alias] });
    toast(`Убрал «${alias}»`, { action: { label: "Вернуть", onClick: () => edit.mutate({ id: line.person.id, add: [alias] }) }, lifetimeMs: 5000 });
  };
  const take = (line: Line, forms: string[]) => {
    const room = ALIAS_MAX - line.person.aliases.length;
    const add = forms.slice(0, Math.max(0, room));
    if (!add.length) return;
    edit.mutate({ id: line.person.id, add });
    onAdded(line.person.id, add);
  };
  const open = (line: Line) => {
    if (!line.editable) {
      toast("Имена директора меняет только директор");
      return;
    }
    if (line.person.aliases.length >= ALIAS_MAX) {
      toast(`У человека уже ${ALIAS_MAX} имён`);
      return;
    }
    setSelected(line.person.id);
    setAdding(line.person.id);
  };
  const itemsOf = (line: Line): MenuItem[] => [
    { key: "add", label: "Добавить имя", hint: "Enter", disabled: !line.editable, onSelect: () => open(line) },
    {
      key: "take",
      label: line.report.suggestions.length ? `Принять подсказки · ${line.report.suggestions.length}` : "Подсказок нет",
      disabled: !line.editable || line.report.suggestions.length === 0,
      onSelect: () => take(line, line.report.suggestions),
    },
    "separator",
    {
      key: "copy",
      label: "Скопировать имена",
      disabled: line.person.aliases.length === 0,
      onSelect: () => {
        void navigator.clipboard?.writeText(line.person.aliases.join(", ")).then(() => toast("Скопировал"));
      },
    },
  ];

  const columns: Column<Line>[] = [
    {
      key: "person",
      title: "Человек",
      width: "240px",
      sort: (a, b) => byRussian(a.person.full_name, b.person.full_name),
      render: (line) => <PersonCell name={line.person.full_name} sub={line.person.position} />,
    },
    {
      key: "names",
      title: "Как зовут вслух",
      sort: (a, b) => a.person.aliases.length - b.person.aliases.length,
      render: (line) => {
        const aliases = [...line.person.aliases].sort(byRussian);
        return (
          <div className="py-0.5">
            <div className="flex flex-wrap items-center gap-1">
              {aliases.map((alias) => (
                <Pill
                  key={alias}
                  label={alias}
                  fresh={fresh.has(`${line.person.id}:${alias}`)}
                  waiting={waiting.has(`${line.person.id}:${entryKey(alias)}`)}
                  onRemove={line.editable ? () => remove(line, alias) : undefined}
                />
              ))}
              {!aliases.length ? <span className="text-[13px] leading-6 text-muted">только полное имя</span> : null}
              {line.editable && adding !== line.person.id && aliases.length < ALIAS_MAX ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    open(line);
                  }}
                  className="inline-flex h-6 items-center rounded-full px-2 text-[13px] font-medium leading-4 text-muted opacity-0 transition-opacity duration-[120ms] hover:text-text focus-visible:opacity-100 [.desk-row:hover_&]:opacity-100 [.desk-row[aria-selected=true]_&]:opacity-100"
                >
                  + имя
                </button>
              ) : null}
            </div>
            {line.report.shared.map((s) => (
              <p key={s.alias} className="mt-1 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />«{s.alias}» есть и у: {s.people.join(", ")} — ИИ спросит, кого
              </p>
            ))}
            {!line.editable ? <p className="mt-1 text-[12px] leading-4 text-muted">Имена директора меняет только директор</p> : null}
            {adding === line.person.id ? (
              <AddField
                line={line}
                people={roster}
                onAdded={(entries) => onAdded(line.person.id, entries)}
                onDone={() => {
                  setAdding(null);
                  grid.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
                }}
              />
            ) : null}
          </div>
        );
      },
    },
    {
      key: "offer",
      title: "Стоит добавить",
      width: "260px",
      sort: (a, b) => a.report.suggestions.length - b.report.suggestions.length,
      render: (line) =>
        line.editable && line.report.suggestions.length ? (
          <div className="flex flex-wrap gap-1">
            {line.report.suggestions.map((suggestion) => (
              <OfferPill key={suggestion} label={suggestion} disabled={line.person.aliases.length >= ALIAS_MAX} onTake={() => take(line, [suggestion])} />
            ))}
          </div>
        ) : (
          <span className="text-muted/50">—</span>
        ),
    },
  ];

  return (
    <div
      ref={grid}
      onContextMenu={(event) => {
        const row = (event.target as Element).closest<HTMLElement>("[data-row-key]");
        const line = row ? shown.find((item) => item.person.id === row.dataset.rowKey) : undefined;
        if (!line) return;
        setSelected(line.person.id);
        menu.open(event, itemsOf(line));
      }}
    >
      <DataGrid
        aria-label="Имена людей"
        columns={columns}
        rows={shown}
        rowKey={(line) => line.person.id}
        selectedKey={selected}
        onSelect={(line) => setSelected(line.person.id)}
        onActivate={open}
        onKey={(event, line) => {
          if (!line) return false;
          // A — take the offered forms of the chosen person
          if (event.code === "KeyA" && !event.ctrlKey && !event.metaKey && line.editable && line.report.suggestions.length) {
            event.preventDefault();
            take(line, line.report.suggestions);
            return true;
          }
          return false;
        }}
        empty={
          <EmptyState
            title={q ? "Никого с таким именем" : filter === "all" ? "Здесь пока никого" : "Таких нет"}
            hint={q ? "Поиск идёт по имени, должности и коротким именам" : filter === "all" ? "Люди появятся, когда их добавят в «Команде»" : "Снимите фильтр — покажу всех"}
          />
        }
      />
      {menu.node}
    </div>
  );
}
