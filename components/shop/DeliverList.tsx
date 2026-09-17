"use client";

import { Button } from "@/components/ui/Button";
import { initialsOf } from "@/lib/people/queries";
import { isOpenOrder, pointsWord, waitingRu } from "@/lib/shop/format";
import { useCancelOrder, useSetOrderStatus, type Order } from "@/lib/shop/queries";

/**
 * «Выдать» — единственное место пульта, где от директора ждут действия сегодня.
 * Поэтому у карточки ровно одна крупная кнопка: «Выдал». Промежуточный статус
 * «подтверждён» директору не показывается и не предлагается — это ярус завхоза;
 * отмена живёт мелкой ссылкой рядом, чтобы её не нажали вместо выдачи.
 */
export function DeliverList({ orders, meId }: { orders: Order[]; meId?: string }) {
  const setStatus = useSetOrderStatus();
  const cancel = useCancelOrder();
  const open = orders.filter((order) => isOpenOrder(order.status) && order.user_id !== meId);

  if (open.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="eyebrow">Выдать</h2>
        <span className="nums text-[12px] leading-4 text-muted">{open.length}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {open.map((order) => (
          <li key={order.id} className="card px-4 py-3.5" data-testid="queue-order" data-status={order.status}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-bg"
                style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
              >
                {initialsOf(order.user?.full_name ?? "")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[22px]">
                    {order.user?.full_name ?? "Сотрудник"}
                  </p>
                  <span className="shrink-0 text-[12px] leading-4 text-muted">
                    ждёт {waitingRu(new Date(order.created_at))}
                  </span>
                </div>
                {/* награда во всю ширину под именем: на 360 px колонка справа съедала её */}
                <p className="truncate text-[14px] leading-5 text-muted">
                  {order.item?.icon ?? "🎁"} {order.item?.title ?? "Награда"} ·{" "}
                  <span className="nums">{order.price}</span> {pointsWord(order.price)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button
                block
                loading={setStatus.isPending && setStatus.variables?.order.id === order.id}
                onClick={() => setStatus.mutate({ order, status: "delivered" })}
              >
                Выдал
              </Button>
              <button
                type="button"
                onClick={() => cancel.mutate(order)}
                disabled={cancel.isPending && cancel.variables?.id === order.id}
                className="min-h-[44px] shrink-0 px-2 text-[14px] leading-5 text-muted"
              >
                Отменить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
