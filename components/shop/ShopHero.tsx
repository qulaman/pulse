"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { pluralRu } from "@/lib/tasks/status-text";

type Props = {
  /** Сколько наград выдано за последние 30 дней — главная цифра экрана. */
  delivered: number;
  /** Очки на руках у команды. */
  onHands: number;
  /** Сколько заказов ждёт выдачи прямо сейчас. */
  waiting: number;
  loading?: boolean;
};

function Fact({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[12px] leading-4 text-muted">{label}</span>
      <span className="nums block text-[19px] font-bold leading-6" style={color ? { color } : undefined}>
        {value}
      </span>
    </span>
  );
}

/**
 * Герой пульта: чем магазин жил этот месяц. Крупная цифра — выданные награды (это и есть
 * смысл магазина, а не остатки на складе), рядом лицо ассистента, под чертой — два факта,
 * за которыми директор следит: очки на руках и сколько заказов ждёт.
 *
 * Золотое сияние в углу — статичный радиальный градиент: «дорого» без анимации теней и
 * фильтров (перф-контракт DESIGN §2). Золото здесь уместно: это экран наград и очков.
 */
export function ShopHero({ delivered, onHands, waiting, loading }: Props) {
  return (
    <section className="card relative mt-4 overflow-hidden px-5 pb-4 pt-5">
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
                <p className="mt-1 text-[14px] leading-5 text-muted">Первую вручишь прямо отсюда</p>
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
