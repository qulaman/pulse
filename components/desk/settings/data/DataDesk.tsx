"use client";

import { ChevronLeft, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

import type { Column, TableSpec } from "@/components/admin/DataTable";
import { usePageSearch } from "@/components/desk/settings/SettingsFrame";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { formatAqtobe } from "@/lib/ai/time";
import { formatNum } from "@/lib/desk/format";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useCompanyTable, type TableRow } from "@/lib/desk/settings-queries";
import { usePeople } from "@/lib/people/queries";

const SIZES = [50, 100, 200] as const;

/** The chosen table's line glides under the next tab: the toolbar's spring (D-171). */
const TAB_GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;
const WIDTH_STORE = "pulse:desk-data-widths:";
const MIN_WIDTH = 56;

/** Columns that hold a person's id: the grid shows the name, the id stays one hover away. */
const PERSON_KEYS = new Set(["assignee_id", "author_id", "sender_id", "user_id", "actor_id", "manager_id"]);

function defaultWidth(column: Column): number {
  if (column.width) return Math.max(column.width, 160);
  switch (column.kind) {
    case "time":
      return 140;
    case "id":
      return PERSON_KEYS.has(column.key) ? 150 : 100;
    case "number":
      return 96;
    case "bool":
      return 84;
    case "json":
      return 240;
    default:
      return 150;
  }
}

