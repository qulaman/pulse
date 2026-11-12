"use client";

import { Check, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { shortName, useNamesKey } from "@/lib/people/names";

/**
 * The desk's settings form (D-154 wave 3, D-158, D-174). A group is a card — its title and a line
 * of what it is for on top, its settings under it split by hairlines; a setting says what it is
 * and why on the left and holds its control on the right (or under the words: a list, a table).
 * A changed row carries a line of the accent on its left edge until it is saved. Controls are
 * sized for a mouse (36 px) and answer the keys a desktop expects: ↑/↓ step a number or a time,
 * ←/→ move a choice, Space flips a switch. Under «Журнал» (journal.css) the same markup is a
 * ruled form: a label over a rule of print, no card (app/desk/settings.css draws both).
 */

/** A person in a ruled list: one line, the name and after it the position in the second voice. */
export function PersonLine({ name, sub }: { name: string; sub?: string | null }) {
  // re-reads the company's names, so «Ерлан» becomes «Ерлан Б.» once the roster has come
  useNamesKey();
  return (
    <span className="block truncate text-[14px] leading-5" title={name}>
      {shortName(name)}
      {sub ? <span className="text-[12px] text-muted"> · {sub}</span> : null}
    </span>
  );
}

/**
 * A row's anchor in the page: the settings search lands here (`set-<id>`). A control in a row has an
 * id of its own (`ctl-…`): a label pointing at a row's anchor would reach the row, not the control.
 */
export const rowAnchor = (id: string) => `set-${id}`;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45";

/**
 * A group of settings as a card. `tone="danger"` — the end of a tab where a choice cannot be taken
 * back (the sound deleted after a shorter term): a red ring and the words say so before «Сохранить».
 */
export function SettingsGroup({
  id,
  title,
  about,
  action,
  tone,
  children,
}: {
  id: string;
  title: string;
  about?: ReactNode;
  /** On the right of the title: a link to where the rest of it lives. */
  action?: ReactNode;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section id={rowAnchor(id)} data-settings-group={id} data-tone={tone} aria-label={title} className="set-card scroll-mt-6">
      <header className="set-card-head">
        <div className="min-w-0 flex-1">
          <h2 className="set-card-title">{title}</h2>
          {about ? <p className="set-card-about">{about}</p> : null}
        </div>
        {action ? <div className="set-card-action">{action}</div> : null}
      </header>
      <div className="set-card-rows desk-list">{children}</div>
    </section>
  );
}

/**
 * One setting: the words on the left, the control on the right. `changed` — the draft differs from
 * what is saved: a 2 px line of the accent on the row's edge says so before «Сохранить».
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
        <label htmlFor={htmlFor} className="set-row-label cursor-pointer">
          {label}
        </label>
      ) : (
        <p className="set-row-label">{label}</p>
      )}
      {hint ? <p className="set-row-hint">{hint}</p> : null}
    </div>
  );
  return (
    <div id={rowAnchor(id)} data-setting={id} data-changed={changed ? "" : undefined} data-muted={muted ? "" : undefined} className="set-row relative scroll-mt-24">
      {changed ? <span aria-hidden className="set-row-mark" /> : null}
      {stack ? (
        <div className="flex flex-col gap-3">
          {words}
          {children}
        </div>
      ) : (
        <div className="grid min-h-8 grid-cols-[minmax(160px,1fr)_minmax(0,auto)] items-center gap-6">
          {words}
          <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}

/** On / off: a pill that slides under «Графит», the desk's small ruled box under «Журнал»; Space or Enter flips it, the label's click too. */
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
      className="set-switch relative shrink-0 transition-colors duration-[120ms] disabled:opacity-40"
    >
      <span aria-hidden className="absolute transition-transform duration-[120ms]" />
    </button>
  );
}

