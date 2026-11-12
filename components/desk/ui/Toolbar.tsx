"use client";

import { Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import {
  Children,
  forwardRef,
  Fragment,
  isValidElement,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";

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

type Choice = { value: string; label: ReactNode; text: string; disabled: boolean };

/** The words of a node: an option's label for type-ahead and titles. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** The `<option>`s a caller wrote, through arrays and fragments. */
function choicesOf(children: ReactNode): Choice[] {
  const out: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    if (child.type === "option") {
      out.push({ value: String(props.value ?? textOf(props.children)), label: props.children, text: textOf(props.children), disabled: Boolean(props.disabled) });
    } else if (child.type === Fragment) {
      out.push(...choicesOf(props.children));
    }
  });
  return out;
}

/**
 * A choice of a few (D-174): the desk's own list instead of the system's — a field with the chosen
 * word and a chevron, and under it a glass list with a tick at the chosen one; ↑/↓, Enter, Esc and
 * the first letters work as in a select. The caller writes a plain `<select>`'s props and
 * `<option>`s: the real select stays inside, unseen, and carries the value, `onChange`, the label
 * and the test id — a pick sets it and fires its own `change`, so every screen and every check
 * (`selectOption`) works as before.
 */
export function Select({ className = "", children, value, defaultValue, onChange, disabled, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null);
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // the native select may change on its own (a check's `selectOption`, an uncontrolled default)
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const choices = choicesOf(children);
  const current = value !== undefined ? String(value) : (native.current?.value ?? (defaultValue !== undefined ? String(defaultValue) : (choices[0]?.value ?? "")));
  const chosenAt = Math.max(0, choices.findIndex((choice) => choice.value === current));
  const chosen = choices[chosenAt];
  const block = /(^|\s)w-full(\s|$)/.test(className);
  const label = rest["aria-label"];

  const pick = (next: string) => {
    setOpen(false);
    button?.focus({ preventScroll: true });
    const el = native.current;
    if (!el || el.value === next) return;
    el.value = next;
    // React hears a select's own `change`: the caller's onChange runs as if the system list had been used
    el.dispatchEvent(new Event("change", { bubbles: true }));
    redraw();
  };
  const show = () => {
    setActive(chosenAt);
    setOpen(true);
  };
  const step = (from: number, by: number) => {
    for (let i = 1; i <= choices.length; i += 1) {
      const at = (from + by * i + choices.length * 4) % choices.length;
      if (!choices[at]?.disabled) return at;
    }
    return from;
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return show();
      setActive((at) => step(at, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) return show();
      const choice = choices[active];
      if (choice && !choice.disabled) pick(choice.value);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActive(event.key === "Home" ? step(-1, 1) : step(choices.length, -1));
      return;
    }
    // the first letters find a choice, as in the system's list
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + event.key.toLowerCase(), at: now };
      const found = choices.findIndex((choice) => !choice.disabled && choice.text.toLowerCase().startsWith(typed.current.text));
      if (found >= 0) {
        if (open) setActive(found);
        else pick(choices[found].value);
      }
    }
  };

  return (
    <span className={`desk-select relative inline-flex max-w-full align-middle ${block ? "w-full" : ""}`} data-open={open ? "" : undefined}>
      <select
        ref={native}
        {...rest}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(event) => {
          onChange?.(event);
          redraw();
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="desk-select-native"
      >
        {children}
      </select>
      <button
        ref={setButton}
        type="button"
        disabled={disabled}
        // the select-only combobox of WAI-ARIA: the focus stays here, the list says which choice is active
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        title={rest.title ?? (label ? `${label}: ${chosen?.text ?? ""}` : undefined)}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`field desk-select-button flex h-9 cursor-pointer items-center gap-2 pl-3 pr-2.5 text-left text-[14px] leading-5 disabled:cursor-default disabled:opacity-50 ${className}`}
        data-select-for={rest.id}
      >
        <span className="min-w-0 flex-1 truncate">{chosen?.label ?? ""}</span>
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden className="desk-select-chevron shrink-0" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={button} matchAnchor role="presentation" className="desk-select-pop">
        <div id={listId} role="listbox" aria-label={label} className="flex max-h-[min(60vh,360px)] flex-col overflow-y-auto p-1">
          {choices.map((choice, index) => {
            const on = index === chosenAt;
            return (
              <button
                key={`${choice.value}:${index}`}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={on}
                disabled={choice.disabled}
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(choice.value)}
                className="desk-select-option flex h-8 w-full shrink-0 items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] leading-4 disabled:opacity-40"
                data-active={index === active ? "" : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                {on ? <Check size={14} strokeWidth={2.5} aria-hidden className="shrink-0 text-accent" /> : <span aria-hidden className="w-[14px] shrink-0" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </span>
  );
}

export type Segment<V extends string> = { value: V; label: ReactNode; count?: number };

/** The chosen tab's plate glides to the next one (D-171): a spring without overshoot. */
const SEG_GLIDE = { type: "spring", stiffness: 560, damping: 44, mass: 0.8 } as const;

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
  // one plate per control: two tab rows on a screen never pull each other's plate
  const glide = `seg-${useId()}`;
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
            className={`desk-focus relative flex h-8 items-center gap-1.5 rounded-[9px] px-3 font-display text-[13px] font-semibold leading-4 outline-none transition-colors duration-[120ms] ${
              active ? "seg-thumb text-text" : "text-muted hover:text-text"
            }`}
          >
            {/* «Графит»: the plate under the chosen tab, one element gliding between them (graphite.css) */}
            {active ? <motion.span layoutId={glide} aria-hidden className="seg-glider" transition={SEG_GLIDE} /> : null}
            <span className="relative z-[1] inline-flex items-center gap-1.5">
              {item.label}
              {item.count !== undefined ? <span className={`nums text-[12px] ${active ? "text-accent" : "text-muted"}`}>{item.count}</span> : null}
            </span>
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
