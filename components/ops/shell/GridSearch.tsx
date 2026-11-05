"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { SearchField } from "@/components/desk/ui/Toolbar";

/**
 * A filter that lives in the address: typing stays local and instant, the address follows it, so a
 * reload, «назад» and a link sent to a colleague keep it. Wants a Suspense boundary, as
 * `useSearchParams` does.
 */
export function useUrlText(name: string): [string, (value: string) => void] {
  const params = useSearchParams();
  const [text, setText] = useState(() => params.get(name) ?? "");
  const set = useCallback(
    (value: string) => {
      setText(value);
      const url = new URL(window.location.href);
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
      window.history.replaceState(window.history.state, "", url);
    },
    [name],
  );
  return [text, set];
}

/** The screen's table takes the keys: the one place with arrows and letters. */
export function focusGrid() {
  document.querySelector<HTMLElement>('#desk-main [role="grid"]')?.focus({ preventScroll: true });
}

/**
 * A search over the screen's table, the way the hands go: type, ↓ into the rows, Enter for what
 * was found. «/» anywhere on the screen comes here (OpsFrame finds it by `data-ops-search`).
 */
export function GridSearch({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  width,
  onDown,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  width?: number;
  /** ↓ from the field: pick the first row, the focus goes to the table. */
  onDown?: () => void;
  onEnter?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName !== "INPUT") return;
    if (event.code === "ArrowDown" && onDown) {
      event.preventDefault();
      onDown();
      focusGrid();
    } else if ((event.code === "Enter" || event.code === "NumpadEnter") && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };

  return (
    <div data-ops-search onKeyDown={onKeyDown}>
      <SearchField ref={input} value={value} onChange={onChange} placeholder={placeholder} aria-label={label} width={width} />
    </div>
  );
}
