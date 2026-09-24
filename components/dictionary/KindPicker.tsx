"use client";

import { Chip } from "@/components/ui/Chip";
import { WORD_KINDS, WORD_KIND_LABEL, type WordKind } from "@/lib/dictionary";

/**
 * What a word names — Контрагент, Объект, Товар, Термин — as one row of chips (D-111).
 * `allowNone` adds «Без типа» (the word sheet); without it a tap on the chosen chip
 * clears the choice (the add card).
 */
export function KindPicker({
  value,
  onChange,
  allowNone,
  label = "Тип",
}: {
  value: WordKind | null;
  onChange: (kind: WordKind | null) => void;
  allowNone?: boolean;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
      {WORD_KINDS.map((kind) => (
        <Chip
          key={kind}
          role="radio"
          aria-checked={value === kind}
          tone={value === kind ? "accent" : "neutral"}
          onClick={() => onChange(value === kind && !allowNone ? null : kind)}
        >
          {WORD_KIND_LABEL[kind]}
        </Chip>
      ))}
      {allowNone ? (
        <Chip role="radio" aria-checked={value === null} tone={value === null ? "accent" : "muted"} onClick={() => onChange(null)}>
          Без типа
        </Chip>
      ) : null}
    </div>
  );
}
