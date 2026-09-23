"use client";

import { initialsOf } from "@/lib/people/queries";
import type { PersonLoad } from "@/lib/tasks/overview";

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/**
 * Who holds the director's work, as a strip of people you scroll sideways (Telegram's
 * folders, Instagram's stories): «Все» first, then everyone with something open — the
 * ones with the director's move first. A lit chip narrows the list and the status screen
 * to that person; a second tap lets go. A red dot on the face means late work, amber —
 * the director's move.
 */
export function PeopleStrip({
  people,
  value,
  onChange,
}: {
  people: readonly PersonLoad[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (people.length < 2) return null;

  return (
    <div className="no-bar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Чьи задачи">
      <Chip active={value === null} onClick={() => onChange(null)} label="Все">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-muted"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
            <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17 13.8a5.5 5.5 0 0 1 3.5 5.2" />
          </svg>
        </span>
      </Chip>
      {people.map((person) => {
        const active = value === person.id;
        const dot = person.overdue > 0 ? "var(--danger)" : person.yours > 0 ? "var(--warn)" : null;
        return (
          <Chip
            key={person.id}
            active={active}
            onClick={() => onChange(active ? null : person.id)}
            label={firstName(person.name)}
            count={person.open}
            aria={active ? `${person.name} — показать всех` : `Задачи: ${person.name}`}
          >
            <span className="relative">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full font-display text-[11px] font-bold text-bg"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
              >
                {initialsOf(person.name)}
              </span>
              {dot ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 h-[11px] w-[11px] rounded-full border-2 border-bg"
                  style={{ background: dot }}
                />
              ) : null}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  aria,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  aria?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={aria}
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] transition-[transform,background-color,border-color,color] duration-[120ms] active:scale-[0.97] ${
        active ? "border-accent/70 bg-accent/15 text-text" : "border-border/80 bg-surface text-muted"
      }`}
    >
      {children}
      <span className={active ? "text-text" : "text-text/85"}>{label}</span>
      {count !== undefined ? <span className={`nums text-[12px] ${active ? "text-accent" : "text-muted"}`}>{count}</span> : null}
    </button>
  );
}
