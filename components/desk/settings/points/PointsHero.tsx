"use client";

import { Num } from "@/components/desk/ui/Num";
import { Bone } from "@/components/ui/Skeleton";
import { formatNum } from "@/lib/desk/format";
import { pluralRu } from "@/lib/tasks/status-text";

type Summary = { onHands: number; earned30: number; spent: number };

/**
 * The head of «Очки и магазин» (D-154, D-158) — a ledger's total, not a card: the points the team
 * holds, large, and in a row beside it how many were given in thirty days and carried to the shop,
 * then the two things that wait for the director — orders to hand out and minuses people dispute —
 * each a way into its section, in the pen only while it is not zero.
 */
export function PointsHero({
  summary,
  waiting,
  disputes,
  onShop,
  onDisputes,
}: {
  summary: Summary | undefined;
  waiting: number;
  disputes: number;
  onShop: () => void;
  onDisputes: () => void;
}) {
  return (
    <section className="desk-total flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Сводка очков" data-testid="points-hero">
      {summary ? (
        <p className="flex items-center gap-2.5">
          <Num value={summary.onHands} className="desk-figure text-[44px] leading-[48px]" />
          <span className="flex flex-col">
            <span className="text-[14px] font-medium leading-[18px]">на руках у команды</span>
            <span className="text-[12px] leading-4 text-muted">{pluralRu(Math.abs(summary.onHands), ["очко", "очка", "очков"])}</span>
          </span>
        </p>
      ) : (
        <Bone h={48} w={260} />
      )}

      <div className="flex items-stretch divide-x divide-border/70">
        <div className="flex items-stretch divide-x divide-border/70" data-testid="points-hero-line">
          <Fact label="роздано за 30 дней" value={summary ? `${summary.earned30 > 0 ? "+" : ""}${formatNum(summary.earned30)}` : "—"} />
          <Fact label="унесено в магазин" value={summary ? formatNum(summary.spent) : "—"} />
        </div>
        <Waiting label="ждут выдачи" hint={waiting > 0 ? "выдать в магазине" : "выдавать нечего"} value={waiting} onClick={onShop} testId="points-hero-shop" />
        <Waiting label="оспаривают" hint={disputes > 0 ? "вернуть или оставить" : "споров нет"} value={disputes} onClick={onDisputes} testId="points-hero-disputes" />
      </div>
    </section>
  );
}

/** A number of the ledger beside the total. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-[72px] flex-col px-3 py-0.5 first:pl-0">
      <span className="nums desk-figure text-[22px] leading-[26px]">{value}</span>
      <span className="whitespace-nowrap text-[12px] leading-4 text-muted">{label}</span>
    </span>
  );
}

/** One thing waiting for the director: its count, in the pen while there is something; a click opens its section. */
function Waiting({ label, hint, value, onClick, testId }: { label: string; hint: string; value: number; onClick: () => void; testId: string }) {
  const on = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={hint}
      className="flex min-w-[72px] flex-col px-3 py-0.5 text-left transition-colors duration-[120ms] hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
    >
      <span className={`nums desk-figure text-[22px] leading-[26px] ${on ? "" : "text-muted/50"}`} style={on ? { color: "var(--warn)" } : undefined}>
        {formatNum(value)}
      </span>
      <span className="whitespace-nowrap text-[12px] leading-4 text-muted">{label}</span>
    </button>
  );
}
