"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { DeliverList } from "@/components/shop/DeliverList";
import { ItemEditor } from "@/components/shop/ItemEditor";
import { RecentDeliveries } from "@/components/shop/RecentDeliveries";
import { AddRewardTile, RewardTile } from "@/components/shop/RewardTile";
import { ShopHero } from "@/components/shop/ShopHero";
import { TeamPoints } from "@/components/shop/TeamPoints";
import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { deliveredInPeriod, isOpenOrder, takenCounts } from "@/lib/shop/format";
import { useAllShopItems, useOrders, useShopSummary, type ShopItem } from "@/lib/shop/queries";
import type { Me } from "@/lib/tasks/queries";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-muted">
      <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Появление блоков лесенкой: единственное движение на экране, только transform+opacity,
 * 40 мс между блоками. Под `prefers-reduced-motion` блоки просто стоят на месте.
 */
function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.04, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Магазин глазами директора — пульт, а не витрина (D-71 §12–14). Экран отвечает по
 * порядку: чем магазин жил месяц (герой), что ждёт выдачи сегодня, что вообще можно
 * получить и сколько раз это уже брали, кому что досталось, и как идут очки у людей.
 * Кнопок «Обменять» тут нет: директор очков не копит, а поощряет людей на Рейтинге.
 */
export function AdminShop({ me }: { me: Me | undefined }) {
  const items = useAllShopItems(true);
  const orders = useOrders();
  const summary = useShopSummary(true);
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);

  const list = items.data ?? [];
  const allOrders = orders.data ?? [];
  const waiting = allOrders.filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId);
  const taken = takenCounts(allOrders);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead title="Магазин" />

      <Reveal index={0}>
        <ShopHero
          delivered={deliveredInPeriod(allOrders)}
          onHands={summary.data?.onHands ?? 0}
          waiting={waiting.length}
          loading={orders.isLoading || summary.isLoading}
        />
      </Reveal>

      <Reveal index={1}>
        <DeliverList orders={allOrders} meId={me?.userId} />
      </Reveal>

      <Reveal index={2}>
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="eyebrow">Награды</h2>
            <span className="nums text-[12px] leading-4 text-muted">{list.length}</span>
          </div>
          {items.isLoading ? (
            <SkeletonGroup className="mt-2 grid grid-cols-2 gap-2.5">
              {Array.from({ length: 4 }, (_, i) => (
                <Bone key={i} h={176} className="rounded-[16px]" />
              ))}
            </SkeletonGroup>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-2.5">
              {list.map((item) => (
                <li key={item.id} className="contents">
                  <RewardTile item={item} taken={taken[item.id] ?? 0} onOpen={setEditing} />
                </li>
              ))}
              <li className="contents">
                <AddRewardTile onClick={() => setEditing("new")} />
              </li>
            </ul>
          )}
        </section>
      </Reveal>

      <Reveal index={3}>
        <RecentDeliveries orders={allOrders} />
      </Reveal>

      <Reveal index={4}>
        <TeamPoints items={list} />
      </Reveal>

      <Reveal index={5}>
        <Link
          href="/rating"
          className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px] transition-colors duration-[120ms] active:bg-surface-2"
        >
          Поощрить очками
          <span className="flex items-center gap-1.5 text-[13px] leading-4 text-muted">
            рейтинг команды <Chevron />
          </span>
        </Link>
      </Reveal>

      <ItemEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        item={editing}
        companyId={me?.companyId}
        onClose={() => setEditing(null)}
      />
    </main>
  );
}
