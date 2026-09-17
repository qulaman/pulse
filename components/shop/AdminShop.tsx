"use client";

import Link from "next/link";
import { useState } from "react";

import { ItemEditor } from "@/components/shop/ItemEditor";
import { OrdersQueue } from "@/components/shop/OrderList";
import { PointsLedger } from "@/components/shop/PointsLedger";
import { Button } from "@/components/ui/Button";
import { pointsWord } from "@/lib/shop/format";
import { useAllShopItems, useOrders, type ShopItem } from "@/lib/shop/queries";
import type { Me } from "@/lib/tasks/queries";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-muted">
      <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Состояние награды во второй строке, а не отдельной колонкой: на 390 px колонка справа
 * съедала название до многоточия, а имя награды — главное в строке.
 */
function ItemState({ item }: { item: ShopItem }) {
  if (!item.is_active) return <span style={{ color: "var(--warn)" }}> · скрыта</span>;
  if (item.stock === 0) return <span style={{ color: "var(--danger)" }}> · закончилась</span>;
  if (item.stock !== null) return <span className="nums"> · осталось {item.stock}</span>;
  return null;
}

/**
 * Магазин глазами директора — не витрина, а пульт (D-71, уточнение владельца): очередь
 * выдачи сверху (это единственное, что требует действия сегодня), затем ассортимент с
 * правкой в один тап и лента очков компании. Очков директор не копит, поэтому «Обменять»
 * здесь нет вовсе; поощрение людей живёт на Рейтинге (D-48) — отсюда ссылка.
 */
export function AdminShop({ me }: { me: Me | undefined }) {
  const items = useAllShopItems(true);
  const orders = useOrders();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);

  const list = items.data ?? [];
  const hidden = list.filter((item) => !item.is_active).length;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Магазин</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Награды, выдача и очки компании{hidden > 0 ? ` · скрыто наград: ${hidden}` : ""}
      </p>

      <OrdersQueue orders={orders.data ?? []} meId={me?.userId} />

      <section className="mt-7">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="eyebrow">Награды</h2>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="min-h-[32px] text-[14px] leading-5 text-accent"
            data-testid="add-item"
          >
            + Добавить
          </button>
        </div>

        {list.length === 0 ? (
          <div className="card mt-2 px-4 py-5 text-center">
            <p className="text-[15px] leading-5">Наград пока нет</p>
            <p className="mt-1 text-[13px] leading-4 text-muted">
              Добавь первую — сотрудники увидят её на витрине сразу
            </p>
            <Button className="mt-3" onClick={() => setEditing("new")}>
              Добавить награду
            </Button>
          </div>
        ) : (
          <ul className="card mt-2 overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[120ms] active:bg-surface-2"
                  data-testid="admin-item"
                  data-active={item.is_active}
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[20px] leading-none"
                    style={{ background: "var(--surface-2)", opacity: item.is_active ? 1 : 0.5 }}
                  >
                    {item.icon ?? "🎁"}
                  </span>
                  <span className="min-w-0 flex-1" style={{ opacity: item.is_active ? 1 : 0.6 }}>
                    <span className="block truncate text-[16px] leading-[22px]">{item.title}</span>
                    <span className="block truncate text-[13px] leading-4 text-muted">
                      <span className="nums">{item.price}</span> {pointsWord(item.price)}
                      <ItemState item={item} />
                    </span>
                  </span>
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PointsLedger />

      <Link
        href="/rating"
        className="mt-2 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]"
      >
        Поощрить очками
        <span className="text-[13px] leading-4 text-muted">рейтинг и начисления ›</span>
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
