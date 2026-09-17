"use client";

import { useState } from "react";

import { PointsLedger } from "@/components/shop/PointsLedger";
import { Sheet } from "@/components/ui/Sheet";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { initialsOf, usePeople } from "@/lib/people/queries";
import { nearestGoal } from "@/lib/shop/format";
import { useShopSummary, type ShopItem } from "@/lib/shop/queries";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-muted">
      <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Очки команды на пульте директора — итог, а не бухгалтерия: сколько у людей на руках,
 * сколько роздано за месяц, сколько уже унесено в магазин, и трое, кто ближе всех к
 * своей награде. Построчная история — за одним тапом, в шторке.
 */
export function TeamPoints({ items }: { items: ShopItem[] }) {
  const summary = useShopSummary(true);
  const people = usePeople();
  const [historyOpen, setHistoryOpen] = useState(false);

  const names = new Map((people.data ?? []).map((person) => [person.id, person.full_name]));
  const top = (summary.data?.balances ?? []).filter((row) => row.points > 0 && names.has(row.userId)).slice(0, 3);

  return (
    <section className="mt-8">
      <h2 className="eyebrow px-1">Очки команды</h2>

      <div className="card mt-2 px-4 py-4">
        {summary.isLoading ? (
          <SkeletonGroup className="space-y-2">
            <Bone h={46} w={140} />
            <Bone h={18} />
          </SkeletonGroup>
        ) : (
          <>
            <p className="text-[13px] leading-4 text-muted">Сейчас на руках у команды</p>
            <p className="nums mt-0.5 text-[40px] font-bold leading-[44px]" style={{ color: "var(--gold)" }}>
              {summary.data?.onHands ?? 0}
            </p>
            <p className="mt-1 text-[14px] leading-5 text-muted">
              Роздано за месяц{" "}
              <span className="nums font-semibold" style={{ color: "var(--text)" }}>
                {summary.data?.earned30 ?? 0}
              </span>{" "}
              · унесено в магазин{" "}
              <span className="nums font-semibold" style={{ color: "var(--text)" }}>
                {summary.data?.spent ?? 0}
              </span>
            </p>

            {top.length > 0 ? (
              <ul className="mt-3.5 border-t border-border/70 pt-1">
                {top.map((row) => {
                  const goal = nearestGoal(row.points, items);
                  return (
                    <li key={row.userId} className="flex items-center gap-3 py-2" data-testid="saver">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-bg"
                        style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
                      >
                        {initialsOf(names.get(row.userId) ?? "")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-5">{names.get(row.userId)}</span>
                        <span className="block truncate text-[13px] leading-4 text-muted">
                          {goal ? `ещё ${goal.missing} до «${goal.title}»` : "хватает на любую награду"}
                        </span>
                      </span>
                      <span className="nums shrink-0 text-[16px] font-bold leading-5" style={{ color: "var(--gold)" }}>
                        {row.points}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] leading-5 text-muted">
                Пока никто не накопил очков — поощрения начисляются на Рейтинге
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        data-testid="open-history"
        className="mt-2 flex min-h-[52px] w-full items-center justify-between gap-3 card px-4 text-left text-[16px] leading-[22px] transition-colors duration-[120ms] active:bg-surface-2"
      >
        Вся история очков
        <span className="flex items-center gap-1.5 text-[13px] leading-4 text-muted">
          кто и за что <Chevron />
        </span>
      </button>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="История очков">
        <PointsLedger open={historyOpen} />
      </Sheet>
    </section>
  );
}
