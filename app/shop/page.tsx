"use client";

import { ItemCard } from "@/components/shop/ItemCard";
import { MyOrders, OrdersQueue } from "@/components/shop/OrderList";
import { ShopSkeleton } from "@/components/shop/ShopSkeleton";
import { Mascot } from "@/components/brand/Mascot";
import { useBalance, useCreateOrder, useOrders, useShopItems, type ShopItem } from "@/lib/shop/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * Магазин поощрений (D-71): очки, заработанные за задачи, превращаются в вещи.
 * Экран открыт всем ролям и говорит каждой своё: сотрудник видит баланс, витрину и свои
 * заказы, завхоз с директором — ещё и очередь выдачи. Баланс здесь всегда точная сумма
 * транзакций (принцип 4), поэтому кнопка «Обменять» не может соврать.
 */
export default function ShopPage() {
  const me = useMe();
  const items = useShopItems();
  const orders = useOrders();
  const createOrder = useCreateOrder();

  const role = me.data?.role;
  // директор очков не зарабатывает — ему витрина показывает цены, а не кнопки
  const canOrder = role !== undefined && role !== "director" && role !== "tv";
  const isKeeper = role === "director" || role === "shopkeeper";
  const balance = useBalance(canOrder ? me.data?.userId : undefined);

  if (items.isLoading || me.isLoading) return <ShopSkeleton />;

  const list = items.data ?? [];
  const mine = (orders.data ?? []).filter((order) => order.user_id === me.data?.userId);
  const points = balance.data ?? 0;
  const affordable = canOrder ? list.filter((item) => item.price <= points).length : 0;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Магазин</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Очки за работу превращаются в награды</p>

      {canOrder ? (
        <section className="card mt-4 flex items-center gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="eyebrow">Твои очки</p>
            <p
              data-testid="shop-balance"
              className="nums mt-0.5 text-[40px] font-bold leading-[44px]"
              style={{ color: "var(--gold)" }}
            >
              {balance.isLoading ? " " : points}
            </p>
            <p className="mt-0.5 text-[13px] leading-4 text-muted">
              {balance.isLoading
                ? " "
                : affordable > 0
                  ? `Хватает на ${affordable} из ${list.length}`
                  : "Копятся за закрытые в срок задачи"}
            </p>
          </div>
          <span className="ml-auto shrink-0">
            <Mascot state={affordable > 0 ? "happy" : "calm"} size={56} />
          </span>
        </section>
      ) : null}

      <h2 className="eyebrow mt-6 px-1">Витрина</h2>
      {list.length === 0 ? (
        <p className="mt-2 px-1 text-[14px] leading-5 text-muted">
          Витрина пуста — директор ещё не выставил награды
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {list.map((item: ShopItem) => (
            <ItemCard
              key={item.id}
              item={item}
              balance={canOrder ? points : undefined}
              busy={createOrder.isPending && createOrder.variables?.id === item.id}
              onOrder={canOrder ? (chosen) => createOrder.mutate(chosen) : undefined}
            />
          ))}
        </ul>
      )}

      {canOrder ? <MyOrders orders={mine} /> : null}
      {isKeeper ? <OrdersQueue orders={orders.data ?? []} /> : null}
    </main>
  );
}
