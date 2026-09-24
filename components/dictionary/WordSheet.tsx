"use client";

import { useState } from "react";

import { KindPicker } from "@/components/dictionary/KindPicker";
import { STALE_DAYS, timesLine, type WordFact } from "@/components/dictionary/word-facts";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ENTRY_MAX_LENGTH, entryKey, type WordKind, type WordKindDef } from "@/lib/dictionary";
import { dayMonth, whenLine } from "@/lib/dictionary-usage";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none placeholder:text-muted focus:border-accent";

/**
 * One word of the vocabulary (D-111, words wave): its spelling to fix, its kind, how often
 * it came up in the month, who added it and when, and «Удалить слово». The kind changes on
 * the tap; a new spelling is saved by its own button — the word keeps its place, kind and
 * history. Deleting says «Вернуть» in the toast.
 */
export function WordSheet({
  fact,
  kinds,
  days,
  taken,
  onClose,
  onRename,
  onKind,
  onRemove,
}: {
  /** The word open; null — the sheet is closed. */
  fact: WordFact | null;
  kinds: readonly WordKindDef[];
  days: number;
  /** Keys of the other words — a new spelling must not become one of them. */
  taken: ReadonlySet<string>;
  onClose: () => void;
  onRename: (from: string, to: string) => void;
  onKind: (word: string, kind: WordKind | null) => void;
  onRemove: (fact: WordFact) => void;
}) {
  return (
    <Sheet open={fact !== null} onClose={onClose} title={fact?.word ?? ""}>
      {fact ? (
        <WordBody
          key={fact.word}
          fact={fact}
          kinds={kinds}
          days={days}
          taken={taken}
          onRename={onRename}
          onKind={onKind}
          onRemove={onRemove}
        />
      ) : null}
    </Sheet>
  );
}

function WordBody({
  fact,
  kinds,
  days,
  taken,
  onRename,
  onKind,
  onRemove,
}: {
  fact: WordFact;
  kinds: readonly WordKindDef[];
  days: number;
  taken: ReadonlySet<string>;
  onRename: (from: string, to: string) => void;
  onKind: (word: string, kind: WordKind | null) => void;
  onRemove: (fact: WordFact) => void;
}) {
  const [spelling, setSpelling] = useState(fact.word);
  const [kind, setKind] = useState(fact.kind);
  const next = spelling.replace(/\s+/g, " ").trim();
  const changed = next !== fact.word;
  const clash = changed && entryKey(next) !== fact.key && taken.has(entryKey(next));
  const valid = changed && entryKey(next).length > 0 && next.length <= ENTRY_MAX_LENGTH && !clash;

  const usage = fact.usage;
  const heard = !usage
    ? "Считаю, как часто встречалось…"
    : usage.count > 0 && usage.lastAt
      ? `Встречалось ${timesLine(usage.count)} за ${days} дней, последний раз ${whenLine(usage.lastAt)}`
      : fact.stale
        ? `За ${STALE_DAYS} дней не встретилось ни разу — подсказка распознаванию его зря несёт`
        : `За ${days} дней пока не встречалось`;

  return (
    <div className="flex flex-col gap-5" data-testid="word-sheet">
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Написание — как должно быть в задаче</span>
        <input
          className={FIELD}
          value={spelling}
          maxLength={ENTRY_MAX_LENGTH + 10}
          aria-label="Написание"
          onChange={(e) => setSpelling(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onRename(fact.word, next);
          }}
        />
        {clash ? <span className="text-[13px] leading-[18px] text-warn">«{next}» уже есть в словаре</span> : null}
        {valid ? (
          <Button onClick={() => onRename(fact.word, next)} className="self-start">
            Сохранить написание
          </Button>
        ) : null}
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Что это</span>
        <KindPicker
          kinds={kinds}
          allowNone
          value={kind}
          onChange={(value) => {
            setKind(value);
            onKind(fact.word, value);
          }}
        />
      </div>

      <div className="flex flex-col gap-1 text-[14px] leading-5">
        <p className={fact.stale ? "text-warn" : ""}>{heard}</p>
        {fact.meta?.added_at ? (
          <p className="text-muted">
            Добавлено {dayMonth(fact.meta.added_at)}
            {fact.meta.added_by ? ` · ${fact.meta.added_by}` : ""}
          </p>
        ) : (
          <p className="text-muted">Добавлено до того, как словарь стал это помнить</p>
        )}
      </div>

      <Button variant="danger" block onClick={() => onRemove(fact)}>
        Удалить слово
      </Button>
    </div>
  );
}
