"use client";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { TableBones } from "@/components/ops/shell/Bones";
import { OpsFailure } from "@/components/ops/shell/failure";
import { When } from "@/components/ops/shell/When";
import { whenAqtobe } from "@/lib/lab/format";
import type { OperatorRow } from "@/lib/ops/contract";
import { useOperators } from "@/lib/ops/queries";

const COLUMNS: Column<OperatorRow>[] = [
  {
    key: "email",
    title: "Почта",
    sort: (a, b) => (a.email ?? "").localeCompare(b.email ?? ""),
    render: (row) => (
      <span className="ops-data block truncate" title={row.email ?? undefined}>
        {row.email ?? "Без почты"}
      </span>
    ),
  },
  {
    key: "note",
    title: "Заметка",
    render: (row) => (
      <span className="block truncate text-muted" title={row.note ?? undefined}>
        {row.note ?? "—"}
      </span>
    ),
  },
  { key: "created", title: "Выдан", width: "128px", sort: (a, b) => a.created_at.localeCompare(b.created_at), render: (row) => <When iso={row.created_at} /> },
  { key: "seen", title: "Вход", width: "128px", sort: (a, b) => (a.last_seen_at ?? "").localeCompare(b.last_seen_at ?? ""), render: (row) => <When iso={row.last_seen_at} /> },
  {
    key: "state",
    title: "Доступ",
    width: "172px",
    render: (row) =>
      row.revoked_at ? (
        <span className="whitespace-nowrap text-[13px] text-muted">Отозван {whenAqtobe(row.revoked_at)}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          Действует
        </span>
      ),
  },
];

/** The list itself, fed by props: the sandbox draws each of its states without a base. */
export function OperatorsView({ rows, loading, error, onRetry }: { rows: OperatorRow[] | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  return (
    <DeskPage>
      <PageTitle title="Разработчики" />
      {!rows && error ? (
        <OpsFailure error={error} onRetry={onRetry} />
      ) : loading ? (
        <TableBones rows={3} />
      ) : (
        <DataGrid
          aria-label="Разработчики"
          columns={COLUMNS}
          rows={rows ?? []}
          rowKey={(row) => row.user_id}
          rowTone={(row) => (row.revoked_at ? "muted" : null)}
          empty={<EmptyState title="Разработчиков нет" hint="Кто-то же открыл этот экран, значит, список не дошёл. Обнови страницу." />}
        />
      )}
      <p className="text-[13px] leading-5 text-muted" data-testid="ops-grant-hint">
        Доступ выдаётся командой <code className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text">pnpm ops:grant</code>, из интерфейса его не выдать.
      </p>
    </DeskPage>
  );
}

export function OperatorList() {
  const operators = useOperators();
  return <OperatorsView rows={operators.data} loading={operators.isPending} error={operators.error} onRetry={() => void operators.refetch()} />;
}
