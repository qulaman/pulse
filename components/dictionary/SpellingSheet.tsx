"use client";

import { useState } from "react";

import { KindPicker } from "@/components/dictionary/KindPicker";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ENTRY_MAX_LENGTH, entryKey, type WordKind, type WordKindDef } from "@/lib/dictionary";
import type { WordSuggestion } from "@/lib/dictionary-usage";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none placeholder:text-muted focus:border-accent";

/**
 * «Как пишется правильно?» (D-111, words wave): a name the recogniser writes more than one
 * way is exactly the one the vocabulary is for — but which spelling is right only the
 * director knows. The heard spellings are chips, the field takes the right one (a case
 * ending off, a letter fixed), and the word is added with its kind.
 */
export function SpellingSheet({
  suggestion,
  kinds,
  kind,
  taken,
  onClose,
  onAdd,
}: {
  suggestion: WordSuggestion | null;
  kinds: readonly WordKindDef[];
  kind: WordKind | null;
  /** Keys of the words already in the vocabulary. */
  taken: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (word: string, kind: WordKind | null, suggestion: WordSuggestion) => void;
}) {
  return (
    <Sheet open={suggestion !== null} onClose={onClose} title="Как пишется правильно?">
      {suggestion ? <SpellingBody key={suggestion.key} suggestion={suggestion} kinds={kinds} kind={kind} taken={taken} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function SpellingBody({
  suggestion,
  kinds,
  kind: initialKind,
  taken,
  onAdd,
}: {
  suggestion: WordSuggestion;
  kinds: readonly WordKindDef[];
  kind: WordKind | null;
  taken: ReadonlySet<string>;
  onAdd: (word: string, kind: WordKind | null, suggestion: WordSuggestion) => void;
}) {
  const [spelling, setSpelling] = useState(suggestion.word);
  const [kind, setKind] = useState(initialKind);
  const word = spelling.replace(/\s+/g, " ").trim();
  const there = taken.has(entryKey(word));
  const valid = entryKey(word).length > 0 && word.length <= ENTRY_MAX_LENGTH && !there;

  return (
    <div className="flex flex-col gap-4" data-testid="spelling-sheet">
      <p className="text-[14px] leading-5 text-muted">
        Распознавание записало это название по-разному. Выберите верное написание или впишите своё — в именительном падеже,
        как оно должно выглядеть в задаче.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[suggestion.word, ...suggestion.variants].map((form) => (
          <Chip key={form} tone={form === word ? "accent" : "neutral"} onClick={() => setSpelling(form)}>
            {form}
          </Chip>
        ))}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Написание</span>
        <input
          className={FIELD}
          value={spelling}
          aria-label="Верное написание"
          data-autofocus
          onChange={(e) => setSpelling(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onAdd(word, kind, suggestion);
          }}
        />
        {there ? <span className="text-[13px] leading-[18px] text-warn">«{word}» уже есть в словаре</span> : null}
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Что это</span>
        <KindPicker kinds={kinds} value={kind} onChange={setKind} />
      </div>
      <Button block size="lg" disabled={!valid} onClick={() => onAdd(word, kind, suggestion)}>
        Добавить «{word || "…"}»
      </Button>
    </div>
  );
}
