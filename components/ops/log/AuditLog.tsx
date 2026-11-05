"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { ACTION_LABEL, actionText, auditFacts, auditHaystack, DANGEROUS, whoText, type AuditFact } from "@/components/ops/log/words";
import { TableBones } from "@/components/ops/shell/Bones";
import { OpsFailure, failureText } from "@/components/ops/shell/failure";
import { GridSearch, useUrlText } from "@/components/ops/shell/GridSearch";
import { Button } from "@/components/ui/Button";
import { whenAqtobe } from "@/lib/lab/format";
import { useCompanyCard } from "@/lib/ops/company-queries";
import type { AuditRow } from "@/lib/ops/contract";
import { useAudit, useCompanies } from "@/lib/ops/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** How deep a search reads on its own: one hundred rows a page. */
const DEEP_PAGES = 20;

const ROW_GRID = "grid grid-cols-[26px_100px_minmax(0,0.8fr)_156px_minmax(0,0.8fr)_minmax(0,1.5fr)] items-center";

function Payload({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const empty = !value || Object.keys(value).length === 0;
  return (
    <div className="min-w-0">
      <p className="ops-label mb-1">{title}</p>
      {empty ? (
        <p className="text-[13px] leading-5 text-muted/70">Пусто</p>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[6px] border border-border/60 bg-bg/60 px-3 py-2 font-mono text-[12px] leading-[18px]">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}

function FactValue({ fact, row, name }: { fact: AuditFact; row: AuditRow; name: (id: string) => string | null }) {
  if (fact.task) {
    return row.company_id ? (
      <Link href={`/ops/c/${row.company_id}?s=task&task=${fact.task}`} className="font-mono text-[12px] leading-5 underline underline-offset-2">
        {fact.task}
      </Link>
    ) : (
      <span className="font-mono text-[12px] leading-5">{fact.task}</span>
    );
  }
  if (fact.person) return <span title={fact.person}>{name(fact.person) ?? <span className="font-mono text-[12px] leading-5">{fact.person.slice(0, 8)}</span>}</span>;
  return <>{fact.value}</>;
}

/** An opened row: why, what it touched in words, the way to the company, and the row as the base keeps it. */
function AuditDetail({ row }: { row: AuditRow }) {
  // the names live on the company's card; a company that is gone leaves the ids
  const card = useCompanyCard(row.company_id ?? "", Boolean(row.company_id));
  const name = (id: string) => card.data?.people.find((person) => person.id === id)?.full_name ?? null;
  const facts = auditFacts(row);
  return (
    <div className="flex flex-col gap-3 border-t border-border/50 bg-bg/30 px-4 py-3" data-testid="ops-audit-detail">
      <p className="whitespace-pre-wrap break-words text-[14px] leading-5">{row.reason}</p>
      {facts.length > 0 ? (
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px] leading-5" data-testid="ops-audit-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-muted">{fact.label}</dt>
              <dd className="min-w-0 break-words">
                <FactValue fact={fact} row={row} name={name} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 text-[13px] leading-5">
        {card.data ? (
          <Link href={`/ops/c/${row.company_id}`} className="underline underline-offset-2">
            Открыть компанию
          </Link>
        ) : null}
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-muted">Как записано</summary>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <Payload title="Цель" value={row.target} />
            <Payload title="Результат" value={row.result} />
          </div>
        </details>
      </div>
    </div>
  );
}

function AuditLine({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const who = whoText(row);
  return (
    <li className="border-b border-border/50 last:border-b-0" data-testid="ops-audit-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`desk-row desk-focus ${ROW_GRID} w-full text-left text-[13px] leading-5`}>
        <span aria-hidden className="flex justify-center text-muted">
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform duration-[120ms] ${open ? "" : "-rotate-90"}`}>
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="nums whitespace-nowrap py-1.5 pr-3">{whenAqtobe(row.at)}</span>
        <span className="truncate py-1.5 pr-3 text-muted" title={who}>
          {who}
        </span>
        <span className={`truncate py-1.5 pr-3 font-medium ${DANGEROUS.has(row.action) ? "text-warn" : ""}`}>{actionText(row.action)}</span>
        <span className="truncate py-1.5 pr-3 text-[var(--ops-text-2)]" title={row.company_name ?? undefined}>
          {row.company_name ?? <span className="text-muted/60">—</span>}
        </span>
        <span className="truncate py-1.5 pr-3 text-muted" title={row.reason}>
          {row.reason}
        </span>
      </button>
      {open ? <AuditDetail row={row} /> : null}
    </li>
  );
}

function LogHead() {
  return (
    <div className={`ops-table-head ${ROW_GRID} sticky top-0 z-[1] border-b border-border font-semibold uppercase text-muted`}>
      <span aria-hidden />
      <span className="py-1.5 pr-3">Когда</span>
      <span className="py-1.5 pr-3">Кто</span>
      <span className="py-1.5 pr-3">Действие</span>
      <span className="py-1.5 pr-3">Компания</span>
      <span className="py-1.5 pr-3">Причина</span>
    </div>
  );
}

export type LogCompany = { id: string; name: string };

/** The journal's own filters: the sandbox leaves them out. */
export type LogFilters = {
  query: string;
  onQuery: (value: string) => void;
  action: string;
  onAction: (value: string) => void;
  /** How many rows the search has read so far. */
  scanned: number;
};

/** The journal itself, fed by props: the sandbox draws each of its states without a base. */
export function AuditLogView({
  rows,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  moreError,
  onMore,
  companies,
  company,
  onCompany,
  filters,
}: {
  rows: AuditRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: unknown;
  onMore: () => void;
  companies: LogCompany[];
  company: string | null;
  onCompany: (id: string | null) => void;
  filters?: LogFilters;
}) {
  const searching = Boolean(filters && (filters.query.trim() || filters.action));
  // the filter may name a company that is gone: its rows still carry the name
  const options = useMemo(() => {
    if (!company || companies.some((item) => item.id === company)) return companies;
    return [...companies, { id: company, name: rows?.[0]?.company_name ?? "Удалённая компания" }];
  }, [companies, company, rows]);
  const failed = !rows && Boolean(error);

  return (
    <DeskPage>
      <PageTitle title="Журнал" state={{ text: "Каждое действие консоли: кто, зачем и что вышло" }} />
      <Toolbar>
        <Select aria-label="Компания" className="max-w-[240px]" value={company ?? ""} onChange={(event) => onCompany(event.target.value || null)} data-testid="ops-log-company">
          <option value="">Все компании</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        {filters ? (
          <>
            <Select aria-label="Действие" value={filters.action} onChange={(event) => filters.onAction(event.target.value)} data-testid="ops-log-action">
              <option value="">Все действия</option>
              {Object.entries(ACTION_LABEL).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
            <GridSearch value={filters.query} onChange={filters.onQuery} placeholder="Причина, почта, номер задачи" label="Поиск по журналу" width={280} />
          </>
        ) : null}
        {filters && searching && rows ? (
          <span className="text-[13px] leading-5 text-muted" role="status" data-testid="ops-log-found">
            {hasMore && loadingMore ? `Ищу дальше: найдено ${rows.length}` : `Найдено ${rows.length} из ${filters.scanned}`}
          </span>
        ) : null}
      </Toolbar>
      {failed ? (
        <OpsFailure error={error} onRetry={onRetry} />
      ) : loading ? (
        <TableBones rows={12} rowHeight={33} />
      ) : !rows || rows.length === 0 ? (
        searching ? (
          <EmptyState
            title={hasMore ? "Пока не нашлось, ищу дальше" : "Ничего не нашлось"}
            hint={`Поиск прошёл ${filters?.scanned ?? 0} ${pluralRu(filters?.scanned ?? 0, ["запись", "записи", "записей"])}.`}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  filters?.onQuery("");
                  filters?.onAction("");
                }}
              >
                Сбросить поиск
              </Button>
            }
          />
        ) : company ? (
          <EmptyState
            title="По этой компании записей нет"
            hint="Здесь появится всё, что с ней делали из консоли."
            action={
              <Button size="sm" variant="secondary" onClick={() => onCompany(null)}>
                Показать все
              </Button>
            }
          />
        ) : (
          <EmptyState title="В журнале пока пусто" hint="Первое же действие в консоли появится здесь." />
        )
      ) : (
        <>
          <div className="ops-box border">
            <LogHead />
            <ul>
              {rows.map((row) => (
                <AuditLine key={row.id} row={row} />
              ))}
            </ul>
          </div>
          {moreError ? (
            <p role="alert" className="text-[13px] font-medium leading-5 text-danger">
              {failureText(moreError)}
            </p>
          ) : null}
          {hasMore ? (
            <div>
              <Button size="sm" variant="secondary" loading={loadingMore} onClick={onMore} data-testid="ops-log-more">
                Показать ещё
              </Button>
            </div>
          ) : null}
        </>
      )}
    </DeskPage>
  );
}

export function AuditLog({ company }: { company: string | null }) {
  const router = useRouter();
  const audit = useAudit(company);
  const companies = useCompanies();
  const [query, setQuery] = useUrlText("q");
  const [action, setAction] = useUrlText("action");
  const loaded = useMemo(() => audit.data?.pages.flatMap((page) => page.rows), [audit.data]);
  const words = query.trim().toLowerCase();
  const rows = useMemo(
    () => (words || action ? loaded?.filter((row) => (!action || row.action === action) && (!words || auditHaystack(row).includes(words))) : loaded),
    [loaded, words, action],
  );

  // the server filters by company only: a search reads on by itself until it has read enough
  const pages = audit.data?.pages.length ?? 0;
  const deeper = Boolean(words || action) && audit.hasNextPage && !audit.isFetchingNextPage && !audit.isFetchNextPageError && pages < DEEP_PAGES;
  const { fetchNextPage } = audit;
  useEffect(() => {
    if (deeper) void fetchNextPage();
  }, [deeper, pages, fetchNextPage]);

  const toCompany = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("company", id);
    else url.searchParams.delete("company");
    router.replace(url.pathname + url.search);
  };

  const list = useMemo(() => (companies.data ?? []).map(({ id, name }) => ({ id, name })), [companies.data]);
  return (
    <AuditLogView
      rows={rows}
      loading={audit.isPending}
      error={audit.error}
      onRetry={() => void audit.refetch()}
      hasMore={audit.hasNextPage}
      loadingMore={audit.isFetchingNextPage}
      moreError={audit.isFetchNextPageError ? audit.error : null}
      onMore={() => void audit.fetchNextPage()}
      companies={list}
      company={company}
      onCompany={toCompany}
      filters={{ query, onQuery: setQuery, action, onAction: setAction, scanned: loaded?.length ?? 0 }}
    />
  );
}
