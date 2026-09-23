"use client";

import Link from "next/link";

import { Mascot } from "@/components/brand/Mascot";
import { humanAqtobe } from "@/lib/ai/time";
import { balanceOf, usePointHistory, useRating } from "@/lib/points/queries";

function BalanceBone() {
  return (
    <span
      aria-hidden
      className="skeleton mt-1.5 block rounded-[6px]"
      style={{ width: 62, height: 34, background: "var(--border)" }}
    />
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <polyline
        points="6,3.5 10.5,8 6,12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The employee's points: the balance big in gold (принцип 4 — it is the sum of the
 * transactions, never a stored field), the place in the rating when the rating knows
 * this person, the last three reasons, and one tap to the whole history. Whether the
 * company runs points at all is decided on the server (D-40в), so the card is either
 * in the first paint or not there — it never pushes the rows below it down.
 */
export function PointsCard({ userId, enabled }: { userId: string; enabled: boolean }) {
  const history = usePointHistory(userId);
  const rows = history.data ?? [];
  const balance = balanceOf(history.data);
  const rating = useRating("all", balance > 0);
  const myRow = (rating.data ?? []).find((row) => row.user_id === userId);

  if (!enabled && rows.length === 0) return null;

  return (
    <section className="mt-3 card overflow-hidden">
      <div className="flex items-center gap-4 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="eyebrow">Очки</p>
          <p
            data-testid="balance"
            className="nums mt-0.5 text-[40px] font-bold leading-[44px]"
            style={{ color: "var(--gold)" }}
          >
            {history.isLoading ? <BalanceBone /> : balance}
          </p>
          <p className="mt-0.5 text-[13px] leading-4 text-muted">
            {history.isLoading
              ? " "
              : myRow
                ? `${myRow.rank}-е место из ${(rating.data ?? []).length}`
                : balance > 0
                  ? "за закрытые в срок задачи и поощрения"
                  : "Первые придут за закрытые задачи"}
          </p>
        </div>
        <span className="ml-auto shrink-0">
          <Mascot state={balance > 0 ? "happy" : "calm"} size={56} />
        </span>
      </div>

      {rows.length > 0 ? (
        <ul className="px-4">
          {rows.slice(0, 3).map((row) => (
            <li key={row.id} className="flex items-baseline gap-2.5 border-t border-border/70 py-2.5">
              <span
                className="nums w-[42px] shrink-0 text-[15px] font-bold leading-5"
                style={{ color: row.amount > 0 ? "var(--gold)" : "var(--danger)" }}
              >
                {row.amount > 0 ? `+${row.amount}` : row.amount}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] leading-5">{row.reason}</span>
              <span className="nums shrink-0 text-[12px] leading-4 text-muted">{humanAqtobe(new Date(row.created_at))}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href="/rating"
        className="flex min-h-[48px] items-center justify-between gap-3 border-t border-border/70 px-4 text-[15px] leading-5 text-accent transition-colors duration-[120ms] active:bg-surface-2"
      >
        Рейтинг и история начислений
        <ChevronRight />
      </Link>
    </section>
  );
}
