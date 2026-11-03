"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";

export type Column<T> = {
  key: string;
  title: ReactNode;
  /** CSS width of the column: `120px`, `20%`; none — it takes what is left. */
  width?: string;
  align?: "left" | "right" | "center";
  /** A column with a comparator sorts by a click on its title. */
  sort?: (a: T, b: T) => number;
  render: (row: T) => ReactNode;
};

export type Group<T> = { key: string; title: ReactNode; tone?: Tone; rows: T[] };

type Props<T> = {
  columns: Column<T>[];
  /** Flat rows; ignored when `groups` is given. */
  rows?: T[];
  groups?: Group<T>[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onSelect?: (row: T) => void;
  /** Enter or a double click. */
  onActivate?: (row: T) => void;
  /** A mouse click on the row, not on a control inside it — the arrows only move the choice. */
  onRowClick?: (row: T) => void;
  /** The coloured strip on a row's left edge — the state it is in. */
  rowTone?: (row: T) => Tone | null | undefined;
  /** A row that has just changed (Realtime): it glows for a moment. */
  rowHighlightKey?: string | null;
  empty: ReactNode;
  /** Keys handled by the screen while the table has focus (A, R, O…); return true when used. */
  onKey?: (event: KeyboardEvent<HTMLDivElement>, row: T | null) => boolean;
  "aria-label"?: string;
  className?: string;
};

type SortState = { key: string; dir: 1 | -1 } | null;

const HIGHLIGHT_MS = 1200;

/**
 * The desk's table (D-153 §3): a sticky head, one sortable column at a time (a click on its
 * title, again — the other way), group titles as full-width rows in the language of the phone's
 * `Section`, a selected row with a focus ring, ↑/↓ while the table has focus, Enter or a double
 * click to open. A row that changed glows in the accent for 1.2 s. No virtualisation — the
 * desk's lists stay under 500 rows.
 */
export function DataGrid<T>({
  columns,
  rows,
  groups,
  rowKey,
  selectedKey = null,
  onSelect,
  onActivate,
  onRowClick,
  rowTone,
  rowHighlightKey,
  empty,
  onKey,
  className = "",
  ...aria
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const body = useRef<HTMLDivElement>(null);

  const shownGroups = useMemo<Group<T>[]>(() => {
    const all = groups ?? [{ key: "_all", title: null, rows: rows ?? [] }];
    const compare = sort ? columns.find((c) => c.key === sort.key)?.sort : undefined;
    if (!sort || !compare) return all;
    return all.map((group) => ({ ...group, rows: [...group.rows].sort((a, b) => compare(a, b) * sort.dir) }));
  }, [groups, rows, columns, sort]);
  const flat = useMemo(() => shownGroups.flatMap((group) => group.rows), [shownGroups]);

  // the glow plays once per change, then the row is plain again
  const [glow, setGlow] = useState<string | null>(null);
  useEffect(() => {
    if (!rowHighlightKey) return;
    const start = setTimeout(() => setGlow(rowHighlightKey), 0);
    const stop = setTimeout(() => setGlow(null), HIGHLIGHT_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [rowHighlightKey]);

  // the selected row stays in sight when the keys move it
  useEffect(() => {
    if (!selectedKey) return;
    const row = body.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(selectedKey)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const template = columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = flat.findIndex((row) => rowKey(row) === selectedKey);
    const current = at >= 0 ? flat[at] : null;
    if (onKey?.(event, current)) return;
    if (event.code === "ArrowDown" || event.code === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      const next = event.code === "ArrowDown" ? Math.min(flat.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
      onSelect?.(flat[next]);
    } else if (event.code === "Enter" || event.code === "NumpadEnter") {
      if (!current) return;
      event.preventDefault();
      onActivate?.(current);
    }
  };

  if (flat.length === 0) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div
      role="grid"
      aria-label={aria["aria-label"]}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`desk-grid rounded-[12px] border border-border outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${className}`}
    >
      <div
        role="row"
        className="sticky top-0 z-[1] grid border-b border-border bg-surface-2/95 backdrop-blur-sm"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((column) => {
          const sorted = sort?.key === column.key ? sort.dir : 0;
          const head = (
            <span className={`flex items-center gap-1 ${column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : ""}`}>
              {column.title}
              {column.sort ? (
                <span aria-hidden className={`text-[10px] ${sorted ? "text-accent" : "text-muted/40"}`}>
                  {sorted === -1 ? "▼" : "▲"}
                </span>
              ) : null}
            </span>
          );
          return (
            <div
              key={column.key}
              role="columnheader"
              aria-sort={sorted === 1 ? "ascending" : sorted === -1 ? "descending" : undefined}
              className="min-w-0 px-3 py-2 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted"
            >
              {column.sort ? (
                <button
                  type="button"
                  className="w-full text-left uppercase transition-colors duration-[120ms] hover:text-text"
                  onClick={() =>
                    setSort((prev) => (prev?.key === column.key ? (prev.dir === 1 ? { key: column.key, dir: -1 } : null) : { key: column.key, dir: 1 }))
                  }
                >
                  {head}
                </button>
              ) : (
                head
              )}
            </div>
          );
        })}
      </div>
      <div ref={body} role="rowgroup">
        {shownGroups.map((group) =>
          group.rows.length === 0 ? null : (
            <Fragment key={group.key}>
              {group.title ? (
                <div role="row" className="flex items-center gap-2 border-b border-border/70 bg-bg/40 px-3 pb-1.5 pt-3">
                  {group.tone ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[group.tone] }} /> : null}
                  <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{group.title}</span>
                  <span className="nums text-[12px] leading-4 text-muted/70">{group.rows.length}</span>
                </div>
              ) : null}
              {group.rows.map((row) => {
                const key = rowKey(row);
                const selected = key === selectedKey;
                const tone = rowTone?.(row);
                return (
                  <div
                    key={key}
                    role="row"
                    aria-selected={selected}
                    data-row-key={key}
                    data-testid="desk-row"
                    data-glow={glow === key ? "" : undefined}
                    className="desk-row relative grid min-h-[40px] cursor-default items-center border-b border-border/50 last:border-b-0"
                    style={{ gridTemplateColumns: template }}
                    onClick={(event) => {
                      onSelect?.(row);
                      // the row's own buttons and links keep their click
                      if (onRowClick && !(event.target as Element).closest("button, a, input, select, textarea, label")) onRowClick(row);
                    }}
                    onDoubleClick={() => onActivate?.(row)}
                  >
                    {tone ? <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r-full" style={{ background: TONE_VAR[tone] }} /> : null}
                    {columns.map((column) => (
                      <div
                        key={column.key}
                        role="gridcell"
                        className={`min-w-0 px-3 py-2 text-[14px] leading-5 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""}`}
                      >
                        {column.render(row)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ),
        )}
      </div>
    </div>
  );
}
