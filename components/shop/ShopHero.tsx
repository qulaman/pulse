"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { pluralRu } from "@/lib/tasks/status-text";
import { formatNum } from "@/lib/desk/format";

type Props = {
  /** How many rewards were handed out in the last 30 days — the screen's main number. */
  delivered: number;
  /** The points the team holds. */
  onHands: number;
  /** How many orders wait to be handed out right now. */
  waiting: number;
  loading?: boolean;
};

function Fact({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[12px] leading-4 text-muted">{label}</span>
      <span className="nums block truncate whitespace-nowrap text-[19px] font-bold leading-6" style={color ? { color } : undefined}>
        {formatNum(value)}
      </span>
    </span>
  );
}

/**
 * The console's hero: what the shop lived on this month. The big number is the rewards handed out
 * (that is the point of the shop, not the stock), the assistant's face beside it, and under the
 * rule two facts the director follows: the points people hold and how many orders wait.
 *
 * The gold glow in the corner is a static radial gradient: «дорого» without animated shadows or
 * filters (the perf contract, DESIGN §2). Gold fits here: this is the screen of rewards and points.
 */
export function ShopHero({ delivered, onHands, waiting, loading }: Props) {
  return (
    // `data-grow`: the card's height is the month's (a first-award line when nothing was given yet) — D-122
    <section className="card relative mt-4 overflow-hidden px-5 pb-4 pt-5" data-grow="">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 24%, transparent), transparent 70%)" }}
      />

      {loading ? (
        <SkeletonGroup className="space-y-2">
          <Bone h={16} w={120} />
          <Bone h={48} w={180} />
          <Bone h={34} />
        </SkeletonGroup>
      ) : (
        <>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Выдано за месяц</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span
                  data-testid="hero-delivered"
                  className="nums text-[48px] font-bold leading-[50px]"
                  style={{ color: "var(--gold)" }}
                >
                  {delivered}
                </span>
                <span className="text-[16px] leading-5 text-muted">
                  {delivered === 0 ? "наград" : pluralRu(delivered, ["награда", "награды", "наград"])}
                </span>
              </p>
              {delivered === 0 ? (
                <p className="mt-1 text-[14px] leading-5 text-muted">Первую можно вручить прямо отсюда</p>
              ) : null}
            </div>
            <span className="-mr-1 -mt-1 shrink-0">
              <Mascot state={delivered > 0 ? "happy" : "calm"} size={64} />
            </span>
          </div>

          <div className="mt-4 flex gap-4 border-t border-border/70 pt-3">
            <Fact label="Очки на руках" value={onHands} color="var(--gold)" />
            <Fact label="Ждут выдачи" value={waiting} color={waiting > 0 ? "var(--warn)" : undefined} />
          </div>
        </>
      )}
    </section>
  );
}
