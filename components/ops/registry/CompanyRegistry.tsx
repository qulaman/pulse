"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { ageLabel, isAlarmed, queueStuck } from "@/components/ops/registry/alarm";
import { OpsFailure } from "@/components/ops/shell/failure";
import { When } from "@/components/ops/shell/When";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { CompanyRow } from "@/lib/ops/contract";
import { useCompanies } from "@/lib/ops/queries";
import { pluralRu } from "@/lib/tasks/status-text";

const NEW_COMPANY = "btn-primary inline-flex h-9 items-center rounded-[11px] px-4 font-display text-[14px] font-semibold leading-4 text-bg transition-transform duration-[120ms] active:scale-[0.98]";

function byTime(pick: (row: CompanyRow) => string | null) {
  return (a: CompanyRow, b: CompanyRow) => (pick(a) ?? "").localeCompare(pick(b) ?? "");
}

const COLUMNS: Column<CompanyRow>[] = [
  {
    key: "name",
    title: "Компания",
    sort: (a, b) => a.name.localeCompare(b.name, "ru"),
    render: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium" title={row.name}>
          {row.name}
        </p>
        {row.slug ? <p className="truncate text-[12px] leading-4 text-muted">{row.slug}</p> : null}
      </div>
    ),
  },
  {
    key: "active",
    title: <span title="Заходили за 7 дней / всего людей">Активны</span>,
    width: "100px",
    align: "right",
    sort: (a, b) => a.active_7d - b.active_7d,
    render: (row) => (
      <span className="nums whitespace-nowrap">
        {row.active_7d} <span className="text-muted">/ {row.people}</span>
      </span>
    ),
  },
  {
    key: "seen",
    title: <span title="Последний вход">Вход</span>,
    width: "108px",
    sort: byTime((row) => row.last_seen_at),
    render: (row) => <When iso={row.last_seen_at} />,
  },
  {
    key: "parse",
    title: <span title="Последний разбор">Разбор</span>,
    width: "108px",
    sort: byTime((row) => row.last_parse_at),
    render: (row) => <When iso={row.last_parse_at} />,
  },
  {
    key: "errors",
    title: <span title="Ошибки разбора за сутки">Ошибки</span>,
    width: "96px",
    align: "right",
    sort: (a, b) => a.parse_errors_24h - b.parse_errors_24h,
    render: (row) => <Num value={row.parse_errors_24h} tone="danger" />,
  },
  {
    key: "queue",
    title: <span title="Сколько ждёт доставки и как давно">Очередь</span>,
    width: "112px",
    align: "right",
    sort: (a, b) => a.queue_depth - b.queue_depth,
    render: (row) => {
      const stuck = queueStuck(row);
      return (
        <span className="whitespace-nowrap">
          <Num value={row.queue_depth} tone={stuck ? "warn" : null} />
          {row.queue_age_seconds !== null && row.queue_depth > 0 ? <span className={`text-[12px] ${stuck ? "text-warn" : "text-muted"}`}> · {ageLabel(row.queue_age_seconds)}</span> : null}
        </span>
      );
    },
  },
  {
    key: "failed",
    title: <span title="Упавшие доставки за 7 дней">Упало</span>,
    width: "84px",
    align: "right",
    sort: (a, b) => a.failed_7d - b.failed_7d,
    render: (row) => <Num value={row.failed_7d} tone="warn" />,
  },
];

function RegistrySkeleton() {
  return (
    <SkeletonGroup grow>
      <Bone h={420} className="rounded-[12px]" />
    </SkeletonGroup>
  );
}

function stateLine(rows: CompanyRow[] | undefined, loading: boolean, alarmed: number) {
  if (loading) return { text: "Смотрю, как дела" };
  if (!rows || rows.length === 0) return null;
  const total = `${rows.length} ${pluralRu(rows.length, ["компания", "компании", "компаний"])}`;
  return alarmed > 0
    ? { text: `${total}, ${alarmed} ${pluralRu(alarmed, ["просит", "просят", "просят"])} внимания`, tone: "warn" as const }
    : { text: `${total}, всё спокойно`, tone: "ok" as const };
}

/** The registry itself, fed by props: the sandbox draws each of its states without a base. */
export function RegistryView({
  rows,
  loading,
  error,
  onRetry,
  onOpen,
}: {
  rows: CompanyRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (row: CompanyRow) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // what asks for attention stands on top; a click on a column's title sorts as usual
  const ordered = useMemo(() => (rows ? [...rows].sort((a, b) => Number(isAlarmed(b)) - Number(isAlarmed(a))) : []), [rows]);
  const alarmed = useMemo(() => ordered.filter(isAlarmed).length, [ordered]);
  const failed = !rows && Boolean(error);

  return (
    <DeskPage>
      <PageTitle
        title="Компании"
        state={failed ? null : stateLine(rows, loading, alarmed)}
        light={rows && rows.length > 0 ? (alarmed > 0 ? "warn" : "ok") : null}
        actions={
          <Link href="/ops/new" className={NEW_COMPANY} data-testid="ops-new-company">
            Новая компания
          </Link>
        }
      />
      {failed ? (
        <OpsFailure error={error} onRetry={onRetry} />
      ) : loading ? (
        <RegistrySkeleton />
      ) : (
        <DataGrid
          aria-label="Компании"
          columns={COLUMNS}
          rows={ordered}
          rowKey={(row) => row.id}
          selectedKey={selected}
          onSelect={(row) => setSelected(row.id)}
          onRowClick={onOpen}
          onActivate={onOpen}
          rowTone={(row) => (isAlarmed(row) ? "warn" : null)}
          empty={
            <EmptyState
              title="Компаний пока нет"
              hint="Заведи первую: название, директор и его код входа."
              action={
                <Link href="/ops/new" className={NEW_COMPANY}>
                  Новая компания
                </Link>
              }
            />
          }
        />
      )}
    </DeskPage>
  );
}

export function CompanyRegistry() {
  const router = useRouter();
  const companies = useCompanies();
  // a double click is two clicks and an Enter's worth of «open»: one trip, one history entry
  const leaving = useRef(false);
  const open = (row: CompanyRow) => {
    if (leaving.current) return;
    leaving.current = true;
    router.push(`/ops/c/${row.id}`);
  };
  return (
    <RegistryView
      rows={companies.data}
      loading={companies.isPending}
      error={companies.error}
      onRetry={() => void companies.refetch()}
      onOpen={open}
    />
  );
}
