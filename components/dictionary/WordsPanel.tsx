"use client";

import { useMemo, useState } from "react";

import { EntryChip } from "@/components/dictionary/chips";
import { EntryInput } from "@/components/dictionary/EntryInput";
import { Guide, type GuideStep } from "@/components/dictionary/Guide";
import { SearchField } from "@/components/dictionary/SearchField";
import { toast } from "@/components/ui/Toast";
import {
  VOCABULARY_MAX,
  VOCABULARY_SOFT_MAX,
  byRussian,
  entryKey,
  planWords,
  type RosterPerson,
} from "@/lib/dictionary";
import { useEditVocabulary, useWaitingEdits } from "@/lib/dictionary-queries";
import { pluralRu } from "@/lib/tasks/status-text";

const STEPS: GuideStep[] = [
  {
    title: "Что сюда",
    body: "Названия, которые распознавание речи пишет с ошибками: контрагенты, объекты, марки, аббревиатуры, казахские названия.",
    examples: ["КазАзот", "ERG", "Актобе-склад", "1С"],
  },
  {
    title: "Пишите так, как должно быть в задаче",
    body: "Список уходит распознаванию подсказкой перед каждой записью: «КазАзот» вместо «каз азот».",
  },
  {
    title: "Чего не нужно",
    body: "Обычных слов, падежей и имён сотрудников — имена ведутся во вкладке «Имена».",
  },
  {
    title: "Чем короче, тем точнее",
    body: `До ${VOCABULARY_SOFT_MAX} названий — хорошо. Длинный список распознавание начинает вставлять туда, где его не говорили, а фраза почти из одних слов словаря принимается за эхо подсказки и не распознаётся.`,
  },
  {
    title: "Список — одним разом",
    body: "Вставьте столбец из таблицы или перечислите через запятую — каждое название станет отдельным словом. Работает со следующей записи.",
  },
];

function quoted(list: string[]): string {
  return list.map((s) => `«${s}»`).join(", ");
}

function words(n: number): string {
  return `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;
}

/**
 * «Слова» (D-111): the counterparties and sites the STT prompt spells for the recogniser
 * (`settings.vocabulary`, docs/AI.md §1). One field takes a word or a pasted list and
 * says before Enter what it will do with each; saved on the tap, a removed word comes
 * back from the toast.
 */
export function WordsPanel({ vocabulary, people }: { vocabulary: string[]; people: RosterPerson[] }) {
  const edit = useEditVocabulary();
  const waiting = useWaitingEdits();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const plan = planWords(vocabulary, text, people);

  const sorted = useMemo(() => [...vocabulary].sort(byRussian), [vocabulary]);
  const q = entryKey(query);
  const visible = q ? sorted.filter((word) => entryKey(word).includes(q)) : sorted;

  const submit = () => {
    if (!plan.add.length) return;
    edit.mutate({ add: plan.add });
    setFresh((seen) => new Set([...seen, ...plan.add.map(entryKey)]));
    toast(`Добавил ${plan.add.length === 1 ? `«${plan.add[0]}»` : words(plan.add.length)}`);
    setText("");
  };

  const remove = (word: string) => {
    edit.mutate({ remove: [word] });
    toast(`Убрал «${word}»`, { action: { label: "Вернуть", onClick: () => edit.mutate({ add: [word] }) }, lifetimeMs: 5000 });
  };

  const notes: { text: string; warn: boolean }[] = [];
  if (plan.add.length > 1) notes.push({ text: `Добавлю ${plan.add.length}: ${quoted(plan.add)}`, warn: false });
  if (plan.existing.length) notes.push({ text: `Уже есть: ${quoted(plan.existing)}`, warn: false });
  for (const n of plan.names) notes.push({ text: `«${n.entry}» — это ${n.person}: имена ведутся во вкладке «Имена»`, warn: true });
  if (plan.tooLong.length) notes.push({ text: `Слишком длинно, до 60 знаков: ${quoted(plan.tooLong)}`, warn: true });
  if (plan.overflow.length) notes.push({ text: `В словаре уже ${VOCABULARY_MAX} слов — сначала уберите лишние`, warn: true });

  const long = vocabulary.length > VOCABULARY_SOFT_MAX;

  return (
    <div className="flex flex-col gap-2">
      <Guide id="words" steps={STEPS} />

      <section className="card px-4 py-4">
        <h2 className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Добавить</h2>
        <div className="mt-3">
          <EntryInput
            value={text}
            onChange={setText}
            onSubmit={submit}
            canSubmit={plan.add.length > 0}
            label="Новое слово или список"
            placeholder="Название или список"
          />
        </div>
        {notes.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {notes.map((note) => (
              <li key={note.text} className={`text-[13px] leading-[18px] ${note.warn ? "text-warn" : "text-muted"}`}>
                {note.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-[18px] text-muted">Enter — добавить, Shift+Enter — новая строка</p>
        )}
      </section>

      <div className="mt-4 flex items-baseline justify-between gap-3 px-1">
        <h2 className="eyebrow">В словаре</h2>
        <span className={`nums text-[13px] leading-4 ${long ? "text-warn" : "text-muted"}`}>
          {vocabulary.length ? words(vocabulary.length) : "пусто"}
          {long ? ` · лучше до ${VOCABULARY_SOFT_MAX}` : ""}
        </span>
      </div>

      {vocabulary.length > 12 ? <SearchField value={query} onChange={setQuery} placeholder="Найти слово" label="Поиск по словарю" /> : null}

      {vocabulary.length === 0 ? (
        <div className="card px-4 py-6 text-center">
          <p className="text-[16px] leading-[22px]">Словарь пуст</p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            Начните с главных контрагентов и объектов — тех, что чаще всего звучат в поручениях
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">Такого слова нет</p>
      ) : (
        <div className="card flex flex-wrap gap-1.5 px-3 py-3">
          {visible.map((word) => (
            <EntryChip
              key={word}
              label={word}
              fresh={fresh.has(entryKey(word))}
              waiting={waiting.words.has(entryKey(word))}
              onRemove={() => remove(word)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