function readWidths(table: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(WIDTH_STORE + table);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The value as it would be copied: an id whole, JSON pretty, a time as stored. */
function rawText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function Cell({ value, column, names }: { value: unknown; column: Column; names: Map<string, string> }) {
  if (value === null || value === undefined) return <span className="text-muted/50">—</span>;
  switch (column.kind) {
    case "time": {
      const date = new Date(String(value));
      return <When>{Number.isNaN(date.getTime()) ? String(value) : formatAqtobe(date)}</When>;
    }
    case "id": {
      const text = String(value);
      const name = PERSON_KEYS.has(column.key) ? names.get(text) : undefined;
      return name ? (
        <span>
          {name} <span className="nums text-[11px] text-muted/70">{text.slice(0, 4)}</span>
        </span>
      ) : (
        <span className="nums text-[12px] text-muted">{text.slice(0, 8)}</span>
      );
    }
    case "json": {
      const text = JSON.stringify(value);
      return <span className={`nums text-[12px] ${text === "{}" || text === "[]" ? "text-muted/50" : ""}`}>{text}</span>;
    }
    case "bool":
      return <span className={value ? "" : "text-muted"}>{value ? "да" : "нет"}</span>;
    case "number":
      return <span className="nums">{typeof value === "number" ? formatNum(value) : String(value)}</span>;
    default:
      return <span>{Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}</span>;
  }
}

/** A record whole, in the right-hand panel: every field on its own line, an id with its person, JSON unfolded, each with «Копировать». */
function RecordPanel({ spec, row, names, field }: { spec: TableSpec; row: TableRow; names: Map<string, string>; field: string | null }) {
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast(`Скопировал ${what}`));
  };
  return (
    <div className="flex flex-col gap-4" data-testid="data-record">
      <div className="pr-10">
        <p className="desk-label uppercase">{spec.title} · запись</p>
        <code className="nums mt-1 block break-all text-[12px] leading-4 text-muted">{String(row.id ?? row.seq ?? row.client_request_id ?? "")}</code>
      </div>
      <dl className="desk-list">
        {spec.columns.map((column) => {
          const value = row[column.key];
          const name = column.kind === "id" && PERSON_KEYS.has(column.key) && value ? names.get(String(value)) : undefined;
          const text = rawText(value);
          return (
            <div key={column.key} className={`group py-1.5 ${field === column.key ? "bg-accent/[0.06] pl-2 shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
              <dt className="flex items-center justify-between gap-2 text-[12px] font-semibold leading-4 text-muted">
                <span>
                  {column.label} <code className="nums text-muted/60">{column.key}</code>
                </span>
                {text ? (
                  <button type="button" onClick={() => copy(text, column.label.toLowerCase())} className="text-[12px] text-muted opacity-0 transition-opacity duration-[120ms] hover:text-text focus-visible:opacity-100 group-hover:opacity-100">
                    Копировать
                  </button>
                ) : null}
              </dt>
              <dd className="mt-0.5 min-w-0 text-[13px] leading-[18px]">
                {value === null || value === undefined ? (
                  <span className="text-muted/50">—</span>
                ) : column.kind === "json" || (typeof value === "object" && value !== null) ? (
                  <pre className="nums max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4">{text}</pre>
                ) : column.kind === "time" ? (
                  <When>
                    {formatAqtobe(new Date(String(value)))} <span className="text-muted">· {String(value)}</span>
                  </When>
                ) : (
                  <span className="break-words">
                    {name ? <>{name} · </> : null}
                    <span className={column.kind === "id" ? "nums text-[12px]" : ""}>{text}</span>
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <Button size="sm" variant="secondary" className="self-start" onClick={() => copy(JSON.stringify(row, null, 2), "запись")} icon={<Copy size={14} strokeWidth={2} />}>
        Скопировать запись как JSON
      </Button>
    </div>
  );
}

type At = { row: number; col: number };

/**
 * One company table as a sheet (D-154 wave 3): its own scroll both ways under a sticky head, the
 * columns as wide as the mouse drags them (remembered per table, a double click on the edge puts
 * one back), a cell chosen with a click or the arrows, Ctrl+C copies it whole, Enter or a double
 * click opens the whole record on the right. Read-only, under the reader's RLS.
 */
function Sheet({ spec, rows, names, onOpen, openKey }: { spec: TableSpec; rows: TableRow[]; names: Map<string, string>; onOpen: (row: TableRow, field: string) => void; openKey: string | null }) {
  const [widths, setWidths] = useState<Record<string, number>>(() => readWidths(spec.table));
  const [at, setAt] = useState<At | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const widthOf = (column: Column) => widths[column.key] ?? defaultWidth(column);
  const total = spec.columns.reduce((sum, column) => sum + widthOf(column), 0);

  const keep = (next: Record<string, number>) => {
    setWidths(next);
    try {
      window.localStorage.setItem(WIDTH_STORE + spec.table, JSON.stringify(next));
    } catch {
      // storage off: the widths live until the page closes
    }
  };
  const drag = (column: Column) => (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const start = widthOf(column);
    let last = widths;
    const move = (e: MouseEvent) => {
      last = { ...widths, [column.key]: Math.max(MIN_WIDTH, Math.round(start + e.clientX - startX)) };
      setWidths(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      keep(last);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // the chosen cell stays in sight when the arrows move it
  useEffect(() => {
    if (!at) return;
    box.current?.querySelector<HTMLElement>(`[data-cell="${at.row}:${at.col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const cols = spec.columns.length;
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyC" && at) {
      // a selection of text is the browser's to copy
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      const column = spec.columns[at.col];
      const text = rawText(rows[at.row]?.[column.key]);
      void navigator.clipboard?.writeText(text).then(() => toast(text ? `Скопировал: ${column.label}` : "Ячейка пустая"));
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const step = moves[event.key];
    if (step) {
      event.preventDefault();
      const from = at ?? { row: 0, col: 0 };
      setAt(at ? { row: Math.min(rows.length - 1, Math.max(0, from.row + step[0])), col: Math.min(cols - 1, Math.max(0, from.col + step[1])) } : from);
    } else if (event.key === "Home") {
      event.preventDefault();
      setAt({ row: at?.row ?? 0, col: 0 });
    } else if (event.key === "End") {
      event.preventDefault();
      setAt({ row: at?.row ?? 0, col: cols - 1 });
    } else if (event.key === "Enter" && at && rows[at.row]) {
      event.preventDefault();
      onOpen(rows[at.row], spec.columns[at.col].key);
    }
  };

  return (
    <div
      ref={box}
      role="grid"
      aria-label={spec.title}
      aria-rowcount={rows.length}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="data-sheet"
      className="data-sheet no-bar relative overflow-auto border-t border-text outline-none focus-visible:border-accent"
      style={{ height: "calc(100dvh - 300px)", minHeight: 320 }}
    >
      <table className="border-separate border-spacing-0 text-left text-[13px] leading-[18px]" style={{ tableLayout: "fixed", width: total }}>
        <colgroup>
          {spec.columns.map((column) => (
            <col key={column.key} style={{ width: widthOf(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {spec.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={column.key}
                className="desk-label sticky top-0 z-[1] select-none border-b border-r border-b-text border-r-border/60 bg-bg px-2.5 py-1 uppercase last:border-r-0"
              >
                <span className="block truncate">{column.label}</span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ширина колонки ${column.label}`}
                  title="Потяните — ширина; двойной клик — как было"
                  onMouseDown={drag(column)}
                  onDoubleClick={() => {
                    const next = { ...widths };
                    delete next[column.key];
                    keep(next);
                  }}
                  className="absolute -right-1 top-0 z-[2] h-full w-2 cursor-col-resize hover:bg-text/30"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const key = String(row.id ?? row.seq ?? row.client_request_id ?? r);
            const open = openKey === key;
            return (
              <tr key={key} className={`${open ? "bg-accent/[0.07]" : ""} hover:bg-surface-2/40`}>
                {spec.columns.map((column, c) => {
                  const chosen = at?.row === r && at.col === c;
                  return (
                    <td
                      key={column.key}
                      data-cell={`${r}:${c}`}
                      onMouseDown={() => setAt({ row: r, col: c })}
                      onDoubleClick={() => onOpen(row, column.key)}
                      title={rawText(row[column.key]).slice(0, 400) || undefined}
                      className={`truncate border-b border-r border-border/50 px-2.5 py-[7px] last:border-r-0 ${column.kind === "number" ? "text-right" : ""} ${chosen ? "relative outline outline-2 -outline-offset-2 outline-accent" : ""}`}
                    >
                      <Cell value={row[column.key]} column={column} names={names} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const rowKeyOf = (row: TableRow, index: number) => String(row.id ?? row.seq ?? row.client_request_id ?? index);

/**
 * «Данные» on the desk (D-153, D-154 wave 3): the company's tables as they are, read-only, as a
 * sheet the mouse and the keys work — tabs of tables (←/→ while they have focus), a filter over the
 * page, pages of 50/100/200 with < and >, R to read again; the record whole on the right.
 */
export function DataDesk({ initialTable }: { initialTable: string | null }) {
  const [table, setTable] = useState(() => ADMIN_TABLES.find((t) => t.table === initialTable)?.table ?? ADMIN_TABLES[0].table);
  const spec = ADMIN_TABLES.find((t) => t.table === table) ?? ADMIN_TABLES[0];
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<(typeof SIZES)[number]>(50);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<{ key: string; row: TableRow; field: string } | null>(null);
  const query = useCompanyTable(spec, page, size);
  const people = usePeople();
  const search = useRef<HTMLInputElement>(null);
  usePageSearch(search);

  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.full_name])), [people.data]);
  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => {
      const text = JSON.stringify(row).toLowerCase();
      const who = Object.entries(row).some(([key, value]) => PERSON_KEYS.has(key) && typeof value === "string" && (names.get(value) ?? "").toLowerCase().includes(needle));
      return text.includes(needle) || who;
    });
  }, [query.data, filter, names]);
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? page * size + 1 : 0;
  const to = Math.min(total, (page + 1) * size);

  const pick = (next: string) => {
    setTable(next);
    setPage(0);
    setFilter("");
    setOpen(null);
    window.history.replaceState(null, "", `?table=${next}`);
  };

  // < > (the keys of «,» and «.») — pages, R — read again; outside a field. «[» is the shell's: it folds the navigation
  const latest = useRef({ pages, refetch: query.refetch });
  useEffect(() => {
    latest.current = { pages, refetch: query.refetch };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open")) return;
      if (event.code === "Comma") {
        event.preventDefault();
        setPage((p) => Math.max(0, p - 1));
      } else if (event.code === "Period") {
        event.preventDefault();
        setPage((p) => Math.min(latest.current.pages - 1, p + 1));
      } else if (event.code === "KeyR" && !event.shiftKey && !event.repeat) {
        event.preventDefault();
        void latest.current.refetch().then(() => toast("Таблица прочитана заново"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts("Данные", [
    { keys: ["← →", "↑ ↓"], label: "По ячейкам (в таблице); вкладки — ← → на них" },
    { keys: ["Enter"], label: "Открыть запись целиком справа" },
    { keys: ["Ctrl C"], label: "Скопировать ячейку целиком" },
    { keys: ["<", ">"], label: "Предыдущая · следующая страница" },
    { keys: ["R"], label: "Прочитать таблицу заново" },
  ]);

  const tabsKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = ADMIN_TABLES.findIndex((t) => t.table === table);
    const next = ADMIN_TABLES[(index + (event.key === "ArrowRight" ? 1 : ADMIN_TABLES.length - 1)) % ADMIN_TABLES.length];
    pick(next.table);
    requestAnimationFrame(() => event.currentTarget.querySelector<HTMLElement>(`[data-table="${next.table}"]`)?.focus());
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <PageTitle title="Данные" state={{ text: "таблицы компании как есть — только чтение" }} />
      <div role="tablist" aria-label="Таблицы" onKeyDown={tabsKey} className="data-tabs no-bar flex gap-4 overflow-x-auto" data-testid="data-tables">
        {ADMIN_TABLES.map((t) => {
          const active = t.table === table;
          return (
            <button
              key={t.table}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-table={t.table}
              onClick={() => pick(t.table)}
              className={`data-tab relative h-8 shrink-0 whitespace-nowrap text-[14px] leading-5 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
                active ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--text)]" : "text-muted hover:text-text"
              }`}
            >
              {active ? <motion.span layoutId="data-tab-line" aria-hidden className="data-tab-line" transition={TAB_GLIDE} /> : null}
              <span className="relative">{t.title}</span>
            </button>
          );
        })}
      </div>
      <Toolbar
        end={
          <>
            <span className="nums text-[13px] leading-5 text-muted" data-testid="data-range">
              {query.isPending ? "…" : `${formatNum(from)}–${formatNum(to)} из ${formatNum(total)}`}
            </span>
            <Button size="sm" variant="ghost" className="!px-2" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} title="Предыдущая страница · <" aria-label="Предыдущая страница">
              <ChevronLeft size={16} strokeWidth={2.25} aria-hidden />
            </Button>
            <Button size="sm" variant="ghost" className="!px-2" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} title="Следующая страница · >" aria-label="Следующая страница">
              <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
            </Button>
            <Select
              aria-label="Строк на странице"
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value) as (typeof SIZES)[number]);
                setPage(0);
              }}
              className="w-[120px]"
            >
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  по {n}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" loading={query.isFetching && !query.isPending} onClick={() => void query.refetch()} title="Прочитать заново · R" icon={<RefreshCw size={14} strokeWidth={2} />}>
              Обновить
            </Button>
          </>
        }
      >
        <SearchField ref={search} value={filter} onChange={setFilter} placeholder="Фильтр по странице" aria-label="Фильтр по странице" width={260} />
        <span className="min-w-0 flex-1 basis-0 truncate text-[13px] leading-5 text-muted" title={spec.hint}>
          {spec.hint} · <code className="nums text-[12px]">{spec.table}</code>
        </span>
      </Toolbar>

      {query.isPending ? (
        <div className="data-bone flex flex-col gap-2 border-t border-text py-3" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => (
            <Bone key={index} h={18} w={`${60 + ((index * 13) % 35)}%`} />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title="Таблица не прочиталась"
          hint={query.error instanceof Error ? query.error.message : "Проверьте связь и попробуйте ещё раз"}
          action={
            <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={filter.trim() ? "На этой странице такого нет" : "Таблица пуста"} hint={filter.trim() ? "Фильтр ищет только по открытой странице — листайте или снимите его" : undefined} />
      ) : (
        <Sheet key={spec.table} spec={spec} rows={rows} names={names} openKey={open?.key ?? null} onOpen={(row, field) => setOpen({ key: rowKeyOf(row, rows.indexOf(row)), row, field })} />
      )}
      {open ? (
        <InPanel panelKey={`data:${spec.table}:${open.key}`} onClose={() => setOpen(null)}>
          <RecordPanel spec={spec} row={open.row} names={names} field={open.field} />
        </InPanel>
      ) : null}
    </div>
  );
}
