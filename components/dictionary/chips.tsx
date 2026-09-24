"use client";

/**
 * The chips of the dictionary (D-111): a saved entry with its own ×, a suggestion to take
 * with one tap. Label typography and radius of `Chip` (DESIGN §1.3); the × keeps a 44px
 * hit area around a small glyph.
 */

export function EntryChip({
  label,
  fresh,
  waiting,
  onRemove,
}: {
  label: string;
  /** Added on this visit: an accent edge says where it landed. */
  fresh?: boolean;
  /** Added without network: on the screen, not on the server yet — a dashed edge and a clock. */
  waiting?: boolean;
  /** Absent — the entry is read-only for this viewer. */
  onRemove?: () => void;
}) {
  return (
    <span
      title={waiting ? "Ждёт связи — сохранится сам" : undefined}
      className={`card-in inline-flex min-h-[34px] max-w-full items-center rounded-full border bg-surface-2 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] ${
        waiting ? "border-dashed border-muted/60 text-muted" : fresh ? "border-accent/60 text-text" : "border-border text-text"
      } ${onRemove ? "pl-3" : "px-3"}`}
    >
      {waiting ? (
        <svg width="13" height="13" viewBox="0 0 16 16" aria-label="ждёт связи" className="-ml-0.5 mr-1 shrink-0">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : null}
      <span className="min-w-0 truncate py-1">{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Убрать «${label}»`}
          onClick={onRemove}
          className="relative flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[17px] leading-none text-muted transition-colors duration-[120ms] after:absolute after:-inset-[6px] after:content-[''] active:text-danger"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function SuggestChip({ label, onTake, disabled }: { label: string; onTake: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onTake}
      disabled={disabled}
      aria-label={`Добавить «${label}»`}
      className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-dashed border-accent/60 px-3 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] text-accent transition-transform duration-[120ms] active:scale-[0.96] disabled:opacity-40"
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}
