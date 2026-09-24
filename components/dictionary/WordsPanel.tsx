"use client";

import { useMemo, useState } from "react";

import { CleanupSheet } from "@/components/dictionary/CleanupSheet";
import { EntryInput } from "@/components/dictionary/EntryInput";
import { Guide, type GuideStep } from "@/components/dictionary/Guide";
import { ImportSheet } from "@/components/dictionary/ImportSheet";
import { KindPicker } from "@/components/dictionary/KindPicker";
import { SearchField } from "@/components/dictionary/SearchField";
import { SpellingSheet } from "@/components/dictionary/SpellingSheet";
import { WordSheet } from "@/components/dictionary/WordSheet";
import { STALE_DAYS, timesLine, wordFacts, type WordFact } from "@/components/dictionary/word-facts";
import { toast } from "@/components/ui/Toast";
import {
  VOCABULARY_SOFT_MAX,
  WORD_KINDS,
  WORD_KIND_GROUP,
  byRussian,
  entryKey,
  planWords,
  splitEntries,
  type RosterPerson,
  type WordKind,
  type WordMeta,
} from "@/lib/dictionary";
import { useDismissWords, useEditVocabulary, useWaitingEdits, useWordStats } from "@/lib/dictionary-queries";
import { whenLine, type WordSuggestion } from "@/lib/dictionary-usage";
import { pluralRu } from "@/lib/tasks/status-text";

const STEPS: GuideStep[] = [
  {
    title: "Что сюда",
    body: "Названия, которые распознавание речи пишет с ошибками: контрагенты, объекты, марки, аббревиатуры, казахские названия.",
    examples: ["КазАзот", "ERG", "Актобе-склад", "1С"],
  },
  {
    title: "Пишите так, как должно быть в задаче",
    body: "Список уходит распознаванию подсказкой перед каждой записью: «КазАзот» вместо «каз азот». Тип — для порядка в списке, распознаванию он не нужен.",
  },
  {
    title: "Чего не нужно",
    body: "Обычных слов, падежей и имён сотрудников — имена ведутся во вкладке «Имена». Похожее на то, что уже есть, поле подсветит.",
  },
  {
    title: "Чем короче, тем точнее",
    body: `До ${VOCABULARY_SOFT_MAX} названий — хорошо. Длинный список распознавание начинает вставлять туда, где его не говорили. Слова, которые месяц никто не произносил, словарь предложит убрать.`,
  },
  {
    title: "Список — одним разом",
    body: "Вставьте столбец из таблицы или перечислите через запятую — перед добавлением покажу каждую строку, лишнее снимете. Работает со следующей записи.",
  },
];

type Sort = "often" | "abc" | "new";
const SORTS: { key: Sort; label: string }[] = [
  { key: "often", label: "Часто" },
  { key: "abc", label: "А–Я" },
  { key: "new", label: "Новые" },
];
const GROUP_ORDER: (WordKind | "none")[] = [...WORD_KINDS, "none"];

const KIND_STORE = "pulse:dictionary-kind";
const SORT_STORE = "pulse:dictionary-sort";

/** A per-browser convenience: the kind of the last added word, the chosen order. Never state that matters. */
function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage off: the choice lives until the page closes
  }
}

