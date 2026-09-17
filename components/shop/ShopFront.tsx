"use client";

import { Mascot } from "@/components/brand/Mascot";
import { ItemCard } from "@/components/shop/ItemCard";
import { MyOrders, OrdersQueue } from "@/components/shop/OrderList";
import { ShopSkeleton } from "@/components/shop/ShopSkeleton";
import { useBalance, useCreateOrder, useOrders, useShopItems, type ShopItem } from "@/lib/shop/queries";
import type { Me } from "@/lib/tasks/queries";

/**
 * Витрина глазами того, кто копит очки: баланс, награды и свои заказы. Баланс здесь —
 * точная сумма транзакций (принцип 4), поэтому кнопка «Обменять» не может соврать.
 * Завхоз видит то же плюс очередь выдачи: он и сотрудник, и тот, кто выдаёт.
 */
export function ShopFront({ me, pointsEnabled }: { me: Me | undefined; pointsEnabled: boolean }) {
  const items = useShopItems();
  const orders = useOrders();
  const createOrder = useCreateOrder();

  const role = me?.role;
  const spender = role !== undefined && role !== "tv";
  const canOrder = spender && pointsEnabled;
  const balance = useBalance(spender ? me?.userId : undefined);

  if (items.isLoading) return <ShopSkeleton />;

  const list = items.data ?? [];
  const mine = (orders.data ?? []).filter((order) => order.user_id === me?.userId);
  const points = balance.data ?? 0;
  const affordable = canOrder ? list.filter((item) => item.price <= points).length : 0;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Магазин</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Очки за работу превращаются в награды</p>

      {!pointsEnabled ? (
        <p className="mt-3 text-[14px] leading-5" style={{ color: "var(--warn)" }}>
          Очки в компании выключены — обмен закрыт.
        </p>
      ) : null}

      {canOrder ? (
        <section className="card mt-4 flex items-center gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="eyebrow">Очки</p>
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

      {/* заказы видны и при выключенных очках: сделанный заказ не должен исчезать с экрана */}
      {spender ? <MyOrders orders={mine} /> : null}
      {role === "shopkeeper" ? <OrdersQueue orders={orders.data ?? []} meId={me?.userId} /> : null}
    </main>
  );
}
