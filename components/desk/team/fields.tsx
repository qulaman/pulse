"use client";

import { forwardRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Tooltip } from "@/components/desk/ui/Tooltip";
import { copyText } from "@/components/people/copy";
import { toast } from "@/components/ui/Toast";
import { generatePassword } from "@/lib/people/password";

/** A desk field: 36 px, the field recipe, 14/20 — as high as the toolbar's controls. */
export const INPUT = "field h-9 w-full px-3 text-[14px] leading-5 text-text outline-none";

/** The label column of a desk form (D-154 wave 3): the label on the left, the control on the right. */
export const LABEL_W = "grid-cols-[176px_minmax(0,1fr)]";

/**
 * One line of a desk form or of a card read as facts: the label on the left (13/20, muted), the
 * control or the value on the right, a hint and an error under it. Read and edited, a card keeps
 * its rows where they are — the values turn into fields in place.
 */
export function FormRow({
  label,
  htmlFor,
  hint,
  error,
  children,
  testId,
  align = "field",
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  testId?: string;
  /** `field` — the label stands level with a 36-px control; `text` — with a line of text. */
  align?: "field" | "text";
}) {
  return (
    <div className={`grid ${LABEL_W} items-start gap-x-6 border-t border-border/60 px-5 py-2.5 first:border-t-0`} data-testid={testId}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={`text-[13px] font-medium leading-5 text-muted ${align === "field" ? "pt-2" : ""}`}>
          {label}
        </label>
      ) : (
        <span className={`text-[13px] font-medium leading-5 text-muted ${align === "field" ? "pt-2" : ""}`}>{label}</span>
      )}
      <div className="flex min-w-0 max-w-[460px] flex-col gap-1.5">
        {children}
        {error ? (
          <p role="alert" className="text-[12px] font-medium leading-4 text-danger" data-testid="form-error">
            {error}
          </p>
        ) : null}
        {hint ? <p className="text-[12px] leading-4 text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

/** A switch on the desk: the word first, the toggle after it; Space and a click flip it. */
export function Switch({ id, on, onToggle, label }: { id?: string; on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="inline-flex h-9 items-center gap-3 self-start rounded-[10px] text-left text-[14px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[120ms]" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-transform duration-[120ms]" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
      {label}
    </button>
  );
}

/** «Ерлан, Ерлан Б.» ↔ the chips. */
export function splitAliases(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/ё/g, "е") === b.trim().toLowerCase().replace(/ё/g, "е");

/**
 * The spoken forms of a name as chips (D-54): typed and Enter (or a comma) adds one, Backspace in
 * an empty field takes the last back, × takes any; a pasted «Ерлан, Ерлан Б.» lands as two. The
 * suggestions not taken yet stand under it — one click each.
 */
export function AliasChips({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const fresh = splitAliases(raw).filter((alias, i, all) => !value.some((v) => same(v, alias)) && all.findIndex((a) => same(a, alias)) === i);
    if (fresh.length) onChange([...value, ...fresh]);
    setText("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === "," || event.key === ";") && text.trim()) {
      event.preventDefault();
      add(text);
    } else if (event.key === "Enter") {
      // an empty Enter is not the form's «Сохранить» here — it would surprise mid-typing
      event.preventDefault();
    } else if (event.key === "Backspace" && !text && value.length) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };
  const left = suggestions.filter((s) => !value.some((v) => same(v, s)));
  return (
    <>
      <div className="field flex min-h-9 flex-wrap items-center gap-1.5 px-1.5 py-1" onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {value.map((alias, index) => (
          <span key={`${alias}-${index}`} className="inline-flex h-6 items-center gap-1 rounded-[7px] border border-border bg-surface px-2 text-[13px] leading-4" data-testid="alias-chip">
            {alias}
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Убрать «${alias}»`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="-mr-1 flex h-4 w-4 items-center justify-center rounded-[4px] text-[13px] leading-none text-muted hover:bg-surface-2 hover:text-text"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            // a pasted list or a typed comma closes the chip at once
            if (/[,;]/.test(next)) add(next);
            else setText(next);
          }}
          onKeyDown={onKey}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : placeholder}
          className="h-7 min-w-[120px] flex-1 bg-transparent px-1.5 text-[14px] leading-5 outline-none placeholder:text-muted"
          data-testid="alias-input"
        />
      </div>
      {left.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] leading-4 text-muted">
          Добавить:
          {left.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...value, s])}
              className="inline-flex h-6 items-center rounded-[7px] border border-dashed border-border px-2 text-[12px] font-medium leading-4 text-text/85 transition-colors hover:border-accent/50 hover:text-text"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function IconButton({ label, keys, onClick, children }: { label: string; keys?: string[]; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label} keys={keys}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export const COPY_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
  </svg>
);

/** A copy button: the text to the clipboard and a toast that says so. */
export function CopyButton({ text, label = "Скопировать", done = "Скопировал" }: { text: () => string; label?: string; done?: string }) {
  return (
    <IconButton label={label} onClick={async () => toast((await copyText(text())) ? done : "Не получилось скопировать")}>
      {COPY_ICON}
    </IconButton>
  );
}

/**
 * A password handed over to a person (D-104), on the desk: shown, not hidden (it is read out or
 * copied), in monospace; ↻ draws a new readable one, ⧉ copies it.
 */
export const PasswordInput = forwardRef<HTMLInputElement, { id?: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }>(
  function PasswordInput({ id, value, onChange, autoFocus }, ref) {
    return (
      <div className="field flex h-9 items-center pl-3 pr-1">
        <input
          ref={ref}
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="nums min-w-0 flex-1 bg-transparent font-mono text-[15px] leading-5 tracking-[0.04em] outline-none"
          data-testid="password-input"
        />
        <IconButton label="Другой пароль" onClick={() => onChange(generatePassword())}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 5v6h-6" />
          </svg>
        </IconButton>
        <CopyButton text={() => value} label="Скопировать пароль" done="Скопировал пароль" />
      </div>
    );
  },
);