function words(n: number): string {
  return `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;
}

function sortFacts(facts: WordFact[], sort: Sort): WordFact[] {
  return [...facts].sort((a, b) => {
    if (sort === "often") {
      const diff = (b.usage?.count ?? 0) - (a.usage?.count ?? 0);
      if (diff) return diff;
    }
    if (sort === "new") {
      const at = (f: WordFact) => f.meta?.added_at ?? "";
      if (at(a) !== at(b)) return at(a) < at(b) ? 1 : -1;
    }
    return byRussian(a.word, b.word);
  });
}

/**
 * «Слова» (D-111, words wave): the counterparties and sites the STT prompt spells for the
 * recogniser (`settings.vocabulary`, docs/AI.md §1) as a managed list, not a cloud of chips.
 * On top — the budget (the list's length is the prompt's length) and one field: a word is
 * added with its kind, a look-alike of a word already there is caught before it lands, a
 * pasted list opens a preview. Then the names the speech keeps using that the list lacks.
 * The list itself is grouped by kind, each row says how often the word came up this month;
 * a tap opens the word — spelling, kind, history, delete. Unused words are offered for
 * removal in one go.
 */
export function WordsPanel({
  vocabulary,
  meta,
  people,
}: {
  vocabulary: string[];
  meta: Record<string, WordMeta>;
  people: RosterPerson[];
}) {
  const edit = useEditVocabulary();
  const stats = useWordStats();
  const dismiss = useDismissWords();
  const waiting = useWaitingEdits();

  const [text, setText] = useState("");
  const [kind, setKindState] = useState<WordKind | null>(() => remembered(KIND_STORE, WORD_KINDS, "counterparty"));
  const [sort, setSortState] = useState<Sort>(() => remembered(SORT_STORE, ["often", "abc", "new"] as const, "often"));
  const [query, setQuery] = useState("");
  const [importText, setImportText] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState(false);
  const [spelling, setSpelling] = useState<WordSuggestion | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const setKind = (value: WordKind | null) => {
    setKindState(value);
    remember(KIND_STORE, value);
  };
  const setSort = (value: Sort) => {
    setSortState(value);
    remember(SORT_STORE, value);
  };

  const facts = useMemo(() => wordFacts(vocabulary, meta, stats.data), [vocabulary, meta, stats.data]);
  const stale = facts.filter((f) => f.stale);
  const open = facts.find((f) => f.key === openKey) ?? null;
  const keys = useMemo(() => new Set(vocabulary.map(entryKey)), [vocabulary]);

  const entries = splitEntries(text);
  const plan = planWords(vocabulary, text, people);
  const single = entries.length === 1;

  const add = (list: string[], as: WordKind | null) => {
    if (!list.length) return;
    edit.mutate({ add: list, kind: as });
    setFresh((seen) => new Set([...seen, ...list.map(entryKey)]));
    toast(list.length === 1 ? `Добавил «${list[0]}»` : `Добавил ${words(list.length)}`);
  };

  const submit = () => {
    if (entries.length > 1) {
      setImportText(text);
      return;
    }
    if (!plan.add.length) return;
    add(plan.add, kind);
    setText("");
  };

  const remove = (list: WordFact[]) => {
    if (!list.length) return;
    edit.mutate({ remove: list.map((f) => f.word) });
    toast(list.length === 1 ? `Убрал «${list[0].word}»` : `Убрал ${words(list.length)}`, {
      lifetimeMs: 6000,
      action: {
        label: "Вернуть",
        onClick: () => {
          // back with their kinds: one call per kind
          const byKind = new Map<WordKind | null, string[]>();
          for (const f of list) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f.word]);
          for (const [k, group] of byKind) edit.mutate({ add: group, kind: k });
        },
      },
    });
  };

  const q = entryKey(query);
  const visible = q ? facts.filter((f) => f.key.includes(q)) : facts;
  const groups = GROUP_ORDER.map((group) => ({
    group,
    facts: sortFacts(
      visible.filter((f) => (f.kind ?? "none") === group),
      sort,
    ),
  })).filter((g) => g.facts.length);

  const suggestions = stats.data?.suggestions ?? [];
  const share = Math.min(1, vocabulary.length / VOCABULARY_SOFT_MAX);
  const long = vocabulary.length > VOCABULARY_SOFT_MAX;

  return (
    <div className="flex flex-col gap-2">
      <Guide id="words" steps={STEPS} />

      <section className="card px-4 py-4" data-testid="words-add">
        {/* the budget: the list's length is the STT prompt's length (D-53, D-55) */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Добавить слово</h2>
          <span className={`nums text-[13px] leading-4 ${long ? "text-warn" : "text-muted"}`} data-testid="words-budget">
            {vocabulary.length} из {VOCABULARY_SOFT_MAX}
          </span>
        </div>
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(share * 100, vocabulary.length ? 3 : 0)}%`, background: long ? "var(--warn)" : "var(--accent)" }}
          />
        </div>
        {long ? (
          <p className="mt-1.5 text-[12px] leading-4 text-warn">Больше {VOCABULARY_SOFT_MAX} — распознавание начинает ошибаться чаще</p>
        ) : null}

        <div className="mt-3">
          <EntryInput
            value={text}
            onChange={setText}
            onSubmit={submit}
            canSubmit={entries.length > 1 || plan.add.length > 0}
            label="Новое слово или список"
            placeholder="Название или список"
            onPasteText={(pasted) => {
              if (splitEntries(pasted).length < 2) return false;
              setImportText(pasted);
              return true;
            }}
          />
        </div>
        <div className="mt-3">
          <KindPicker value={kind} onChange={setKind} />
        </div>

        {/* what the field will do, said before Enter */}
        <div className="mt-2 min-h-[18px] text-[13px] leading-[18px]">
          {entries.length > 1 ? (
            <p className="text-muted">
              {entries.length} {pluralRu(entries.length, ["строка", "строки", "строк"])} — Enter покажет каждую перед добавлением
            </p>
          ) : single && plan.similar.length ? (
            <p className="text-warn">
              Похоже на «{plan.similar[0].to}» — это оно?{" "}
              <button
                type="button"
                className="font-semibold text-accent"
                onClick={() => {
                  add([plan.similar[0].entry], kind);
                  setText("");
                }}
              >
                Нет, добавить новое
              </button>
            </p>
          ) : single && plan.existing.length ? (
            <p className="text-muted">
              Уже есть в словаре.{" "}
              <button type="button" className="font-semibold text-accent" onClick={() => setOpenKey(entryKey(plan.existing[0]))}>
                Открыть
              </button>
            </p>
          ) : single && plan.names.length ? (
            <p className="text-warn">
              «{plan.names[0].entry}» — это {plan.names[0].person}: имена ведутся во вкладке «Имена»
            </p>
          ) : single && plan.tooLong.length ? (
            <p className="text-warn">Слишком длинно — до 60 знаков</p>
          ) : single && plan.overflow.length ? (
            <p className="text-warn">Словарь полон — сначала уберите лишнее</p>
          ) : (
            <p className="text-muted">Enter — добавить. Вставите список — покажу его перед добавлением</p>
          )}
        </div>
      </section>

      {suggestions.length ? (
        <section className="card-in card px-4 py-4" data-testid="words-suggest">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Часто встречается</h2>
            <span className="nums text-[13px] leading-4 text-muted">{suggestions.length}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
            Эти названия звучат в ваших записях, но их нет в словаре — добавьте, если распознавание их путает
          </p>
          <ul className="mt-2 flex flex-col">
            {suggestions.map((s) => (
              <li key={s.key} className="flex min-h-[56px] items-center gap-2 border-t border-border/70 py-2 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-5">{s.word}</p>
                  <p className="text-[13px] leading-[18px] text-muted">
                    {timesLine(s.count)} · {whenLine(s.lastAt)}
                  </p>
                  {s.variants.length ? (
                    <p className="text-[13px] leading-[18px] text-warn">пишется по-разному: {s.variants.join(", ")}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  // written two ways: which one is right only the director knows
                  onClick={() => (s.variants.length ? setSpelling(s) : add([s.word], kind))}
                  className="min-h-[36px] shrink-0 rounded-[10px] px-3 font-display text-[14px] font-semibold text-accent transition-transform duration-[120ms] active:scale-[0.96]"
                  style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
                >
                  {s.variants.length ? "Выбрать" : "Добавить"}
                </button>
                <button
                  type="button"
                  aria-label={`Не предлагать «${s.word}»`}
                  onClick={() => dismiss.mutate(s.keys)}
                  className="relative flex h-9 w-9 shrink-0 items-center justify-center text-[18px] leading-none text-muted after:absolute after:-inset-1 after:content-['']"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vocabulary.length === 0 ? (
        <div className="mt-2 card px-4 py-6 text-center">
          <p className="text-[16px] leading-[22px]">Словарь пуст</p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            Начните с главных контрагентов и объектов — тех, что чаще всего звучат в поручениях
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 px-1">
            <h2 className="eyebrow">В словаре · {vocabulary.length}</h2>
            <div role="radiogroup" aria-label="Порядок" className="flex gap-1">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={sort === s.key}
                  onClick={() => setSort(s.key)}
                  className={`min-h-[32px] rounded-[9px] px-2 font-display text-[13px] font-semibold leading-4 transition-colors duration-[120ms] ${
                    sort === s.key ? "bg-surface-2 text-text" : "text-muted active:text-text"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {vocabulary.length > 8 ? <SearchField value={query} onChange={setQuery} placeholder="Найти слово" label="Поиск по словарю" /> : null}

          {groups.length === 0 ? (
            <p className="card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">Такого слова нет</p>
          ) : (
            groups.map(({ group, facts: list }) => (
              <section key={group} className="mt-2" data-testid={`words-group-${group}`}>
                <h3 className="eyebrow px-1">
                  {WORD_KIND_GROUP[group]} · {list.length}
                </h3>
                <ul className="card mt-1.5 overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
                  {list.map((f) => (
                    <li key={f.key}>
                      <button
                        type="button"
                        data-testid="word-row"
                        onClick={() => setOpenKey(f.key)}
                        className="relative flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-[120ms] active:bg-surface-2"
                      >
                        {fresh.has(f.key) ? (
                          <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: "var(--accent)" }} />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-1.5 text-[16px] leading-[22px] ${f.stale ? "text-muted" : ""}`}>
                            {waiting.words.has(f.key) ? (
                              <svg width="13" height="13" viewBox="0 0 16 16" aria-label="ждёт связи" className="shrink-0 text-muted">
                                <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                                <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              </svg>
                            ) : null}
                            <span className="truncate">{f.word}</span>
                          </span>
                          {f.line || waiting.words.has(f.key) ? (
                            <span className="block truncate text-[13px] leading-[18px] text-muted">
                              {waiting.words.has(f.key) ? "ждёт связи — сохранится само" : f.line}
                            </span>
                          ) : null}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="-mr-0.5 shrink-0 text-muted">
                          <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {stale.length ? (
            <button
              type="button"
              onClick={() => setCleanup(true)}
              data-testid="words-cleanup"
              className="mt-2 flex min-h-[48px] items-center justify-between gap-3 rounded-[14px] border border-dashed border-border px-4 text-left text-[14px] leading-5 active:bg-surface-2"
            >
              <span>
                {words(stale.length)} не {pluralRu(stale.length, ["встречалось", "встречались", "встречались"])} {STALE_DAYS} дней
              </span>
              <span className="shrink-0 font-display font-semibold text-accent">Посмотреть</span>
            </button>
          ) : null}
        </>
      )}

      <ImportSheet
        text={importText}
        vocabulary={vocabulary}
        people={people}
        kind={kind}
        onClose={() => setImportText(null)}
        onAdd={(list, as) => {
          add(list, as);
          if (as !== kind) setKind(as);
          setImportText(null);
          setText("");
        }}
      />
      <WordSheet
        fact={open}
        days={stats.data?.days ?? 30}
        taken={keys}
        onClose={() => setOpenKey(null)}
        onRename={(from, to) => {
          edit.mutate({ rename: { from, to } });
          setFresh((seen) => new Set([...seen, entryKey(to)]));
          setOpenKey(null);
          toast(`Исправил: «${to}»`);
        }}
        onKind={(word, value) => edit.mutate({ set_kind: { word, kind: value } })}
        onRemove={(fact) => {
          setOpenKey(null);
          remove([fact]);
        }}
      />
      <SpellingSheet
        suggestion={spelling}
        kind={kind}
        taken={keys}
        onClose={() => setSpelling(null)}
        onAdd={(word, as, suggestion) => {
          setSpelling(null);
          add([word], as);
          // the heard spellings are this word now: none of them is offered again
          dismiss.mutate(suggestion.keys);
        }}
      />
      <CleanupSheet
        facts={stale}
        open={cleanup}
        onClose={() => setCleanup(false)}
        onRemove={(list) => {
          setCleanup(false);
          remove(list);
        }}
      />
    </div>
  );
}
