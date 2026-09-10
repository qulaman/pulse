"use client";

import Link from "next/link";

import { Mascot } from "@/components/brand/Mascot";
import { formatAqtobe } from "@/lib/ai/time";
import { balanceOf, usePointHistory } from "@/lib/points/queries";

/** Employee's balance and the last awards — sums of own transactions under RLS. */
export function ProfilePoints({ userId }: { userId: string }) {
  const history = usePointHistory(userId);
  const balance = balanceOf(history.data);

  return (
    <section className="mt-4 rounded-[16px] border border-border bg-surface p-4">
      <div className="flex items-center gap-4">
        <Mascot state={balance > 0 ? "happy" : "calm"} size={56} />
        <div>
          <p className="text-[13px] leading-4 text-muted">Очки</p>
          <p className="nums text-[40px] font-bold leading-[44px]" style={{ color: "var(--gold)" }}>
            {history.isLoading ? "…" : balance}
          </p>
        </div>
        <Link href="/ether" className="ml-auto text-[13px] leading-4 text-accent underline underline-offset-4">
          Рейтинг
        </Link>
      </div>

      {history.data && history.data.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {history.data.slice(0, 5).map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 text-[14px] leading-[18px]">
              <span className="truncate">
                <span className="nums font-semibold" style={{ color: row.amount > 0 ? "var(--gold)" : "var(--danger)" }}>
                  {row.amount > 0 ? `+${row.amount}` : row.amount}
                </span>{" "}
                {row.reason}
              </span>
              <span className="nums shrink-0 text-[13px] text-muted">{formatAqtobe(new Date(row.created_at))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-4 text-muted">Очков пока нет. Первые придут за закрытые задачи</p>
      )}
    </section>
  );
}
