"use client";

import { useMemo, useState } from "react";

import { CleanupSheet } from "@/components/dictionary/CleanupSheet";
import { ImportSheet } from "@/components/dictionary/ImportSheet";
import { SpellingSheet } from "@/components/dictionary/SpellingSheet";
import { TypesSheet } from "@/components/dictionary/TypesSheet";
import { wordFacts, type WordFact } from "@/components/dictionary/word-facts";
import { toast } from "@/components/ui/Toast";
import { entryKey, planWords, splitEntries, type RosterPerson, type WordKind, type WordKindDef, type WordMeta } from "@/lib/dictionary";
import { useDismissWords, useEditVocabulary, useWordStats } from "@/lib/dictionary-queries";
import type { WordSuggestion } from "@/lib/dictionary-usage";
import { pluralRu } from "@/lib/tasks/status-text";

const KIND_STORE = "pulse:dictionary-kind";

/** «3 слова». */
export const wordsCount = (n: number) => `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;

/** The add field's kind, remembered per browser — a convenience, never state that matters. */
function rememberedKind(kinds: readonly WordKindDef[]): WordKind | null {
  try {
    const value = window.localStorage.getItem(KIND_STORE);
    return value && kinds.some((k) => k.id === value) ? value : (kinds[0]?.id ?? null);
  } catch {
    return kinds[0]?.id ?? null;
  }
}

function rememberKind(value: WordKind | null): void {
  try {
    if (value === null) window.localStorage.removeItem(KIND_STORE);
    else window.localStorage.setItem(KIND_STORE, value);
  } catch {
    // storage off: the choice lives until the page closes
  }
}

/**
 * The company's words being edited (D-111) — one engine for the phone's «Слова» and the desk's:
 * the add field and its kind, the facts of every word, adding, removing with «Вернуть», and the
 * sheets around them (a pasted list, a heard spelling, the types, the clean-up). Each screen lays
 * out its own list and renders `sheets`.
 */
export function useWordsEditor({ vocabulary, meta, kinds, people }: { vocabulary: string[]; meta: Record<string, WordMeta>; kinds: WordKindDef[]; people: RosterPerson[] }) {
  const edit = useEditVocabulary();
  const stats = useWordStats();
  const dismiss = useDismissWords();

  const [text, setText] = useState("");
  const [kindState, setKindState] = useState<WordKind | null>(() => rememberedKind(kinds));
  // a remembered type since removed is no choice at all
  const kind = kindState && kinds.some((k) => k.id === kindState) ? kindState : null;
  const [importText, setImportText] = useState<string | null>(null);
  const [spelling, setSpelling] = useState<WordSuggestion | null>(null);
  const [cleanup, setCleanup] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const setKind = (value: WordKind | null) => {
    setKindState(value);
    rememberKind(value);
  };

  const facts = useMemo(() => wordFacts(vocabulary, meta, stats.data, kinds), [vocabulary, meta, stats.data, kinds]);
  const keys = useMemo(() => new Set(vocabulary.map(entryKey)), [vocabulary]);
  const perKind = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of facts) if (f.kind) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    return counts;
  }, [facts]);
  const stale = facts.filter((f) => f.stale);

  const entries = splitEntries(text);
  const plan = planWords(vocabulary, text, people);
  const single = entries.length === 1;

  const add = (list: string[], as: WordKind | null) => {
    if (!list.length) return;
    edit.mutate({ add: list, kind: as });
    setFresh((seen) => new Set([...seen, ...list.map(entryKey)]));
    toast(list.length === 1 ? `Добавил «${list[0]}»` : `Добавил ${wordsCount(list.length)}`);
  };
  /** Enter in the add field: one word is added, a list opens the import sheet. */
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
    toast(list.length === 1 ? `Убрал «${list[0].word}»` : `Убрал ${wordsCount(list.length)}`, {
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

  const sheets = (
    <>
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
    </>
  );

  return {
    edit,
    stats,
    dismiss,
    text,
    setText,
    kind,
    setKind,
    setImportText,
    setSpelling,
    setCleanup,
    setTypesOpen,
    fresh,
    setFresh,
    facts,
    keys,
    perKind,
    stale,
    entries,
    plan,
    single,
    add,
    submit,
    remove,
    sheets,
  };
}
