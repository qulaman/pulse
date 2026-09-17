"use client";

import Link from "next/link";
import { useState } from "react";

import { DeliverList } from "@/components/shop/DeliverList";
import { ItemEditor } from "@/components/shop/ItemEditor";
import { AddRewardTile, RewardTile } from "@/components/shop/RewardTile";
import { TeamPoints } from "@/components/shop/TeamPoints";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { isOpenOrder, shopVerdict } from "@/lib/shop/format";
import { useAllShopItems, useOrders, type ShopItem } from "@/lib/shop/queries";
import type { Me } from "@/lib/tasks/queries";

const TONE_COLOR: Record<string, string> = {
  warn: "var(--warn)",
  muted: "var(--text-muted)",
  accent: "var(--accent)",
  ok: "var(--ok)",
};

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-muted">
      <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Магазин глазами директора — пульт, а не витрина (D-71 §12–13). Экран отвечает на три
 * вопроса руководителя в этом порядке: что ждёт меня сейчас (выдать заказ), что вообще
 * можно получить (награды плитками, тап — правка) и что происходит с очками команды
 * (итог, а не бухгалтерия — построчная история за одним тапом). Кнопок «Обменять» тут
 * нет: директор очков не копит, а поощряет людей на Рейтинге.
 */
export function AdminShop({ me }: { me: Me | undefined }) {
  const items = useAllShopItems(true);
  const orders = useOrders();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);

  const list = items.data ?? [];
  const active = list.filter((item) => item.is_active);
  const waiting = (orders.data ?? []).filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId);
  const verdict = shopVerdict(waiting.length, active.length, list.length - active.length);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Магазин</h1>
      <p className="mt-1 text-[15px] leading-5" style={{ color: TONE_COLOR[verdict.tone] }}>
        {items.isLoading ? " " : verdict.text}
      </p>

      <DeliverList orders={orders.data ?? []} meId={me?.userId} />

      <section className="mt-8">
        <h2 className="eyebrow px-1">Награды</h2>
        {items.isLoading ? (
          <SkeletonGroup className="mt-2 grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} h={148} className="rounded-[16px]" />
            ))}
          </SkeletonGroup>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-2.5">
            {list.map((item) => (
              <li key={item.id} className="contents">
                <RewardTile item={item} onOpen={setEditing} />
              </li>
            ))}
            <li className="contents">
              <AddRewardTile onClick={() => setEditing("new")} />
            </li>
          </ul>
        )}
        <p className="mt-2 px-1 text-[13px] leading-4 text-muted">
          Тап по награде — цена, описание, остаток
        </p>
      </section>

      <TeamPoints items={list} />

      <Link
        href="/rating"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px] transition-colors duration-[120ms] active:bg-surface-2"
      >
        Поощрить очками
        <span className="flex items-center gap-1.5 text-[13px] leading-4 text-muted">
          рейтинг команды <Chevron />
        </span>
      </Link>

      <ItemEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        item={editing}
        companyId={me?.companyId}
        onClose={() => setEditing(null)}
      />
    </main>
  );
}
