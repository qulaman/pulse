"use client";

import { useMemo, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { pointsTone } from "@/lib/desk/format";
import { useCompanyLedger, type LedgerRow } from "@/lib/shop/queries";

/**
 * Where a line came from — in words, never the database's names. `auto_rule` is any rule of the
 * company: a task in time and the daily report's plus and fine alike (D-152).
 */
const SOURCE_LABEL: Record<string, string> = {
  manual: "решение директора",
  auto_rule: "по правилу",
  reaction: "реакция директора",
  shop_hold: "заказ в магазине",
  shop_release: "возврат заказа",
};

/** The ledger is read by pages of this many rows, the newest first; «Показать ещё» asks for the next. */
export const LEDGER_LIMIT = 200;

const time = (row: LedgerRow) => new Date(row.created_at).getTime();

/**
 * «История»: the company's points line by line, the newest first (`useCompanyLedger`, director RLS,
 * live by Realtime). `who` narrows it to a person, `search` to a reason or a name.
 */
export function LedgerTable({ who, search }: { who: string; search: string }) {
  const [limit, setLimit] = useState(LEDGER_LIMIT);
  const ledger = useCompanyLedger(true, limit);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (ledger.data ?? []).filter(
      (row) =>
        (!who || row.user_id === who) &&
        (!needle || row.reason.toLowerCase().includes(needle) || (row.user?.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [ledger.data, who, search]);

  const columns: Column<LedgerRow>[] = [
    {
      key: "when",
      title: "Когда",
      width: "136px",
      sort: (a, b) => time(a) - time(b),
      render: (row) => <When className="whitespace-nowrap text-muted">{humanAqtobe(new Date(row.created_at))}</When>,
    },
    {
      key: "who",
      title: "Кто",
      width: "minmax(130px,1fr)",
      sort: (a, b) => (a.user?.full_name ?? "").localeCompare(b.user?.full_name ?? "", "ru"),
      render: (row) => <PersonCell name={row.user?.full_name ?? "—"} />,
    },
    {
      key: "amount",
      title: "Сумма",
      width: "88px",
      align: "right",
      sort: (a, b) => a.amount - b.amount,
      // a plus is print; a minus — a fine, a shop order — is quiet with a real «−», never an alarm (D-154)
      render: (row) => <Num value={row.amount} signed tone={pointsTone(row.amount)} className="font-semibold" />,
    },
    {
      key: "reason",
      title: "За что",
      width: "minmax(170px,2fr)",
      render: (row) => (
        <span className="block truncate" title={row.reason}>
          {row.reason}
        </span>
      ),
    },
    { key: "source", title: "Откуда", width: "150px", render: (row) => <span className="text-muted">{SOURCE_LABEL[row.source] ?? row.source}</span> },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataGrid
        aria-label="История очков"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          ledger.isPending ? (
            <EmptyState title="Загружаю историю" />
          ) : who || search.trim() ? (
            <EmptyState title="Таких строк нет" hint="Снимите фильтр по человеку или поиск" />
          ) : (
            <EmptyState title="Очков пока не было" hint="Здесь появится каждое начисление, снятие и заказ в магазине" />
          )
        }
      />
      {(ledger.data?.length ?? 0) >= limit ? (
        <div className="flex items-center gap-3 px-1">
          <Button size="sm" variant="secondary" loading={ledger.isFetching} onClick={() => setLimit((n) => n + LEDGER_LIMIT)} data-testid="desk-ledger-more">
            Показать ещё {LEDGER_LIMIT}
          </Button>
          <span className="text-[12px] leading-4 text-muted">Показаны последние {ledger.data?.length} строк; баланс человека считается по всем</span>
        </div>
      ) : null}
    </div>
  );
}
