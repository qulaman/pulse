"use client";

import { CircleCheck, CircleHelp, CircleSlash, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { NamesTable, type NamesFilter } from "@/components/desk/settings/dictionary/NamesTable";
import { Strip, type GuideStep } from "@/components/desk/settings/dictionary/parts";
import { Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { HINT_MAX_PEOPLE } from "@/lib/ai/hint-roster";
import type { MatchingConfig } from "@/lib/ai/config";
import { byRussian, checkName, ownersOf, planAliases, type RosterPerson } from "@/lib/dictionary";
import type { Misheard } from "@/lib/dictionary-learn";
import { useDismissMisheard, useEditAliases, useMisheard, useWaitingEdits } from "@/lib/dictionary-queries";
import { whenLine } from "@/lib/dictionary-usage";
import { canEditPerson, type Who } from "@/lib/people/access";
import { initialAlias } from "@/lib/people/aliases";
import type { Person } from "@/lib/people/queries";
import { firstNameOf } from "@/lib/text/normalize";
import { pluralRu } from "@/lib/tasks/status-text";

export const NAMES_STEPS: GuideStep[] = [
  { title: "Как вы зовёте человека вслух", body: "Полное имя ИИ знает из карточки. Сюда — короткие формы: имя, имя с инициалом, прозвище, должность.", examples: ["Ерлан", "Ерлан Б.", "Жаке", "главбух"] },
  { title: "Падежи не нужны", body: "«Ерлану», «с Ерланом» ИИ разберёт сам — пишите, как отвечают на вопрос «кто?»." },
  { title: "Тёзкам — инициал", body: "Два Ерлана: «Ерлан Б.» — задача уйдёт точно, просто «Ерлан» — ИИ переспросит. Инициал приложение предлагает само." },
  { title: "Одно прозвище — одному", body: "Если «Саша» у двоих, на «Саша» ИИ каждый раз спросит, кого. Такие совпадения отмечены в таблице." },
];

/**
 * «Проверить имя» on the desk (D-111): the spoken form in, what the name matcher makes of it out —
 * the pipeline's `matchName` with the company's thresholds. A form an alias would settle goes to a
 * person right here: the likely one is chosen in the list, «Запомнить» gives it.
 */
function NameCheckBlock({ people, matching, lockedIds, onAdded }: { people: RosterPerson[]; matching?: Partial<MatchingConfig>; lockedIds: ReadonlySet<string>; onAdded: (id: string, entries: string[]) => void }) {
  const edit = useEditAliases();
  const [spoken, setSpoken] = useState("");
  const [to, setTo] = useState("");
  const result = checkName(spoken, people, matching);
  const form = spoken.replace(/\s+/g, " ").trim();
  const namesakes = result?.kind === "ask" && new Set(result.people.map((p) => firstNameOf(p).toLowerCase())).size === 1;
  const sharedForm = result?.kind === "ask" && ownersOf(form, people).length > 1;
  const likely = result?.kind === "check" ? result.person : result?.kind === "ask" ? result.people[0] : null;
  const choices = people.filter((p) => !lockedIds.has(p.id)).sort((a, b) => byRussian(a.full_name, b.full_name));
  const target = to || choices.find((p) => p.full_name === likely)?.id || "";

  const give = () => {
    const person = people.find((p) => p.id === target);
    if (!person) return;
    const plan = planAliases(person, form, people);
    if (!plan.add.length) {
      toast(plan.fullName ? "Полное имя ИИ уже знает" : plan.existing.length ? "Это имя у человека уже есть" : "Так имя не добавить");
      return;
    }
    edit.mutate({ id: person.id, add: plan.add });
    onAdded(person.id, plan.add);
    toast(`«${plan.add[0]}» — теперь ${person.full_name}`);
    setSpoken("");
    setTo("");
  };

  return (
    <Strip title="Проверить имя" about="как говорите вслух, в любом падеже — что поймёт ИИ">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="dict-check-field relative flex items-center">
        <Search size={15} strokeWidth={2} aria-hidden className="dict-check-icon pointer-events-none absolute left-3 hidden text-muted" />
        <input
          type="search"
          value={spoken}
          onChange={(event) => {
            setSpoken(event.target.value);
            setTo("");
          }}
          placeholder="Имя, как в речи"
          aria-label="Имя, как в речи"
          className="field h-9 w-[240px] text-[14px] leading-5 outline-none"
        />
      </label>
      {result ? (
        <div role="status" className="dict-verdict flex min-w-0 flex-1 items-center gap-2" data-kind={result.kind}>
          <span aria-hidden className="dict-verdict-icon hidden">
            {result.kind === "sure" ? <CircleCheck size={16} strokeWidth={2.25} /> : result.kind === "none" ? <CircleSlash size={16} strokeWidth={2.25} /> : <CircleHelp size={16} strokeWidth={2.25} />}
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-[18px]">
            {result.kind === "sure" ? (
              <>
                <b className="font-semibold">{result.person}</b> — узнает сразу
              </>
            ) : result.kind === "check" ? (
              <>
                Похоже на <b className="font-semibold">{result.person}</b>, но попросит проверить.
              </>
            ) : result.kind === "ask" ? (
              <>
                Спросит, кого: {result.people.join(" или ")}.{" "}
                {namesakes && initialAlias(result.people[0] ?? "") ? (
                  <span className="text-muted">Говорите с инициалом: «{initialAlias(result.people[0] ?? "")}».</span>
                ) : sharedForm ? (
                  <span className="text-muted">Так зовут нескольких — уберите имя у тех, кого так не называете.</span>
                ) : null}
              </>
            ) : (
              <>По словарю не узнает — угадывать будет модель.</>
            )}
          </p>
        </div>
      ) : null}
      {result && result.kind !== "sure" && result.teach ? (
        <div className="flex items-center gap-2">
          <Select aria-label={`Кого вы зовёте «${form}»`} value={target} onChange={(event) => setTo(event.target.value)} className="dict-teach w-[220px] text-[13px]">
            <option value="" disabled>
              Кого так зовёте?
            </option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" disabled={!target} onClick={give}>
            Запомнить
          </Button>
        </div>
      ) : null}
      {!result ? <span className="text-[13px] leading-5 text-muted">Например, «Ерлану» или «Жаке»</span> : null}
      </div>
    </Strip>
  );
}

/** «Из ваших записей» (D-111): names the AI could not place and the person the director placed them on — «Запомнить» or ×. */
function MisheardBlock({ items, lockedIds, onAdded }: { items: Misheard[]; lockedIds: ReadonlySet<string>; onAdded: (id: string, entries: string[]) => void }) {
  const edit = useEditAliases();
  const dismiss = useDismissMisheard();
  const visible = items.filter((item) => !lockedIds.has(item.personId));
  if (!visible.length) return null;
  return (
    <Strip title="Из ваших записей" count={visible.length} about="ИИ не узнал эти имена, и вы выбрали человека сами — запомнить?" testId="dictionary-misheard">
      <ul className="dict-misheard desk-list grid grid-cols-2 gap-x-8">
        {visible.map((item) => (
          <li key={item.key} className="dict-misheard-item flex items-center gap-2 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-5">«{item.form}»</p>
              <p className="truncate text-[12px] leading-4 text-muted">
                → {item.fullName} · {item.times > 1 ? `${item.times} ${pluralRu(item.times, ["раз", "раза", "раз"])}, ` : ""}
                {whenLine(item.lastAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                edit.mutate({ id: item.personId, add: [item.form] });
                onAdded(item.personId, [item.form]);
                toast(`Запомнил: «${item.form}» — ${item.fullName}`);
              }}
            >
              Запомнить
            </Button>
            <button
              type="button"
              aria-label={`Не запоминать «${item.form}»`}
              title="Не запоминать"
              onClick={() => dismiss.mutate([item.key])}
              className="dict-x flex h-6 w-6 shrink-0 items-center justify-center text-muted hover:bg-surface-2 hover:text-text"
            >
              <X size={14} strokeWidth={2.25} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Strip>
  );
}

/**
 * «Имена» on the desk (D-111): the people as a table at the full width, and what helps — the
 * check of a spoken form and the lessons of the director's own recordings, above the table they feed.
 */
export function NamesTab({ people, me, matching, query, filter }: { people: Person[]; me: Who; matching?: Partial<MatchingConfig>; query: string; filter: NamesFilter }) {
  const misheard = useMisheard();
  const waiting = useWaitingEdits();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const roster = useMemo<RosterPerson[]>(() => people.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })), [people]);
  const canEdit = useMemo(() => (person: Person) => canEditPerson(me, { id: person.id, role: person.role }), [me]);
  const locked = useMemo(() => new Set(people.filter((p) => !canEdit(p)).map((p) => p.id)), [people, canEdit]);
  const markFresh = (id: string, entries: string[]) => setFresh((seen) => new Set([...seen, ...entries.map((entry) => `${id}:${entry}`)]));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NameCheckBlock people={roster} matching={matching} lockedIds={locked} onAdded={markFresh} />
      <MisheardBlock items={misheard.data ?? []} lockedIds={locked} onAdded={markFresh} />
      <div className="flex min-w-0 flex-col gap-2">
        <NamesTable people={people} canEdit={canEdit} query={query} filter={filter} fresh={fresh} waiting={waiting.aliases} onAdded={markFresh} />
        <p className="dict-foot text-[12px] leading-4 text-muted">
          {people.length} {pluralRu(people.length, ["человек", "человека", "человек"])} · уволенных и экранов здесь нет
          {people.length > HINT_MAX_PEOPLE ? `. Распознаванию подсказываются ${HINT_MAX_PEOPLE}, кому вы чаще ставите задачи; остальных узнаёт разбор поручений` : ""}
        </p>
      </div>
    </div>
  );
}
