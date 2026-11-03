"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

/**
 * The desk's settings form (D-154 wave 3) — macOS System Settings and Linear's settings in the
 * desk's language: groups with a label and a line of what they are for, each a flat plane of
 * rows; a row says what it is and why on the left and holds its control on the right. A changed
 * row carries a line of the accent at its left edge until it is saved. Controls are sized for a
 * mouse (36 px) and answer the keys a desktop expects: ↑/↓ step a number or a time, ←/→ move a
 * choice, Space flips a switch.
 */

/** A row's anchor in the page: the settings search lands here (`set-<id>`). */
export const rowAnchor = (id: string) => `set-${id}`;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45";

export function SettingsGroup({
  id,
  title,
  about,
  action,
  children,
}: {
  id: string;
  title: string;
  about?: ReactNode;
  /** On the right of the label: a link to where the rest of it lives. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={rowAnchor(id)} data-settings-group={id} aria-label={title} className="scroll-mt-6">
      <SectionLabel action={action} className="px-1">
        {title}
      </SectionLabel>
      {about ? <p className="mb-2 max-w-[620px] px-1 text-[13px] leading-[18px] text-muted">{about}</p> : <div className="h-1.5" />}
      <div className="rounded-[12px] border border-border bg-surface/40 [&>*+*]:border-t [&>*+*]:border-border/60">{children}</div>
    </section>
  );
}

/**
 * One setting: the words on the left, the control on the right. `changed` — the draft differs from
 * what is saved: a 2 px line of the accent at the left edge says so before «Сохранить».
 */
export function SettingRow({
  id,
  label,
  hint,
  htmlFor,
  changed = false,
  children,
  stack = false,
  muted = false,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** The control the label names: a click on the words reaches it (a switch flips). */
  htmlFor?: string;
  changed?: boolean;
  children?: ReactNode;
  /** The control under the words, full width — a list, a table. */
  stack?: boolean;
  /** Not in effect now (the module is off): the row stays, quieter. */
  muted?: boolean;
}) {
  const words = (
    <div className="min-w-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="cursor-pointer text-[14px] font-medium leading-5">
          {label}
        </label>
      ) : (
        <p className="text-[14px] font-medium leading-5">{label}</p>
      )}
      {hint ? <p className="mt-0.5 max-w-[520px] text-[13px] leading-[18px] text-muted">{hint}</p> : null}
    </div>
  );
  return (
    <div
      id={rowAnchor(id)}
      data-setting={id}
      data-changed={changed ? "" : undefined}
      className={`relative scroll-mt-24 px-4 py-3 transition-opacity duration-[120ms] ${muted ? "opacity-55" : ""}`}
    >
      {changed ? <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" /> : null}
      {stack ? (
        <div className="flex flex-col gap-3">
          {words}
          {children}
        </div>
      ) : (
        <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
          {words}
          <div className="flex items-center justify-end gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}

/** On / off, desk size: 36×20, Space or Enter flips it, the label's click too. */
export function Switch({
  id,
  checked,
  onChange,
  label,
  disabled = false,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[120ms] disabled:opacity-40 ${FOCUS} focus-visible:ring-offset-2 focus-visible:ring-offset-bg`}
      style={{ background: checked ? "var(--accent)" : "var(--border)" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0.5 h-4 w-4 rounded-full bg-bg transition-transform duration-[120ms]"
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)", background: checked ? "var(--bg)" : "var(--text-muted)" }}
      />
    </button>
  );
}

/** A small box for a list of on/off items (the parser's kinds): the whole line is the target. */
export function CheckLine({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-8 items-center gap-2.5 rounded-[8px] px-2 text-left text-[14px] leading-5 transition-colors duration-[120ms] hover:bg-surface-2/60 disabled:cursor-default disabled:hover:bg-transparent ${FOCUS}`}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-[120ms]"
        style={{
          background: checked ? (disabled ? "var(--surface-2)" : "var(--accent)") : "transparent",
          borderColor: checked && !disabled ? "var(--accent)" : "var(--border)",
          color: disabled ? "var(--text-muted)" : "var(--bg)",
        }}
      >
        {checked ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2.5 6.2 2.3 2.3L9.5 3.8" />
          </svg>
        ) : null}
      </span>
      <span className={disabled ? "text-muted" : ""}>
        {label}
        {hint ? <span className="text-muted"> · {hint}</span> : null}
      </span>
    </button>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A whole number, desk size: typed, or stepped with ↑/↓ (Shift — by ten); the unit sits inside
 * the field on the right. An empty or broken field puts back the last good number on leaving.
 */
export function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 1000,
  unit,
  label,
  width = 96,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  width?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(Number.isFinite(value) ? value : min);
  const commit = (raw: string) => {
    const next = Math.round(Number(raw.replace(/\s/g, "").replace(",", ".")));
    if (raw.trim() !== "" && Number.isFinite(next)) onChange(clamp(next, min, max));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const by = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
    setText(null);
    onChange(clamp((Number.isFinite(value) ? value : min) + by, min, max));
  };
  return (
    <span className="field relative flex h-9 items-center" style={{ width }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={shown}
        onChange={(event) => {
          setText(event.target.value);
          commit(event.target.value);
        }}
        onBlur={() => setText(null)}
        onKeyDown={onKeyDown}
        className={`nums h-full w-full min-w-0 bg-transparent pl-3 text-right text-[14px] leading-5 outline-none ${unit ? "pr-1" : "pr-3"}`}
      />
      {unit ? <span className="shrink-0 pr-3 text-[13px] leading-5 text-muted">{unit}</span> : null}
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** «9» → 09:00, «930» → 09:30, «9.5» → 09:05, «21:00» stays; anything else — null. */
export function readClock(raw: string): string | null {
  const text = raw.trim().replace(/[.,\-\s]/g, ":");
  let hours: number;
  let minutes: number;
  if (/^\d{1,2}$/.test(text)) {
    hours = Number(text);
    minutes = 0;
  } else if (/^\d{3,4}$/.test(text)) {
    hours = Number(text.slice(0, text.length - 2));
    minutes = Number(text.slice(-2));
  } else {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(text);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * A time on the Aqtobe wall clock, typed the way it is said — «9», «930», «18:00» — or stepped:
 * ↑/↓ by `step` minutes, Shift — by an hour. Enter or leaving the field settles it; a time that
 * cannot be read puts the last one back.
 */
export function TimeInput({ id, value, onChange, label, step = 15 }: { id?: string; value: string; onChange: (value: string) => void; label: string; step?: number }) {
  const [text, setText] = useState<string | null>(null);
  const settle = () => {
    if (text === null) return;
    const next = readClock(text);
    if (next && next !== value) onChange(next);
    setText(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      settle();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const base = readClock(text ?? value) ?? value;
    const [h, m] = base.split(":").map(Number);
    const by = (event.shiftKey ? 60 : step) * (event.key === "ArrowUp" ? 1 : -1);
    // a step lands on the grid of the step: 09:07 ↑ → 09:15, not 09:22
    const raw = h * 60 + m;
    const snapped = by > 0 ? Math.floor(raw / Math.abs(by)) * Math.abs(by) + Math.abs(by) : Math.ceil(raw / Math.abs(by)) * Math.abs(by) - Math.abs(by);
    const total = ((snapped % 1440) + 1440) % 1440;
    setText(null);
    onChange(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
  };
  const bad = text !== null && text.trim() !== "" && readClock(text) === null;
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={bad || undefined}
      value={text ?? value}
      placeholder="00:00"
      onChange={(event) => setText(event.target.value)}
      onBlur={settle}
      onKeyDown={onKeyDown}
      className="field nums h-9 w-[76px] px-3 text-center text-[14px] leading-5 outline-none"
      style={bad ? { borderColor: "var(--warn)" } : undefined}
    />
  );
}

/** A line of text, desk size. */
export function TextInput({
  id,
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  width = 320,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  width?: number | string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      className={`field h-9 px-3 text-[14px] leading-5 outline-none ${className}`}
      style={{ width }}
    />
  );
}

export type Choice<V extends string | number> = { value: V; label: ReactNode };

/**
 * One of two to five, side by side (a radio group in the look of the desk's segments): a click,
 * or ←/→ while it has focus — the choice moves with the focus.
 */
export function Segmented<V extends string | number>({ id, value, onChange, items, label }: { id?: string; value: V; onChange: (value: V) => void; items: Choice<V>[]; label: string }) {
  const at = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (at + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
    onChange(items[next].value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };
  return (
    <div id={id} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="seg inline-flex h-9 items-center gap-0.5 rounded-[11px] p-0.5">
      {items.map((item, index) => {
        const active = index === at;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={`flex h-8 items-center whitespace-nowrap rounded-[9px] px-3 font-display text-[13px] font-semibold leading-4 transition-colors duration-[120ms] ${FOCUS} ${
              active ? "seg-thumb text-text" : "text-muted hover:text-text"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** The browser's select in the desk's field (its chevron is ours, globals.css). */
export function SelectInput<V extends string>({
  id,
  value,
  onChange,
  items,
  label,
  width = 280,
}: {
  id?: string;
  value: V;
  onChange: (value: V) => void;
  items: { value: V; label: string }[];
  label: string;
  width?: number;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as V)}
      className="field h-9 cursor-pointer pl-3 text-[14px] leading-5"
      style={{ width }}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The one bar of a tab with edits (D-154 wave 3): what is unsaved, «Отменить» and «Сохранить» with
 * its key — in the flow under the form, stuck to the bottom of the window while the form is longer
 * than the window. Gone when there is nothing to save.
 */
export function SaveBar({ changes, saving, onSave, onReset, blocked }: { changes: string[]; saving: boolean; onSave: () => void; onReset: () => void; blocked?: string | null }) {
  if (changes.length === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 mt-2" data-testid="settings-savebar">
      <div className="card-in flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-2.5" style={{ boxShadow: "var(--shadow-raised)" }}>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <p className="min-w-0 flex-1 truncate text-[14px] leading-5">
          <span className="font-medium">Не сохранено:</span> <span className="text-muted">{changes.join(", ")}</span>
          {blocked ? <span className="text-warn"> · {blocked}</span> : null}
        </p>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onReset} data-testid="settings-reset">
          Отменить
        </Button>
        <span aria-hidden className="flex items-center gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>S</Kbd>
        </span>
        <Button size="sm" loading={saving} disabled={Boolean(blocked)} onClick={onSave} data-testid="settings-save">
          Сохранить
        </Button>
      </div>
    </div>
  );
}

/** A line under a group: where the rest of it lives on the desk. */
export function GroupNote({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-2 text-[13px] leading-[18px] text-muted">{children}</p>;
}
