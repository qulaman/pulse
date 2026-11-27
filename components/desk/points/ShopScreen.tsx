"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef } from "react";

import { ShopHero } from "@/components/desk/points/Heroes";
import { PointsDraftKeeper, RulesBlock, ShopRules } from "@/components/desk/points/Rules";
import { ShopDesk } from "@/components/desk/points/ShopDesk";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SettingsDraftProvider } from "@/components/settings/draft";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { isOpenOrder } from "@/lib/shop/format";
import { splitHands } from "@/lib/shop/hands";
import { useOrders, useShopSummary } from "@/lib/shop/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Магазин» (D-215) — a section of the director's desk: what the team spends its points on. On top
 * what waits to be handed out — the director's own move — beside the points the team holds; under it
 * the queue to hand out, the rewards with «+ Награда», and the shop's own setting — it lives here,
 * not in «Настройки». Who has how many points and why is «Рейтинг»; the shop works while the points
 * are switched off — what was ordered is still handed out.
 */
export function ShopScreen() {
  return (
    // the shop's setting is edited as a draft of the company settings
    <SettingsDraftProvider>
      <ShopBody />
    </SettingsDraftProvider>
  );
}

function ShopBody() {
  const me = useMe().data;
  const enabled = usePointsEnabled();
  const summary = useShopSummary(true);
  const orders = useOrders();
  const people = usePeople();
  const desk = useRef<HTMLDivElement>(null);

  const waiting = (orders.data ?? []).filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId).length;
  // the figure is the team's; who left and the director keep theirs apart (D-194)
  const hands = useMemo(() => (summary.data && people.data ? splitHands(summary.data.balances, people.data) : undefined), [summary.data, people.data]);

  return (
    <DeskPage>
      <div className="pts-screen flex w-full min-w-0 flex-col gap-4">
        <PageTitle
          title="Магазин"
          state={enabled.isPending || enabled.data === true ? null : { text: "Очки выключены — новых не начислить, заказанное выдаётся" }}
          actions={
            <Link
              href="/desk/rating"
              prefetch
              className="pts-rules-link inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-medium text-muted hover:text-text"
              data-testid="shop-to-rating"
              title="У кого сколько очков и за что — в «Рейтинге»"
            >
              <SlidersHorizontal size={16} aria-hidden />
              Балансы — в «Рейтинге»
            </Link>
          }
        />
        <ShopHero summary={summary.data} hands={hands} waiting={waiting} onQueue={() => desk.current?.scrollIntoView({ block: "start", behavior: "smooth" })} />
        <div ref={desk} className="pts-view scroll-mt-4">
          <ShopDesk />
        </div>
        <PointsDraftKeeper name="Настройки магазина" open={false} />
        <RulesBlock name="Настройки магазина" cards={1} testId="shop-settings">
          <ShopRules />
        </RulesBlock>
      </div>
    </DeskPage>
  );
}
