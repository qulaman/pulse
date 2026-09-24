"use client";

import { useMemo, useState } from "react";

import { Guide, type GuideStep } from "@/components/dictionary/Guide";
import { Misheard } from "@/components/dictionary/Misheard";
import { NameCheck } from "@/components/dictionary/NameCheck";
import { PersonNames } from "@/components/dictionary/PersonNames";
import { SearchField } from "@/components/dictionary/SearchField";
import { Chip } from "@/components/ui/Chip";
import { HINT_MAX_PEOPLE } from "@/lib/ai/hint-roster";
import type { MatchingConfig } from "@/lib/ai/config";
import { byRussian, entryKey, nameReport, type RosterPerson } from "@/lib/dictionary";
import { useMisheard, useWaitingEdits } from "@/lib/dictionary-queries";
import { canEditPerson, type Who } from "@/lib/people/access";
import type { Person } from "@/lib/people/queries";
import { pluralRu } from "@/lib/tasks/status-text";

const STEPS: GuideStep[] = [
  {
    title: "Как вы зовёте человека вслух",
    body: "Полное имя ИИ уже знает из карточки. Сюда — короткие формы: имя, имя с инициалом, прозвище, обращение по должности.",
    examples: ["Ерлан", "Ерлан Б.", "Жаке", "главбух"],
  },
  {
    title: "Падежи не нужны",
    body: "«Ерлану», «Ерланға», «с Ерланом» ИИ разберёт сам — пишите, как отвечают на вопрос «кто?».",
  },
  {
    title: "Тёзкам — инициал фамилии",
    body: "Два Ерлана: скажете «Ерлан Б.» — задача уйдёт точно, просто «Ерлан» — ИИ переспросит, кого. Инициал приложение предлагает само.",
  },
  {
    title: "Одно прозвище — одному человеку",
    body: "Если «Саша» у двоих, на «Саша» ИИ будет каждый раз спрашивать, кого. Такие совпадения отмечены в карточках.",
  },
  {
    title: "Проверьте и пользуйтесь",
    body: "Впишите имя в «Проверить имя» — увидите, кого ИИ поймёт; незнакомое имя оттуда же отдаётся нужному человеку. Изменения работают со следующей записи.",
  },
];

type Filter = "all" | "suggest" | "shared";

function matches(person: Person, q: string): boolean {
  if (!q) return true;
  const hay = entryKey([person.full_name, person.position ?? "", ...person.aliases].join(" "));
  return q.split(" ").every((word) => hay.includes(word));
}

/**
 * «Имена» (D-111): how the director calls each person. Everybody the pipeline can hear —
 * active, not a kiosk — with their forms as chips, the forms the app would add on its
 * own, and the forms two people share. Filters take the director straight to what needs
 * a hand.
 */
export function NamesPanel({ people, me, matching }: { people: Person[]; me: Who | null; matching?: Partial<MatchingConfig> }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const roster: RosterPerson[] = useMemo(
    () => people.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })),
    [people],
  );
  const reports = useMemo(() => new Map(roster.map((p) => [p.id, nameReport(p, roster)])), [roster]);
  const editable = (p: Person) => (me ? canEditPerson(me, { id: p.id, role: p.role }) : false);
  const locked = people.filter((p) => !editable(p)).map((p) => p.id);
  const misheard = useMisheard();
  const waiting = useWaitingEdits();

  const suggestCount = people.filter((p) => editable(p) && reports.get(p.id)?.suggestions.length).length;
  const sharedCount = people.filter((p) => reports.get(p.id)?.shared.length).length;
  const active = filter === "suggest" && !suggestCount ? "all" : filter === "shared" && !sharedCount ? "all" : filter;

  const q = entryKey(query);
  const visible = people
    .filter((p) => matches(p, q))
    .filter((p) =>
      active === "suggest"
        ? editable(p) && !!reports.get(p.id)?.suggestions.length
        : active === "shared"
          ? !!reports.get(p.id)?.shared.length
          : true,
    )
    .sort((a, b) => byRussian(a.full_name, b.full_name));

  // a form added on this visit keeps an accent edge, so the eye finds where it landed
  const markFresh = (id: string, entries: string[]) =>
    setFresh((seen) => new Set([...seen, ...entries.map((entry) => `${id}:${entry}`)]));

  return (
    <div className="flex flex-col gap-2">
      {/* what the director's own recordings taught first: the work that is already waiting */}
      <Misheard items={misheard.data ?? []} lockedIds={new Set(locked)} onAdded={markFresh} />
      <Guide id="names" steps={STEPS} />
      <NameCheck people={roster} matching={matching} lockedIds={locked} onAdded={markFresh} />

      <div className="mt-4">
        <SearchField value={query} onChange={setQuery} placeholder="Имя, должность или как зовут" label="Поиск по людям" />
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip tone={active === "all" ? "accent" : "neutral"} onClick={() => setFilter("all")}>
            Все <span className="nums opacity-70">{people.length}</span>
          </Chip>
          {suggestCount ? (
            <Chip tone={active === "suggest" ? "accent" : "neutral"} onClick={() => setFilter(active === "suggest" ? "all" : "suggest")}>
              Можно дополнить <span className="nums opacity-70">{suggestCount}</span>
            </Chip>
          ) : null}
          {sharedCount ? (
            <Chip tone={active === "shared" ? "accent" : "neutral"} onClick={() => setFilter(active === "shared" ? "all" : "shared")}>
              Одно имя на двоих <span className="nums opacity-70">{sharedCount}</span>
            </Chip>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">
          {q ? "Никого с таким именем" : "Здесь пока никого"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <PersonNames
              key={p.id}
              person={{ id: p.id, full_name: p.full_name, aliases: p.aliases }}
              position={p.position}
              report={reports.get(p.id) ?? { suggestions: [], shared: [] }}
              people={roster}
              editable={editable(p)}
              fresh={fresh}
              waiting={waiting.aliases}
              onAdded={(entries) => markFresh(p.id, entries)}
            />
          ))}
        </ul>
      )}

      <p className="mt-2 px-1 text-[12px] leading-4 text-muted">
        {people.length} {pluralRu(people.length, ["человек", "человека", "человек"])} · уволенных и экранов здесь нет
        {people.length > HINT_MAX_PEOPLE
          ? `. Распознаванию подсказываются ${HINT_MAX_PEOPLE}, кому вы чаще ставите задачи; остальных узнаёт разбор поручений`
          : ""}
      </p>
    </div>
  );
}
