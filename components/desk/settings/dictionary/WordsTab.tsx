"use client";

import { ChevronDown, Plus, Tags, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

import { OfferPill, Strip, type GuideStep } from "@/components/desk/settings/dictionary/parts";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { MenuButton, useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { Select } from "@/components/desk/ui/Toolbar";
import { CleanupSheet } from "@/components/dictionary/CleanupSheet";
import { ImportSheet } from "@/components/dictionary/ImportSheet";
import { SpellingSheet } from "@/components/dictionary/SpellingSheet";
import { TypesSheet } from "@/components/dictionary/TypesSheet";
import { STALE_DAYS, timesLine, wordFacts, type WordFact } from "@/components/dictionary/word-facts";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import {
  ENTRY_MAX_LENGTH,
  NO_KIND_LABEL,
  VOCABULARY_SOFT_MAX,
  byRussian,
  entryKey,
  kindLabel,
  planWords,
  splitEntries,
  type RosterPerson,
  type WordKind,
  type WordKindDef,
  type WordMeta,
} from "@/lib/dictionary";
import { useDismissWords, useEditVocabulary, useWaitingEdits, useWordStats } from "@/lib/dictionary-queries";
import { dayMonth, whenLine, type WordSuggestion } from "@/lib/dictionary-usage";
import { pluralRu } from "@/lib/tasks/status-text";

export const WORDS_STEPS: GuideStep[] = [
  {
    title: "Что сюда",
    body: "Названия, которые распознавание речи пишет с ошибками: контрагенты, объекты, марки, аббревиатуры, казахские названия.",
    examples: ["КазАзот", "ERG", "Актобе-склад", "1С"],
  },
  { title: "Как в задаче", body: "Список уходит распознаванию подсказкой перед каждой записью: «КазАзот» вместо «каз азот». Тип — для порядка, распознаванию он не нужен." },
  { title: "Чего не нужно", body: "Обычных слов, падежей и имён сотрудников — имена ведутся во вкладке «Имена»." },
  { title: "Чем короче, тем точнее", body: `До ${VOCABULARY_SOFT_MAX} названий — хорошо. Длинный список распознавание начинает вставлять туда, где его не говорили.` },
  { title: "Список — одним разом", body: "Вставьте столбец из таблицы или перечислите через запятую — перед добавлением покажу каждую строку." },
];

/** «Тип» of the toolbar: every type, one, «Без типа», or the words nobody said for a month. */
export type WordsFilter = "all" | "none" | "stale" | `kind:${string}`;

const KIND_STORE = "pulse:dictionary-kind";

const words = (n: number) => `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;

/** The add field's kind, remembered per browser — a convenience, never state that matters. */
function rememberedKind(kinds: readonly WordKindDef[]): WordKind | null {
  try {
    const value = window.localStorage.getItem(KIND_STORE);
    return value && kinds.some((k) => k.id === value) ? value : (kinds[0]?.id ?? null);
  } catch {
    return kinds[0]?.id ?? null;
  }
}

/** The spelling of a word, fixed in its own cell: Enter saves, Esc puts it back, leaving saves a good one. */
function RenameCell({ fact, taken, onRename, onDone }: { fact: WordFact; taken: ReadonlySet<string>; onRename: (to: string) => void; onDone: () => void }) {
  const [text, setText] = useState(fact.word);
  const next = text.replace(/\s+/g, " ").trim();
  const clash = next !== fact.word && entryKey(next) !== fact.key && taken.has(entryKey(next));
  const valid = next !== fact.word && entryKey(next).length > 0 && next.length <= ENTRY_MAX_LENGTH && !clash;
  const finish = (commit: boolean) => {
    if (commit && valid) onRename(next);
    onDone();
  };
  return (
    <div onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <input
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        value={text}
        maxLength={ENTRY_MAX_LENGTH + 10}
        aria-label={`Написание: ${fact.word}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
        className="field h-8 w-full px-2 text-[14px] leading-5 outline-none"
        style={clash ? { borderColor: "var(--warn)" } : undefined}
      />
      {clash ? <span className="mt-0.5 block text-[12px] leading-4 text-warn">«{next}» уже есть в словаре</span> : null}
    </div>
  );
}

/**
 * «Слова» on the desk (D-111): the field to add a word or a pasted list on top, with the list's
 * budget (its length is the STT prompt's length); the names the speech keeps using that the list
 * lacks; the vocabulary as a sortable table — the spelling
 * fixed in place (double click, Enter or F2), the type from a menu, how often it came up this month,
 * when and by whom it was added; Delete removes (with «Вернуть» in the toast). The words nobody said
 * for a month go in one step, the types are edited in their own dialog.
 */
