"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { OpsFailure, failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { whenAqtobe } from "@/lib/lab/format";
import type { AuditRow } from "@/lib/ops/contract";
import { useAudit, useCompanies } from "@/lib/ops/queries";

const ACTION_LABEL: Record<string, string> = {
  create_company: "Новая компания",
  update_company: "Правка компании",
  add_person: "Новый человек",
  update_person: "Правка человека",
  issue_login_code: "Код входа",
  revoke_sessions: "Сброс сессий",
  change_director: "Смена директора",
  adjust_points: "Поправка очков",
  task_lookup: "Просмотр задачи",
  update_task: "Правка задачи",
  delete_task: "Удаление задачи",
  wipe_activity: "Чистка активности",
  export_company: "Выгрузка",
  purge_company: "Удаление компании",
  grant_operator: "Доступ выдан",
  revoke_operator: "Доступ отозван",
};

const DANGEROUS = new Set(["wipe_activity", "purge_company", "delete_task", "change_director"]);

const ROW_GRID = "grid grid-cols-[28px_118px_minmax(0,1fr)_150px_140px_minmax(0,1.2fr)] items-center";

function Payload({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  const empty = !value || Object.keys(value).length === 0;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{title}</p>
      {empty ? (
        <p className="text-[13px] leading-5 text-muted/70">Пусто</p>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-bg/60 px-3 py-2 font-mono text-[12px] leading-[18px]">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}

function AuditLine({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const who = row.operator_email ?? "Команда на сервере";
  return (
    <li className="border-b border-border/50 last:border-b-0" data-testid="ops-audit-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`desk-row desk-focus ${ROW_GRID} min-h-[40px] w-full text-left text-[14px] leading-5`}>
        <span aria-hidden className="flex justify-center text-muted">
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform duration-[120ms] ${open ? "" : "-rotate-90"}`}>
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="nums whitespace-nowrap py-2 pr-3 text-[13px]">{whenAqtobe(row.at)}</span>
        <span className="truncate py-2 pr-3 text-muted" title={who}>
          {who}
        </span>
        <span className={`truncate py-2 pr-3 font-medium ${DANGEROUS.has(row.action) ? "text-warn" : ""}`} title={row.action}>
          {ACTION_LABEL[row.action] ?? row.action}
        </span>
        <span className="truncate py-2 pr-3" title={row.company_name ?? undefined}>
          {row.company_name ?? <span className="text-muted/60">—</span>}
        </span>
        <span className="truncate py-2 pr-3 text-muted" title={row.reason}>
          {row.reason}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-border/50 bg-bg/30 px-4 py-3" data-testid="ops-audit-detail">
          <p className="text-[14px] leading-5">{row.reason}</p>
          <div className="grid grid-cols-2 gap-4">
            <Payload title="Цель" value={row.target} />
            <Payload title="Результат" value={row.result} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function LogHead() {
  return (
    <div className={`${ROW_GRID} sticky top-0 z-[1] rounded-t-[12px] border-b border-border bg-surface/95 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted backdrop-blur-sm`}>
      <span aria-hidden />
      <span className="py-2 pr-3">Когда</span>
      <span className="py-2 pr-3">Кто</span>
      <span className="py-2 pr-3">Действие</span>
      <span className="py-2 pr-3">Компания</span>
      <span className="py-2 pr-3">Причина</span>
    </div>
  );
}

export type LogCompany = { id: string; name: string };

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
}) {
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
        <Select aria-label="Компания" value={company ?? ""} onChange={(event) => onCompany(event.target.value || null)} data-testid="ops-log-company">
          <option value="">Все компании</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Toolbar>
      {failed ? (
        <OpsFailure error={error} onRetry={onRetry} />
      ) : loading ? (
        <SkeletonGroup grow>
          <Bone h={420} className="rounded-[12px]" />
        </SkeletonGroup>
      ) : !rows || rows.length === 0 ? (
        company ? (
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
          <div className="rounded-[12px] border border-border bg-surface/40">
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
  const rows = useMemo(() => audit.data?.pages.flatMap((page) => page.rows), [audit.data]);
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
      onCompany={(id) => router.replace(id ? `/ops/log?company=${id}` : "/ops/log")}
    />
  );
}
