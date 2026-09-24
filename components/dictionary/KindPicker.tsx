"use client";

import { Chip } from "@/components/ui/Chip";
import { NO_KIND_LABEL, type WordKind, type WordKindDef } from "@/lib/dictionary";

/**
 * What a word names — the company's own types (`settings.word_kinds`, D-111 §19) — as one
 * row of chips. `allowNone` adds «Без типа» (the word sheet); without it a tap on the chosen
 * chip clears the choice (the add card). `onEdit` puts «Изменить типы» at the end of the row.
 */
export function KindPicker({
  kinds,
  value,
  onChange,
  allowNone,
  onEdit,
  label = "Тип",
}: {
  kinds: readonly WordKindDef[];
  value: WordKind | null;
  onChange: (kind: WordKind | null) => void;
  allowNone?: boolean;
  onEdit?: () => void;
  label?: string;
}) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {kinds.map((kind) => (
          <Chip
            key={kind.id}
            role="radio"
            aria-checked={value === kind.id}
            tone={value === kind.id ? "accent" : "neutral"}
            onClick={() => onChange(value === kind.id && !allowNone ? null : kind.id)}
          >
            {kind.label}
          </Chip>
        ))}
        {allowNone ? (
          <Chip role="radio" aria-checked={value === null} tone={value === null ? "accent" : "muted"} onClick={() => onChange(null)}>
            {NO_KIND_LABEL}
          </Chip>
        ) : null}
      </div>
      {onEdit ? (
        <Chip tone="muted" onClick={onEdit} aria-label="Изменить типы">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="-ml-0.5">
            <path d="M10.8 2.7l2.5 2.5-7.6 7.6-3 .5.5-3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Типы
        </Chip>
      ) : null}
    </div>
  );
}
