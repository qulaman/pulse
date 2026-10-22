"use client";

import { useRef } from "react";

import { useSearchHold } from "@/lib/ui/searchHold";

/** The search line of the dictionary lists — the recipe of `TeamRoster`'s. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  // a narrowed list must not shorten the page under the finger (useSearchHold)
  const field = useRef<HTMLInputElement>(null);
  const hold = useSearchHold(field, value);
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        ref={field}
        type="search"
        value={value}
        onChange={(e) => {
          hold(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-[44px] w-full field pl-10 pr-10 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] placeholder:text-muted focus:border-accent"
      />
      {value ? (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[18px] leading-none text-muted"
        >
          ×
        </button>
      ) : null}
    </label>
  );
}
