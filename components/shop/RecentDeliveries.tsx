"use client";

import { humanAqtobe } from "@/lib/ai/time";
import { initialsOf } from "@/lib/people/queries";
import { recentDeliveries } from "@/lib/shop/format";
import type { Order } from "@/lib/shop/queries";

/**
 * «Кому что досталось» — три последние выдачи. Это единственное место, где магазин виден
 * как событие, а не как склад: директор открывает экран и сразу знает, чем закончилась
 * прошлая неделя. Пустая лента ничего не рисует — пустых карточек на пульте нет.
 */
export function RecentDeliveries({ orders }: { orders: Order[] }) {
  const rows = recentDeliveries(orders, 3);
  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="eyebrow px-1">Кому что досталось</h2>
      <ul className="card mt-2 overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
        {rows.map((order) => (
          <li key={order.id} className="flex items-center gap-3 px-4 py-3" data-testid="recent-delivery">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
            >
              {initialsOf(order.user?.full_name ?? "")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-5">{order.user?.full_name ?? "Сотрудник"}</span>
              <span className="block truncate text-[13px] leading-4 text-muted">
                {order.item?.icon ?? "🎁"} {order.item?.title ?? "Награда"}
              </span>
            </span>
            <span className="nums shrink-0 text-[12px] leading-4 text-muted">
              {humanAqtobe(new Date(order.delivered_at as string))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
