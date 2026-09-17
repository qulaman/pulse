"use client";

import { useState } from "react";

import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { useCompanyLedger } from "@/lib/shop/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** Откуда пришла строка — человеческими словами, без имён источников из БД. */
const SOURCE_LABEL: Record<string, string> = {
  manual: "решение директора",
  auto_rule: "за задачу",
  reaction: "реакция директора",
  shop_hold: "заказ в магазине",
  shop_release: "возврат заказа",
};

const PAGE = 20;

/**
 * Вся история очков компании — список внутри шторки «Вся история». На самом пульте её
 * нет намеренно: директору нужен итог, а построчная бухгалтерия — по запросу.
 */
export function PointsLedger({ open }: { open: boolean }) {
  const [shown, setShown] = useState(PAGE);
  const ledger = useCompanyLedger(open);
  const rows = ledger.data ?? [];
  const more = Math.min(PAGE, rows.length - shown);

  if (ledger.isLoading) {
    return (
      <SkeletonGroup className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} h={52} className="rounded-[12px]" />
        ))}
      </SkeletonGroup>
    );
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[15px] leading-5 text-muted">Очки пока не начислялись</p>;
  }

  return (
    <>
      <ul className="[&>*+*]:border-t [&>*+*]:border-border/70">
        {rows.slice(0, shown).map((row) => (
          <li key={row.id} className="flex items-baseline gap-3 py-2.5" data-testid="ledger-row">
            <span
              className="nums w-[54px] shrink-0 text-[15px] font-bold leading-5"
              style={{ color: row.amount > 0 ? "var(--gold)" : "var(--text-muted)" }}
            >
              {row.amount > 0 ? `+${row.amount}` : row.amount}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-5">{row.user?.full_name ?? "—"}</span>
              <span className="block truncate text-[13px] leading-4 text-muted">
                {row.reason} · {SOURCE_LABEL[row.source] ?? row.source}
              </span>
            </span>
            <span className="nums shrink-0 text-[12px] leading-4 text-muted">
              {humanAqtobe(new Date(row.created_at))}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-1 min-h-[44px] w-full text-[15px] leading-5 text-accent"
        >
          Показать ещё {more} {pluralRu(more, ["запись", "записи", "записей"])}
        </button>
      ) : null}
    </>
  );
}
