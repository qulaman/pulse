"use client";

import { Bone } from "@/components/ui/Skeleton";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Chip } from "@/components/ui/Chip";
import { formatAqtobe } from "@/lib/ai/time";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type Column = {
  key: string;
  label: string;
  kind?: "text" | "time" | "id" | "json" | "number" | "bool";
  width?: number;
};

export type TableSpec = {
  table: string;
  title: string;
  hint: string;
  orderBy: string;
  ascending?: boolean;
  columns: Column[];
};

type Row = Record<string, unknown>;

const PAGE = 50;

function Cell({ value, kind }: { value: unknown; kind: Column["kind"] }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  switch (kind) {
    case "time": {
      const date = new Date(String(value));
      return <span className="nums whitespace-nowrap">{Number.isNaN(date.getTime()) ? String(value) : formatAqtobe(date)}</span>;
    }
    case "id": {
      const text = String(value);
      return (
        <span className="nums font-mono text-[12px]" title={text}>
          {text.slice(0, 8)}
        </span>
      );
    }
    case "json": {
      const text = JSON.stringify(value);
      if (text === "{}" || text === "[]" || text === "null") return <span className="text-muted">{text}</span>;
      return (
        <details>
          <summary className="cursor-pointer whitespace-nowrap text-accent">
            {text.length > 40 ? `${text.slice(0, 40)}…` : text}
          </summary>
          <pre className="mt-1 max-h-64 max-w-[420px] overflow-auto whitespace-pre-wrap rounded-[8px] bg-bg p-2 text-[11px] leading-4">
            {JSON.stringify(value, null, 2)}
          </pre>
        </details>
      );
    }
    case "bool":
      return <span style={{ color: value ? "var(--ok)" : "var(--text-muted)" }}>{value ? "да" : "нет"}</span>;
    case "number":
      return <span className="nums">{String(value)}</span>;
    default: {
      const text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
      return (
        <span className="block max-w-[320px] truncate" title={text}>
          {text}
        </span>
      );
    }
  }
}

export function DataTable({ spec }: { spec: TableSpec }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");

  const query = useQuery({
    queryKey: ["admin", spec.table, page],
    queryFn: async (): Promise<{ rows: Row[]; total: number }> => {
      const supabase = createBrowserSupabase();
      const from = page * PAGE;
      const { data, error, count } = await supabase
        .from(spec.table as never)
        .select("*", { count: "exact" })
        .order(spec.orderBy, { ascending: spec.ascending ?? false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as Row[], total: count ?? 0 };
    },
  });

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [query.data, filter]);

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className="rounded-[16px] border border-border bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <h2 className="text-[19px] font-semibold leading-6">
            {spec.title} <span className="nums text-[13px] text-muted">{total}</span>
          </h2>
          <p className="mt-0.5 text-[13px] leading-4 text-muted">
            {spec.hint} · <code className="text-[12px]">{spec.table}</code>
          </p>
        </div>
        <input
          type="search"
          placeholder="Фильтр по странице…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-h-[40px] w-full max-w-[240px] rounded-[12px] border border-border bg-surface-2 px-3 text-[14px] outline-none focus:border-accent"
        />
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[640px] text-left text-[13px] leading-4">
          <thead className="bg-surface-2 text-muted">
            <tr>
              {spec.columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-3 py-2 font-medium" style={col.width ? { minWidth: col.width } : undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              Array.from({ length: 6 }, (_, r) => (
                <tr key={r} className="skeleton border-t border-border" aria-hidden>
                  {spec.columns.map((col, c) => (
                    <td key={col.key} className="px-3 py-2">
                      <Bone h={16} w={["60%", "80%", "40%", "70%"][(r + c) % 4]} />
                    </td>
                  ))}
                </tr>
              ))
            ) : query.error ? (
              <tr>
                <td colSpan={spec.columns.length} className="px-3 py-6 text-center text-danger">
                  {query.error instanceof Error ? query.error.message : "Ошибка"}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={spec.columns.length} className="px-3 py-6 text-center text-muted">Пусто</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={String(row.id ?? row.seq ?? i)} className="border-t border-border/60 align-top odd:bg-bg/30">
                  {spec.columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      <Cell value={row[col.key]} kind={col.kind} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <Chip tone="neutral" onClick={() => setPage((p) => Math.max(0, p - 1))}>← Назад</Chip>
          <span className="nums text-[13px] text-muted">
            {page + 1} / {pages}
          </span>
          <Chip tone="neutral" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Дальше →</Chip>
        </div>
      ) : null}
    </section>
  );
}
