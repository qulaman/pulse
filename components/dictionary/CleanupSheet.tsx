"use client";

import { useState } from "react";

import { STALE_DAYS, type WordFact } from "@/components/dictionary/word-facts";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { kindLabel, type WordKindDef } from "@/lib/dictionary";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * «Не встречались месяц» (D-111, words wave): the words nobody said for 30 days, all ticked —
 * each rides in every STT prompt and makes it longer for nothing (D-53, D-55). «Убрать N»
 * takes the ticked ones away, «Вернуть» in the toast brings them back.
 */
export function CleanupSheet({
  facts,
  kinds,
  open,
  onClose,
  onRemove,
}: {
  facts: WordFact[];
  kinds: readonly WordKindDef[];
  open: boolean;
  onClose: () => void;
  onRemove: (facts: WordFact[]) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Не встречались ${STALE_DAYS} дней`}>
      {open ? <CleanupBody facts={facts} kinds={kinds} onRemove={onRemove} /> : null}
    </Sheet>
  );
}

function CleanupBody({
  facts,
  kinds,
  onRemove,
}: {
  facts: WordFact[];
  kinds: readonly WordKindDef[];
  onRemove: (facts: WordFact[]) => void;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(facts.map((f) => f.key)));
  const chosen = facts.filter((f) => ticked.has(f.key));
  const toggle = (key: string) =>
    setTicked((seen) => {
      const next = new Set(seen);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-3" data-testid="cleanup-sheet">
      <p className="text-[13px] leading-[18px] text-muted">
        Никто не произнёс их за месяц. Каждое слово удлиняет подсказку распознаванию — лишние только мешают.
      </p>
      <ul className="no-bar -mx-1 max-h-[46dvh] overflow-y-auto">
        {facts.map((fact) => {
          const on = ticked.has(fact.key);
          return (
            <li key={fact.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(fact.key)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-1 text-left transition-colors duration-[120ms] active:bg-surface-2"
              >
                <span
                  aria-hidden
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border"
                  style={on ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--bg)" } : { borderColor: "var(--border)" }}
                >
                  {on ? (
                    <svg width="13" height="13" viewBox="0 0 16 16">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px] leading-[22px]">{fact.word}</span>
                {fact.kind ? <span className="shrink-0 text-[13px] leading-4 text-muted">{kindLabel(kinds, fact.kind)}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <Button block size="lg" variant="danger" disabled={chosen.length === 0} onClick={() => onRemove(chosen)}>
        {chosen.length ? `Убрать ${chosen.length} ${pluralRu(chosen.length, ["слово", "слова", "слов"])}` : "Ничего не отмечено"}
      </Button>
    </div>
  );
}
