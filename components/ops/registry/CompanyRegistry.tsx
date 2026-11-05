"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { ageLabel, alarmWhy, isAlarmed, queueStuck } from "@/components/ops/registry/alarm";
import { TableBones } from "@/components/ops/shell/Bones";
import { OpsFailure } from "@/components/ops/shell/failure";
import { focusGrid, GridSearch, useUrlText } from "@/components/ops/shell/GridSearch";
import { When } from "@/components/ops/shell/When";
import { Button } from "@/components/ui/Button";
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
        {alarmWhy(row) ? (
          <p className="ops-sub truncate text-warn" title={alarmWhy(row) ?? undefined}>
            {alarmWhy(row)}
          </p>
        ) : row.slug ? (
          <p className="ops-data ops-sub truncate">{row.slug}</p>
        ) : null}
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
    title: <span title="Когда кто-то из компании был в приложении последний раз">Были</span>,
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
    title: <span title="Уведомления, которые не дошли за 7 дней">Не дошло</span>,
    width: "96px",
    align: "right",
    sort: (a, b) => a.failed_7d - b.failed_7d,
    render: (row) => <Num value={row.failed_7d} tone="warn" />,
  },
];

function stateLine(rows: CompanyRow[] | undefined, loading: boolean, alarmed: number, stale: boolean) {
  if (loading) return { text: "Смотрю, как дела" };
  if (!rows || rows.length === 0) return null;
  if (stale) return { text: "Не обновилось: числа ниже могли устареть", tone: "warn" as const };
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
  query,
  onQuery,
}: {
  rows: CompanyRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (row: CompanyRow) => void;
  /** The search lives in the address on the real screen, in the view in the sandbox. */
  query?: string;
  onQuery?: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [ownQuery, setOwnQuery] = useState("");
  const text = query ?? ownQuery;
  const setText = onQuery ?? setOwnQuery;
  // what asks for attention stands on top; a click on a column's title sorts as usual
  const ordered = useMemo(() => (rows ? [...rows].sort((a, b) => Number(isAlarmed(b)) - Number(isAlarmed(a))) : []), [rows]);
  const alarmed = useMemo(() => ordered.filter(isAlarmed).length, [ordered]);
  const failed = !rows && Boolean(error);
  const words = text.trim().toLowerCase();
  const shown = useMemo(() => (words ? ordered.filter((row) => [row.name, row.slug, row.id].some((value) => value?.toLowerCase().includes(words))) : ordered), [ordered, words]);
  const pickFirst = () => {
    if (shown[0]) setSelected(shown[0].id);
  };
  // the one found opens at once, several hand the keys to the table
  const enter = () => {
    if (shown.length === 1) onOpen(shown[0]);
    else if (shown.length > 1) {
      pickFirst();
      focusGrid();
    }
  };

  return (
    <DeskPage>
      <PageTitle
        title="Компании"
        state={failed ? null : stateLine(rows, loading, alarmed, Boolean(error))}
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
        <TableBones rows={4} rowHeight={45} />
      ) : (
        <>
        {ordered.length > 1 ? <GridSearch value={text} onChange={setText} placeholder="Название, адрес или номер компании" label="Поиск компании" width={340} autoFocus onDown={pickFirst} onEnter={enter} /> : null}
        <DataGrid
          aria-label="Компании"
          columns={COLUMNS}
          rows={shown}
          rowKey={(row) => row.id}
          selectedKey={selected}
          onSelect={(row) => setSelected(row.id)}
          onRowClick={onOpen}
          onActivate={onOpen}
          rowTone={(row) => (isAlarmed(row) ? "warn" : null)}
          empty={
            words ? (
              <EmptyState
                title="Такой компании нет"
                hint="Проверь написание. Удалённые компании остаются только в журнале."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setText("")}>
                    Очистить поиск
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Компаний пока нет"
                hint="Заведи первую: название, директор и его код входа."
                action={
                  <Link href="/ops/new" className={NEW_COMPANY}>
                    Новая компания
                  </Link>
                }
              />
            )
          }
        />
        </>
      )}
    </DeskPage>
  );
}

export function CompanyRegistry() {
  const router = useRouter();
  const companies = useCompanies();
  const [query, setQuery] = useUrlText("q");
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
      query={query}
      onQuery={setQuery}
    />
  );
}
