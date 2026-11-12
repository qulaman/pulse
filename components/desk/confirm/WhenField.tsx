"use client";

import { CalendarClock } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { Chevron } from "@/components/desk/confirm/PersonField";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { formatWhen, fromLocalInput, parseWhen, toLocalInput, whenPresets } from "@/lib/desk/when";

/**
 * «Срок» and «Когда» on the desk (D-154 wave 3): the field takes the words — «завтра 15», «пт»,
 * «12.11 10:00», «через 3 дня», «без срока» — and shows under itself what they mean and the few
 * usual deadlines (сегодня 18:00, завтра, пятница, через неделю); ↑/↓ and Enter take a preset,
 * Enter takes the typed words once they are understood, Esc leaves the value as it was. The
 * exact date and hour can be picked with the mouse at the foot of the list.
 */
export function WhenField({
  value,
  onChange,
  label,
  allowNone = true,
  emptyText = "без срока",
  tone,
  heard,
  testId,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  label: string;
  allowNone?: boolean;
  /** What the field says when there is no time. */
  emptyText?: string;
  tone?: "danger" | "warn";
  /** The words the parser read the time from, when it was not sure: «„до пятницы“». */
  heard?: string | null;
  testId?: string;
}) {
  const listId = useId();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const inside = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [now] = useState(() => new Date());
  const presets = useMemo(() => whenPresets(now, { allowNone }), [now, allowNone]);
  const typed = text?.trim() ? parseWhen(text, new Date()) : undefined;
  const understood = typed !== undefined && (typed !== null || allowNone);

  const close = () => {
    setOpen(false);
    setText(null);
    setActive(-1);
  };
  const apply = (iso: string | null) => {
    onChange(iso);
    close();
  };
  const shown = value ? formatWhen(value, now) : "";

  return (
    <div ref={setBox} className="tasks-when desk-input relative flex h-9 items-center gap-2" data-tone={open ? undefined : tone} aria-expanded={open}>
      <span aria-hidden className="tasks-ico tasks-when-icon shrink-0">
        <CalendarClock size={15} strokeWidth={2} />
      </span>
      <input
        value={text ?? shown}
        placeholder={emptyText}
        onChange={(event) => {
          setText(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onMouseDown={() => {
          if (!open) setOpen(true);
        }}
        onBlur={(event) => {
          // the exact picker at the foot of the list takes the focus: the list stays
          if (inside.current?.contains(event.relatedTarget as Node | null)) return;
          close();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return setOpen(true);
            // −1 — the typed words; then the presets, round
            const down = event.key === "ArrowDown";
            setActive((index) => (down ? (index + 1 >= presets.length ? -1 : index + 1) : index <= -1 ? presets.length - 1 : index - 1));
          } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            if (!open) return setOpen(true);
            if (active >= 0 && presets[active]) apply(presets[active].iso);
            else if (understood) apply(typed ?? null);
          } else if (event.key === "Tab" && open) {
            // words understood are kept on the way out; anything else leaves the value as it was
            if (text?.trim() && understood) onChange(typed ?? null);
            close();
          }
        }}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        data-testid={testId}
        className={`min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none ${value && text === null ? "nums" : ""} ${tone === "danger" ? "placeholder:text-danger" : "placeholder:text-muted"}`}
      />
      {heard && text === null ? (
        <span className="tasks-heard-chip max-w-[45%] shrink truncate text-[12px] leading-4 text-muted" title={`Услышал: «${heard}»`}>
          „{heard}“
        </span>
      ) : null}
      <span aria-hidden className="pointer-events-none shrink-0 text-muted">
        <Chevron />
      </span>
      <Popover open={open} onClose={close} anchor={box} width={300} matchAnchor track label={label}>
        <div ref={inside}>
          {text?.trim() ? (
            <p className="border-b border-border/70 px-3 py-2 text-[13px] leading-5" data-testid="when-preview">
              {understood ? (
                <>
                  <span className="text-muted">Будет: </span>
                  <span className="font-semibold">{typed ? formatWhen(typed, now) : "без срока"}</span>
                  <span className="float-right">
                    <Kbd>Enter</Kbd>
                  </span>
                </>
              ) : (
                <span className="text-muted">Не понял. Например: «завтра 15», «пт», «12.11 10:00»</span>
              )}
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label={label} className="py-1">
            {presets.map((preset, index) => {
              const on = index === active;
              return (
                <li
                  key={preset.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={on}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => apply(preset.iso)}
                  onMouseMove={() => {
                    if (!on) setActive(index);
                  }}
                  className={`flex h-8 cursor-default items-center gap-2 px-3 text-[14px] leading-5 ${on ? "bg-surface-2" : ""}`}
                >
                  <span className="min-w-0 flex-1">{preset.label}</span>
                  <span className="nums shrink-0 text-[12px] text-muted">{preset.iso ? formatWhen(preset.iso, now) : ""}</span>
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-2 border-t border-border/70 px-3 py-2 text-[12px] leading-4 text-muted">
            Точно
            <input
              type="datetime-local"
              value={toLocalInput(value)}
              onChange={(event) => {
                const iso = fromLocalInput(event.target.value);
                if (iso) onChange(iso);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  close();
                }
              }}
              onBlur={(event) => {
                if (!box?.contains(event.relatedTarget as Node | null) && !inside.current?.contains(event.relatedTarget as Node | null)) close();
              }}
              aria-label={`${label}: дата и время`}
              className="desk-input h-8 min-w-0 flex-1 px-2 text-[13px] text-text"
            />
          </label>
        </div>
      </Popover>
    </div>
  );
}