/** A small box for a list of on/off items (the parser's kinds): the whole line is the target, the tick draws itself. */
export function CheckLine({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`set-check flex min-h-9 items-center gap-2.5 text-left text-[14px] leading-5 transition-colors duration-[120ms] disabled:cursor-default ${FOCUS}`}
    >
      <span aria-hidden className="set-check-box flex h-4 w-4 shrink-0 items-center justify-center" data-on={checked ? "" : undefined}>
        {checked ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2.5 6.2 2.3 2.3L9.5 3.8" pathLength={1} className="set-check-tick" />
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
  width = 104,
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
 * cannot be read puts the last one back (and says so on the field while it is typed).
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
      title={bad ? "Так время не прочитать: 9, 930 или 18:00 — иначе останется прежнее" : undefined}
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
  invalid = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  width?: number | string;
  className?: string;
  /** What is typed cannot be saved as it is: the field says so with its ring, the row's hint in words. */
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      aria-label={label}
      aria-invalid={invalid || undefined}
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

/** The plate under the chosen option glides to the next one: the toolbar's spring (D-171). */
const SEG_GLIDE = { type: "spring", stiffness: 560, damping: 44, mass: 0.8 } as const;

/**
 * One of two to five, side by side (a radio group in the look of the desk's segments): a click,
 * or ←/→ while it has focus — the choice moves with the focus, the plate glides after it.
 */
export function Segmented<V extends string | number>({ id, value, onChange, items, label }: { id?: string; value: V; onChange: (value: V) => void; items: Choice<V>[]; label: string }) {
  // one plate per control: two segments of one form never pull each other's plate
  const glide = `set-seg-${useId()}`;
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
    <div id={id} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="seg set-seg inline-flex h-9 items-center gap-0.5 p-0.5">
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
            className={`relative flex h-8 items-center whitespace-nowrap px-3 text-[13px] font-semibold leading-4 transition-colors duration-[120ms] ${FOCUS} ${
              active ? "seg-thumb text-text" : "text-muted hover:text-text"
            }`}
          >
            {active ? <motion.span layoutId={glide} aria-hidden className="seg-glider" transition={SEG_GLIDE} /> : null}
            <span className="relative z-[1]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A choice from a list, in the desk's own select (the system's stays inside, carrying the value). */
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
    <span className="inline-flex min-w-0 max-w-full" style={{ width }}>
      <Select id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value as V)} className="w-full">
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
    </span>
  );
}

/**
 * The one bar of a tab with edits (D-154 wave 3): what is unsaved, «Отменить» and «Сохранить» with
 * its key — under «Графит» a floating bar that rises at the foot of the window, under «Журнал» the
 * form's closing rule; stuck to the bottom of the window either way. Gone when there is nothing to
 * save.
 */
export function SaveBar({ changes, saving, onSave, onReset, blocked }: { changes: string[]; saving: boolean; onSave: () => void; onReset: () => void; blocked?: string | null }) {
  if (changes.length === 0) return null;
  return (
    <div className="set-savebar-dock sticky bottom-0 z-10 bg-bg pb-3" data-testid="settings-savebar">
      <div className="set-savebar card-in flex items-center gap-3 border-t border-text pt-2" role="status">
        <span aria-hidden className="set-savebar-dot" data-blocked={blocked ? "" : undefined} />
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
        <Button size="sm" loading={saving} disabled={Boolean(blocked)} onClick={onSave} data-testid="settings-save" icon={<Check size={15} strokeWidth={2.5} />}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

/** A line under a group: where the rest of it lives on the desk. */
export function GroupNote({ children }: { children: ReactNode }) {
  return <p className="set-note text-[13px] leading-[18px] text-muted">{children}</p>;
}

/** A link on a group's head to the screen where the rest of it lives — words and an arrow. */
export function GroupLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <Link href={href} data-testid={testId} className="set-link inline-flex items-center gap-0.5 text-[13px] font-medium">
      {children}
      <ChevronRight size={14} strokeWidth={2.25} aria-hidden className="set-link-arrow" />
    </Link>
  );
}
