"use client";

import { Num } from "@/components/desk/ui/Num";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Bone } from "@/components/ui/Skeleton";
import { formatNum, pointsTone } from "@/lib/desk/format";
import { pluralRu } from "@/lib/tasks/status-text";

type Summary = { onHands: number; earned30: number; spent: number };

/**
 * The head of «Очки и магазин» (D-154) — one hero instead of five equal tiles: the points the
 * team holds, large; how many were given in thirty days and carried to the shop, in a line under
 * it; on the right the two things that wait for the director — orders to hand out and minuses
 * people dispute — each a way into its section, amber only while it is not zero.
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
    <section className="card grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-6 px-6 py-5" aria-label="Сводка очков" data-testid="points-hero">
      <div className="min-w-0">
        <SectionLabel>На руках у команды</SectionLabel>
        {summary ? (
          <p className="mt-1 flex items-baseline gap-2.5">
            <Num value={summary.onHands} className="font-display text-[48px] font-bold leading-[52px] tracking-[-0.03em]" />
            <span className="text-[15px] leading-5 text-muted">{pluralRu(Math.abs(summary.onHands), ["очко", "очка", "очков"])}</span>
          </p>
        ) : (
          <Bone h={52} w={260} className="mt-1" />
        )}
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[14px] leading-5 text-muted" data-testid="points-hero-line">
          {summary ? (
            <>
              <span>
                роздано за 30 дней{" "}
                <Num value={summary.earned30} signed tone={pointsTone(summary.earned30)} className="font-semibold" />
              </span>
              <span>
                унесено в магазин{" "}
                <span className="text-text">
                  <Num value={summary.spent} className="font-semibold" />
                </span>
              </span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </p>
      </div>

      <div className="flex items-stretch gap-2 border-l border-border/70 pl-6">
        <Waiting label="Ждут выдачи" hint={waiting > 0 ? "выдать в магазине" : "выдавать нечего"} value={waiting} onClick={onShop} testId="points-hero-shop" />
        <Waiting label="Оспаривают" hint={disputes > 0 ? "вернуть или оставить" : "споров нет"} value={disputes} onClick={onDisputes} testId="points-hero-disputes" />
      </div>
    </section>
  );
}

/** One thing waiting for the director: its count (28/32), amber while there is something; a click opens its section. */
function Waiting({ label, hint, value, onClick, testId }: { label: string; hint: string; value: number; onClick: () => void; testId: string }) {
  const on = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-w-[148px] flex-col justify-center rounded-[12px] px-4 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
      style={on ? { background: "color-mix(in srgb, var(--warn) 8%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--warn) 30%, transparent)" } : undefined}
    >
      <span className="text-[13px] font-medium leading-[18px] text-muted">{label}</span>
      <span className="nums font-display text-[32px] font-bold leading-9 tracking-[-0.02em]" style={{ color: on ? "var(--warn)" : "color-mix(in srgb, var(--text-muted) 60%, transparent)" }}>
        {formatNum(value)}
      </span>
      <span className="text-[12px] leading-4 text-muted">{hint}</span>
    </button>
  );
}
