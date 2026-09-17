"use client";

import { useState } from "react";

import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { pluralRu } from "@/lib/tasks/status-text";
import { useCompanyLedger, useShopSummary } from "@/lib/shop/queries";

const SOURCE_LABEL: Record<string, string> = {
  manual: "от директора",
  auto_rule: "за задачу",
  reaction: "реакция",
  shop_hold: "заказ в магазине",
  shop_release: "возврат заказа",
};

const PAGE = 20;

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="eyebrow">{label}</p>
      <p className="nums mt-0.5 text-[24px] font-bold leading-[30px]" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

/**
 * Очки компании глазами директора: две цифры сверху — сколько сейчас на руках и сколько
 * уже унесено в магазин, — и лента всех начислений и списаний. Читается из тех же
 * транзакций, что и балансы: второго источника правды об очках не существует (принцип 4).
 */
export function PointsLedger() {
  const [shown, setShown] = useState(PAGE);
  const ledger = useCompanyLedger(true);
  const summary = useShopSummary(true);
  const rows = ledger.data ?? [];

  return (
    <section className="mt-7">
      <h2 className="eyebrow px-1">Очки компании</h2>

      <div className="card mt-2 flex gap-4 px-4 py-3.5">
        {summary.isLoading ? (
          <SkeletonGroup className="flex w-full gap-4">
            <Bone h={44} />
            <Bone h={44} />
          </SkeletonGroup>
        ) : (
          <>
            <Stat label="На руках" value={summary.data?.onHands ?? 0} color="var(--gold)" />
            <Stat label="Потрачено" value={summary.data?.spent ?? 0} color="var(--accent)" />
          </>
        )}
      </div>

      {ledger.isLoading ? (
        <SkeletonGroup className="mt-2 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} h={56} className="rounded-[16px]" />
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <p className="mt-2 px-1 text-[14px] leading-5 text-muted">Начислений пока нет</p>
      ) : (
        <>
          <ul className="card mt-2 overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
            {rows.slice(0, shown).map((row) => (
              <li key={row.id} className="flex items-baseline gap-3 px-4 py-2.5" data-testid="ledger-row">
                <span
                  className="nums w-[52px] shrink-0 text-[15px] font-bold leading-5"
                  style={{ color: row.amount > 0 ? "var(--gold)" : "var(--danger)" }}
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
          {rows.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-2 min-h-[44px] w-full text-[15px] leading-5 text-accent"
            >
              Показать ещё {Math.min(PAGE, rows.length - shown)}{" "}
              {pluralRu(Math.min(PAGE, rows.length - shown), ["запись", "записи", "записей"])}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
