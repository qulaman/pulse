"use client";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { humanAqtobe } from "@/lib/ai/time";
import { ORDER_STATUS, cancellableByOwner, isOpenOrder, pointsWord } from "@/lib/shop/format";
import { useCancelOrder, useSetOrderStatus, type Order } from "@/lib/shop/queries";

/**
 * Шапка заказа: что заказано, кем и когда. Статус и действия идут строкой ниже — на
 * 360 px чип рядом с названием съедал его до многоточия.
 */
function OrderHead({ order, who }: { order: Order; who?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[22px] leading-none"
        style={{ background: "var(--surface-2)" }}
      >
        {order.item?.icon ?? "🎁"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-5">{order.item?.title ?? "Товар"}</p>
        <p className="mt-0.5 text-[13px] leading-4 text-muted">
          {who ? `${who} · ` : ""}
          <span className="nums">{order.price}</span> {pointsWord(order.price)} ·{" "}
          {humanAqtobe(new Date(order.created_at))}
        </p>
      </div>
    </div>
  );
}

function StatusChip({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status];
  return (
    <Chip tone={status.tone} interactive={false}>
      {status.text}
    </Chip>
  );
}

/** «Мои заказы»: что заказано и на какой стадии; забрать очки назад можно до подтверждения. */
export function MyOrders({ orders }: { orders: Order[] }) {
  const cancel = useCancelOrder();

  if (orders.length === 0) return null;

  return (
    <section className="mt-7">
      <h2 className="eyebrow px-1">Мои заказы</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {orders.map((order) => (
          <li key={order.id} className="card p-3.5" data-testid="my-order" data-status={order.status}>
            <OrderHead order={order} />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusChip order={order} />
              {cancellableByOwner(order.status) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending && cancel.variables?.id === order.id}
                  onClick={() => cancel.mutate(order)}
                >
                  Отменить
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Очередь выдачи: директор и завхоз видят чужие заказы. Очки уже списаны при заказе
 * (hold-final, D-10), поэтому выдача — один тап и ни одной новой транзакции.
 */
export function OrdersQueue({ orders }: { orders: Order[] }) {
  const setStatus = useSetOrderStatus();
  const cancel = useCancelOrder();
  const open = orders.filter((order) => isOpenOrder(order.status));
  const closed = orders.filter((order) => !isOpenOrder(order.status)).slice(0, 10);
  const busyId = setStatus.isPending ? setStatus.variables?.order.id : undefined;

  return (
    <section className="mt-7">
      <h2 className="eyebrow px-1">Заказы сотрудников</h2>
      {open.length === 0 ? (
        <p className="mt-2 px-1 text-[14px] leading-5 text-muted">Невыданных заказов нет</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {open.map((order) => (
            <li key={order.id} className="card p-3.5" data-testid="queue-order" data-status={order.status}>
              <OrderHead order={order} who={order.user?.full_name} />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {/* у нового заказа статус и так написан кнопкой «Подтвердить» — чип только у подтверждённого */}
                {order.status === "approved" ? <StatusChip order={order} /> : null}
                {order.status === "pending" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyId === order.id && setStatus.variables?.status === "approved"}
                    onClick={() => setStatus.mutate({ order, status: "approved" })}
                  >
                    Подтвердить
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  loading={busyId === order.id && setStatus.variables?.status === "delivered"}
                  onClick={() => setStatus.mutate({ order, status: "delivered" })}
                >
                  Выдал
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending && cancel.variables?.id === order.id}
                  onClick={() => cancel.mutate(order)}
                >
                  Отменить
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2 opacity-70">
          {closed.map((order) => (
            <li key={order.id} className="card p-3.5" data-testid="queue-order" data-status={order.status}>
              <OrderHead order={order} who={order.user?.full_name} />
              <div className="mt-2.5">
                <StatusChip order={order} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