export function WordsTab({
  vocabulary,
  meta,
  kinds,
  people,
  query,
  filter,
  addRef,
}: {
  vocabulary: string[];
  meta: Record<string, WordMeta>;
  kinds: WordKindDef[];
  people: RosterPerson[];
  query: string;
  filter: WordsFilter;
  addRef: RefObject<HTMLInputElement | null>;
}) {
  const edit = useEditVocabulary();
  const stats = useWordStats();
  const dismiss = useDismissWords();
  const waiting = useWaitingEdits();
  const menu = useContextMenu();

  const [text, setText] = useState("");
  const [kindState, setKindState] = useState<WordKind | null>(() => rememberedKind(kinds));
  const kind = kindState && kinds.some((k) => k.id === kindState) ? kindState : null;
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [spelling, setSpelling] = useState<WordSuggestion | null>(null);
  const [cleanup, setCleanup] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const grid = useRef<HTMLDivElement>(null);

  const setKind = (value: WordKind | null) => {
    setKindState(value);
    try {
      if (value) window.localStorage.setItem(KIND_STORE, value);
    } catch {
      // storage off: the choice lives until the page closes
    }
  };

  const facts = useMemo(() => wordFacts(vocabulary, meta, stats.data, kinds), [vocabulary, meta, stats.data, kinds]);
  const keys = useMemo(() => new Set(vocabulary.map(entryKey)), [vocabulary]);
  const perKind = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of facts) if (f.kind) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    return counts;
  }, [facts]);
  const stale = facts.filter((f) => f.stale);

  const q = entryKey(query);
  const shown = facts
    .filter((f) => !q || f.key.includes(q))
    .filter((f) => (filter === "all" ? true : filter === "none" ? f.kind === null : filter === "stale" ? f.stale : f.kind === filter.slice(5)))
    .sort((a, b) => (b.usage?.count ?? 0) - (a.usage?.count ?? 0) || byRussian(a.word, b.word));

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
  const rename = (fact: WordFact, to: string) => {
    edit.mutate({ rename: { from: fact.word, to } });
    setFresh((seen) => new Set([...seen, entryKey(to)]));
    setSelected(entryKey(to));
    toast(`Исправил: «${to}»`);
  };
  const backToGrid = () => grid.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });

  const kindItems = (fact: WordFact): MenuItem[] => [
    ...kinds.map((k) => ({
      key: `kind-${k.id}`,
      label: `${fact.kind === k.id ? "✓ " : ""}${k.label}`,
      onSelect: () => edit.mutate({ set_kind: { word: fact.word, kind: k.id } }),
    })),
    { key: "kind-none", label: `${fact.kind === null ? "✓ " : ""}${NO_KIND_LABEL}`, onSelect: () => edit.mutate({ set_kind: { word: fact.word, kind: null } }) },
  ];
  const rowItems = (fact: WordFact): MenuItem[] => [
    { key: "rename", label: "Исправить написание", hint: "F2", onSelect: () => setRenaming(fact.key) },
    {
      key: "copy",
      label: "Скопировать",
      onSelect: () => {
        void navigator.clipboard?.writeText(fact.word).then(() => toast("Скопировал"));
      },
    },
    "separator",
    ...kindItems(fact),
    "separator",
    { key: "remove", label: "Удалить", hint: "Del", danger: true, onSelect: () => remove([fact]) },
  ];

  const columns: Column<WordFact>[] = [
    {
      key: "word",
      title: "Слово",
      sort: (a, b) => byRussian(a.word, b.word),
      render: (fact) =>
        renaming === fact.key ? (
          <RenameCell
            fact={fact}
            taken={keys}
            onRename={(to) => rename(fact, to)}
            onDone={() => {
              setRenaming(null);
              backToGrid();
            }}
          />
        ) : (
          <span className={`dict-word relative flex items-center gap-1.5 ${fresh.has(fact.key) ? "text-accent" : fact.stale ? "text-muted" : ""}`} data-fresh={fresh.has(fact.key) ? "" : undefined}>
            {waiting.words.has(fact.key) ? <span className="text-[12px] text-muted">ждёт связи ·</span> : null}
            <span className="truncate font-medium" title={fact.word}>
              {fact.word}
            </span>
          </span>
        ),
    },
    {
      key: "kind",
      title: "Тип",
      width: "170px",
      sort: (a, b) => byRussian(kindLabel(kinds, a.kind), kindLabel(kinds, b.kind)),
      render: (fact) => (
        <MenuButton
          label={`Тип: ${fact.word}`}
          items={kindItems(fact)}
          align="start"
          width={200}
          className="dict-kind inline-flex h-6 items-center gap-1 text-[13px] text-muted transition-colors duration-[120ms] hover:text-text"
        >
          {kindLabel(kinds, fact.kind)}
          <ChevronDown size={12} strokeWidth={2.25} aria-hidden />
        </MenuButton>
      ),
    },
    {
      key: "heard",
      title: `В речи за ${stats.data?.days ?? 30} дн.`,
      width: "190px",
      align: "right",
      sort: (a, b) => (a.usage?.count ?? 0) - (b.usage?.count ?? 0),
      render: (fact) =>
        !fact.usage ? (
          <span className="text-muted/60">…</span>
        ) : fact.usage.count > 0 && fact.usage.lastAt ? (
          <span className="dict-heard inline-flex items-center justify-end gap-2 whitespace-nowrap">
            <span aria-hidden className="dict-heard-bar" style={{ "--share": Math.max(0.08, fact.usage.count / heardMax) } as CSSProperties} />
            <span>
              <span className="nums">{timesLine(fact.usage.count)}</span> <span className="text-muted">· {whenLine(fact.usage.lastAt)}</span>
            </span>
          </span>
        ) : (
          <span className="text-muted">{fact.stale ? `не было ${STALE_DAYS} дней` : "пока не было"}</span>
        ),
    },
    {
      key: "added",
      title: "Добавлено",
      width: "190px",
      sort: (a, b) => (a.meta?.added_at ?? "").localeCompare(b.meta?.added_at ?? ""),
      render: (fact) =>
        fact.meta?.added_at ? (
          <span className="truncate text-muted" title={fact.meta.added_by ?? undefined}>
            {dayMonth(fact.meta.added_at)}
            {fact.meta.added_by ? ` · ${fact.meta.added_by}` : ""}
          </span>
        ) : (
          <span className="text-muted/60">—</span>
        ),
    },
  ];

  const suggestions = stats.data?.suggestions ?? [];
  const heardMax = Math.max(1, ...facts.map((f) => f.usage?.count ?? 0));
  const share = Math.min(1, vocabulary.length / VOCABULARY_SOFT_MAX);
  const long = vocabulary.length > VOCABULARY_SOFT_MAX;

  return (
    <div className="flex min-w-0 flex-col gap-4">
        {/* the field: a word with its type, or a pasted list — and what Enter will do, said before it */}
        <section className="dict-addbar desk-fields" data-testid="words-add">
          <div className="flex items-center gap-2">
            <input
              ref={addRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (splitEntries(pasted).length < 2) return;
                event.preventDefault();
                setImportText(pasted);
              }}
              placeholder="Новое слово или список через запятую"
              aria-label="Новое слово или список"
              className="dict-addbar-field field h-9 min-w-0 flex-1 text-[14px] leading-5 outline-none"
            />
            <Select aria-label="Тип нового слова" value={kind ?? ""} onChange={(event) => setKind(event.target.value || null)} className="w-[170px]">
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
              <option value="">{NO_KIND_LABEL}</option>
            </Select>
            <Button size="sm" disabled={!(entries.length > 1 || plan.add.length > 0)} onClick={submit} icon={<Plus size={15} strokeWidth={2.5} />}>
              Добавить
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-4">
            <p className="min-w-0 flex-1 text-[13px] leading-[18px]">
              {entries.length > 1 ? (
                <span className="text-muted">
                  {entries.length} {pluralRu(entries.length, ["строка", "строки", "строк"])} — Enter покажет каждую перед добавлением
                </span>
              ) : single && plan.similar.length ? (
                <span className="text-warn">
                  Похоже на «{plan.similar[0].to}» — это оно?{" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => {
                      add([plan.similar[0].entry], kind);
                      setText("");
                    }}
                  >
                    Нет, добавить новое
                  </button>
                </span>
              ) : single && plan.existing.length ? (
                <span className="text-muted">
                  Уже есть в словаре.{" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => {
                      setSelected(entryKey(plan.existing[0]));
                      setText("");
                      backToGrid();
                    }}
                  >
                    Показать
                  </button>
                </span>
              ) : single && plan.names.length ? (
                <span className="text-warn">«{plan.names[0].entry}» — это {plan.names[0].person}: имена ведутся во вкладке «Имена»</span>
              ) : single && plan.tooLong.length ? (
                <span className="text-warn">Слишком длинно — до 60 знаков</span>
              ) : single && plan.overflow.length ? (
                <span className="text-warn">Словарь полон — сначала уберите лишнее</span>
              ) : (
                <span className="flex items-center gap-1 text-muted">
                  <Kbd>N</Kbd> сюда · Enter — добавить · вставленный список покажу перед добавлением
                </span>
              )}
            </p>
            {/* the budget: the list's length is the STT prompt's length (D-53, D-55) */}
            <span className="dict-budget flex shrink-0 items-center gap-2" data-testid="words-budget" data-long={long ? "" : undefined} title={long ? `Больше ${VOCABULARY_SOFT_MAX} — распознавание начинает ошибаться чаще` : undefined}>
              <span aria-hidden className="dict-budget-track h-1 w-24 overflow-hidden bg-surface-2">
                <span className="dict-budget-fill block h-full" style={{ width: `${Math.max(share * 100, vocabulary.length ? 3 : 0)}%`, background: long ? "var(--warn)" : "var(--text)" }} />
              </span>
              <span className={`nums text-[13px] leading-4 ${long ? "text-warn" : "text-muted"}`}>
                {vocabulary.length} из {VOCABULARY_SOFT_MAX}
              </span>
            </span>
          </div>
        </section>

        {suggestions.length ? (
          <Strip title="Часто встречается" count={suggestions.length} about="звучат в ваших записях, но их нет в словаре — добавьте, если распознавание их путает" testId="words-suggest">
            <ul className="dict-suggest flex flex-wrap gap-x-5 gap-y-1.5">
              {suggestions.map((s) => (
                <li key={s.key} className="dict-suggest-item flex items-center gap-2">
                  <span className="text-[14px] font-medium leading-5">{s.word}</span>
                  <span className="text-[12px] leading-4 text-muted">
                    {timesLine(s.count)} · {whenLine(s.lastAt)}
                    {s.variants.length ? <span className="text-warn"> · пишется по-разному</span> : null}
                  </span>
                  {/* written two ways: which one is right only the director knows */}
                  <OfferPill label={s.variants.length ? "Выбрать" : "Добавить"} onTake={() => (s.variants.length ? setSpelling(s) : add([s.word], kind))} />
                  <button
                    type="button"
                    aria-label={`Не предлагать «${s.word}»`}
                    title="Не предлагать"
                    onClick={() => dismiss.mutate(s.keys)}
                    className="dict-x -ml-1 flex h-6 w-6 shrink-0 items-center justify-center text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <X size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Strip>
        ) : null}

        <div className="dict-table-head -mb-3 flex items-center gap-2">
          <h2 className="dict-strip-title desk-label uppercase">В словаре</h2>
          <span className="nums text-[12px] leading-4 text-muted">{shown.length === facts.length ? facts.length : `${shown.length} из ${facts.length}`}</span>
          <span className="ml-auto flex items-center gap-1">
            {stale.length ? (
              <Button size="sm" variant="ghost" onClick={() => setCleanup(true)} data-testid="words-cleanup" title={`Никто не произносил ${STALE_DAYS} дней — подсказка распознаванию несёт их зря`} icon={<Trash2 size={14} strokeWidth={2} />}>
                Не встречались · {stale.length} — убрать…
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setTypesOpen(true)} icon={<Tags size={14} strokeWidth={2} />}>
              Типы слов…
            </Button>
          </span>
        </div>

        <div
          ref={grid}
          onContextMenu={(event) => {
            const row = (event.target as Element).closest<HTMLElement>("[data-row-key]");
            const fact = row ? shown.find((f) => f.key === row.dataset.rowKey) : undefined;
            if (!fact) return;
            setSelected(fact.key);
            menu.open(event, rowItems(fact));
          }}
        >
          <DataGrid
            aria-label="Слова словаря"
            className="dict-grid"
            columns={columns}
            rows={shown}
            rowKey={(fact) => fact.key}
            selectedKey={selected}
            onSelect={(fact) => setSelected(fact.key)}
            onActivate={(fact) => setRenaming(fact.key)}
            rowHighlightKey={[...fresh].at(-1) ?? null}
            onKey={(event, fact) => {
              if (!fact || event.ctrlKey || event.metaKey || event.altKey) return false;
              if (event.key === "F2") {
                event.preventDefault();
                setRenaming(fact.key);
                return true;
              }
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                const at = shown.indexOf(fact);
                remove([fact]);
                setSelected(shown[at + 1]?.key ?? shown[at - 1]?.key ?? null);
                return true;
              }
              return false;
            }}
            empty={
              vocabulary.length === 0 ? (
                <EmptyState title="Словарь пуст" hint="Начните с главных контрагентов и объектов — тех, что чаще всего звучат в поручениях" />
              ) : (
                <EmptyState title="Таких слов нет" hint="Снимите поиск или фильтр по типу" />
              )
            }
          />
        </div>
        {menu.node}


      <ImportSheet
        text={importText}
        vocabulary={vocabulary}
        people={people}
        kinds={kinds}
        kind={kind}
        onClose={() => setImportText(null)}
        onAdd={(list, as) => {
          add(list, as);
          if (as !== kind) setKind(as);
          setImportText(null);
          setText("");
        }}
      />
      <SpellingSheet
        suggestion={spelling}
        kinds={kinds}
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
      <TypesSheet open={typesOpen} onClose={() => setTypesOpen(false)} kinds={kinds} counts={perKind} />
      <CleanupSheet
        facts={stale}
        kinds={kinds}
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
