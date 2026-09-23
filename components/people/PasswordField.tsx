"use client";

import { generatePassword } from "@/lib/people/password";

const FIELD =
  "min-h-[52px] w-full field px-3 pr-12 font-mono text-[18px] leading-[22px] tracking-[0.04em] outline-none transition-colors duration-[120ms] focus:border-accent";

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
      <polyline points="16.2,3.2 16.2,6.4 13,6.4" />
    </svg>
  );
}

/** A proposed password in a field with «другой» inside it: take it as is, roll again or type your own. */
export function PasswordField({
  value,
  onChange,
  label = "Пароль",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={label}
        className={FIELD}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        data-autofocus={autoFocus || undefined}
      />
      <button
        type="button"
        aria-label="Другой пароль"
        title="Другой пароль"
        onClick={() => onChange(generatePassword())}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted transition-transform duration-[120ms] active:rotate-[-40deg] active:text-accent"
      >
        <RefreshIcon />
      </button>
    </div>
  );
}
