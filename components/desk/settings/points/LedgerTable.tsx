"use client";

import { Hand, Heart, RotateCcw, ShoppingBag, Workflow, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { aqtobeDay, toAqtobeIso } from "@/lib/ai/time";
import { pointsTone } from "@/lib/desk/format";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useCompanyLedger, type LedgerRow } from "@/lib/shop/queries";

/**
 * Where a line came from — in words, never the database's names. `auto_rule` is any rule of the
 * company: a task in time and the daily report's plus and fine alike (D-152).
 */
const SOURCE: Record<string, { label: string; icon: LucideIcon }> = {
  manual: { label: "решение директора", icon: Hand },
  auto_rule: { label: "по правилу", icon: Workflow },
  reaction: { label: "реакция директора", icon: Heart },
  shop_hold: { label: "заказ в магазине", icon: ShoppingBag },
  shop_release: { label: "возврат заказа", icon: RotateCcw },
};

/** The ledger is read by pages of this many rows, the newest first; «Показать ещё» asks for the next. */
export const LEDGER_LIMIT = 200;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] as const;

const time = (row: LedgerRow) => new Date(row.created_at).getTime();

/** «Сегодня», «Вчера», «10 ноября» on the Aqtobe wall clock; another year is written out. */
function dayTitle(day: number, today: number, sample: Date): string {
  if (day === today) return "Сегодня";
  if (day === today - 1) return "Вчера";
  const iso = toAqtobeIso(sample);
  const year = iso.slice(0, 4) === toAqtobeIso(new Date()).slice(0, 4) ? "" : ` ${iso.slice(0, 4)}`;
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}${year}`;
}

/** The amount as a small plate: a plus in the reward's gold, a minus quiet with a real «−» — never an alarm (D-154). */
function Amount({ value }: { value: number }) {
  return (
    <span className="pts-amount" data-sign={value > 0 ? "plus" : value < 0 ? "minus" : undefined}>
      <Num value={value} signed tone={pointsTone(value)} className="font-semibold" />
    </span>
  );
}

function Person({ row, avatar }: { row: LedgerRow; avatar: string | null }) {
  useNamesKey();
  const name = row.user?.full_name ?? "—";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TileFace person={{ id: row.user_id, full_name: name, avatar_url: avatar }} size={26} />
      <span className="truncate" title={name}>
        {shortName(name)}
      </span>
    </span>
  );
}

/**
 * «История»: the company's points line by line, the newest first, by days (`useCompanyLedger`,
 * director RLS, live by Realtime) — a feed: the day as a title, the hour, the face, the plate of
 * the amount, the reason, where it came from. `who` narrows it to a person, `search` to a reason
 * or a name.
 */
export function LedgerTable({ who, search }: { who: string; search: string }) {
  const [limit, setLimit] = useState(LEDGER_LIMIT);
  const ledger = useCompanyLedger(true, limit);
  const people = usePeople();
  const avatars = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.avatar_url])), [people.data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (ledger.data ?? []).filter(
      (row) =>
        (!who || row.user_id === who) &&
        (!needle || row.reason.toLowerCase().includes(needle) || (row.user?.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [ledger.data, who, search]);

  // one group a day, the newest day first — the rows inside keep the ledger's order
  const groups = useMemo<Group<LedgerRow>[]>(() => {
    const today = aqtobeDay(new Date());
    const out: Group<LedgerRow>[] = [];
    for (const row of rows) {
      const date = new Date(row.created_at);
      const key = String(aqtobeDay(date));
      const last = out.at(-1);
      if (last && last.key === key) last.rows.push(row);
      else out.push({ key, title: dayTitle(Number(key), today, date), rows: [row] });
    }
    return out;
  }, [rows]);

  const columns: Column<LedgerRow>[] = [
    {
      key: "when",
      title: "Время",
      width: "84px",
      sort: (a, b) => time(a) - time(b),
      render: (row) => (
        <span className="whitespace-nowrap text-muted">
          <When>{toAqtobeIso(new Date(row.created_at)).slice(11, 16)}</When>
        </span>
      ),
    },
    {
      key: "who",
      title: "Кто",
      width: "minmax(150px,1fr)",
      sort: (a, b) => (a.user?.full_name ?? "").localeCompare(b.user?.full_name ?? "", "ru"),
      render: (row) => <Person row={row} avatar={avatars.get(row.user_id) ?? null} />,
    },
    {
      key: "amount",
      title: "Сумма",
      width: "104px",
      align: "right",
      sort: (a, b) => a.amount - b.amount,
      render: (row) => <Amount value={row.amount} />,
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
    {
      key: "source",
      title: "Откуда",
      width: "184px",
      render: (row) => {
        const source = SOURCE[row.source];
        const Icon = source?.icon;
        return (
          <span className="pts-source">
            {Icon ? <Icon size={13} strokeWidth={2} aria-hidden /> : null}
            {source?.label ?? row.source}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataGrid
        aria-label="История очков"
        className="pts-ledger"
        columns={columns}
        groups={groups}
        rowKey={(row) => row.id}
        empty={
          ledger.isPending ? (
            <EmptyState title="Загружаю историю" />
          ) : ledger.isError ? (
            <EmptyState
              title="Историю не загрузить"
              hint="Проверьте связь и попробуйте ещё раз"
              action={
                <Button size="sm" variant="secondary" onClick={() => void ledger.refetch()}>
                  Повторить
                </Button>
              }
            />
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
