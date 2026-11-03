"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";

/** A row of the desk's controls over a table: tabs and filters on the left, counts and actions on the right. */
export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="desk-toolbar">
      {children}
      {end ? <div className="ml-auto flex items-center gap-2">{end}</div> : null}
    </div>
  );
}

/**
 * A search field with its own «×» (DESIGN §2: no system furniture) and a «/» hint while empty —
 * the desk's `/` goes to the order line, so this field takes the click or Tab.
 */
export const SearchField = forwardRef<HTMLInputElement, { value: string; onChange: (value: string) => void; placeholder?: string; width?: number; "aria-label"?: string }>(
  function SearchField({ value, onChange, placeholder = "Поиск…", width = 240, ...aria }, ref) {
    return (
      <label className="field relative flex h-9 items-center px-3" style={{ width }}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="mr-2 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.stopPropagation();
              onChange("");
            }
          }}
          placeholder={placeholder}
          aria-label={aria["aria-label"] ?? placeholder}
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none placeholder:text-muted"
        />
        {value ? (
          <button type="button" aria-label="Очистить" onClick={() => onChange("")} className="ml-1 text-[16px] leading-none text-muted hover:text-text">
            ×
          </button>
        ) : null}
      </label>
    );
  },
);

/** The browser's own select in our field recipe (its chevron is ours, globals.css). */
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`field h-9 cursor-pointer pl-3 text-[14px] leading-5 ${className}`}>
      {children}
    </select>
  );
}

export type Segment<V extends string> = { value: V; label: ReactNode; count?: number };

/** Two to five views of one list — «Ждут вас / В работе / Закрытые». */
export function SegmentTabs<V extends string>({
  value,
  onChange,
  items,
  "aria-label": label,
}: {
  value: V;
  onChange: (value: V) => void;
  items: Segment<V>[];
  "aria-label"?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="seg inline-flex h-9 items-center gap-0.5 rounded-[11px] p-0.5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`seg-${item.value}`}
            onClick={() => onChange(item.value)}
            className={`desk-focus flex h-8 items-center gap-1.5 rounded-[9px] px-3 font-display text-[13px] font-semibold leading-4 outline-none transition-colors duration-[120ms] ${
              active ? "seg-thumb text-text" : "text-muted hover:text-text"
            }`}
          >
            {item.label}
            {item.count !== undefined ? <span className={`nums text-[12px] ${active ? "text-accent" : "text-muted"}`}>{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** «/» — a hint of the keyboard next to a field or a button. */
export function KeyHint({ children }: { children: ReactNode }) {
  return <Kbd>{children}</Kbd>;
}
