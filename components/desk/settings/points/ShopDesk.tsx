"use client";

import { useMemo, useState, type ReactNode } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { ItemEditor } from "@/components/shop/ItemEditor";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { isOpenOrder, ORDER_STATUS, pointsWord, recentDeliveries, takenCounts, takenLabel, waitingRu } from "@/lib/shop/format";
import { useAllShopItems, useCancelOrder, useOrders, useSetOrderStatus, type Order, type ShopItem } from "@/lib/shop/queries";
import { useMe } from "@/lib/tasks/queries";

function SectionHead({ title, count, end }: { title: string; count?: number; end?: ReactNode }) {
  return (
    <SectionLabel count={count} action={end} className="min-h-9">
      {title}
    </SectionLabel>
  );
}

function Price({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap">
      <Num value={value} className="font-semibold" /> <span className="text-muted">{pointsWord(value)}</span>
    </span>
  );
}

function Reward({ icon, title, sub }: { icon: string | null; title: string; sub?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-2 text-[15px] leading-none">
        {icon || "🎁"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] leading-5">{title}</span>
        {sub ? <span className="truncate text-[12px] leading-4 text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

const byTime = (field: "created_at" | "delivered_at") => (a: Order, b: Order) =>
  new Date(a[field] ?? 0).getTime() - new Date(b[field] ?? 0).getTime();

/**
 * «Магазин» of «Очки и магазин» (D-71, D-153): what waits to be handed out — the only thing the
 * director acts on today; the rewards, with an editor in a dialog (the phone's own, a upsert by an
 * id given in advance); who got what lately. Handing out writes no points: the price was held when
 * the order was made and the hold is final (principle 4); a cancel gives exactly the hold back.
 */
export function ShopDesk() {
  const me = useMe().data;
  const items = useAllShopItems(true);
  const orders = useOrders();
  const setStatus = useSetOrderStatus();
  const cancel = useCancelOrder();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const all = useMemo(() => orders.data ?? [], [orders.data]);
  // the director's own orders are not his to hand out (as on the phone)
  const waiting = useMemo(() => all.filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId), [all, me?.userId]);
  const taken = useMemo(() => takenCounts(all), [all]);
  const recent = useMemo(() => recentDeliveries(all, 10), [all]);
  const list = items.data ?? [];

  const queueColumns: Column<Order>[] = [
    { key: "who", title: "Кто", width: "minmax(180px,1fr)", render: (order) => <PersonCell name={order.user?.full_name ?? "Сотрудник"} /> },
    { key: "item", title: "Награда", width: "minmax(200px,1.4fr)", render: (order) => <Reward icon={order.item?.icon ?? null} title={order.item?.title ?? "Награда"} /> },
    { key: "price", title: "Цена", width: "120px", align: "right", sort: (a, b) => a.price - b.price, render: (order) => <Price value={order.price} /> },
    { key: "status", title: "Статус", width: "170px", render: (order) => <span className="text-muted">{ORDER_STATUS[order.status].text}</span> },
    {
      key: "wait",
      title: "Ждёт",
      width: "110px",
      sort: byTime("created_at"),
      render: (order) => <span className="nums whitespace-nowrap text-muted">{waitingRu(new Date(order.created_at))}</span>,
    },
    {
      key: "act",
      title: "",
      width: "200px",
      align: "right",
      render: (order) => (
        <span className="flex justify-end gap-1.5">
          <Button
            size="sm"
            loading={setStatus.isPending && setStatus.variables?.order.id === order.id}
            onClick={() => setStatus.mutate({ order, status: "delivered" })}
            data-testid="order-deliver"
          >
            Выдал
          </Button>
          <Button size="sm" variant="ghost" disabled={cancel.isPending && cancel.variables?.id === order.id} onClick={() => cancel.mutate(order)}>
            Отменить
          </Button>
        </span>
      ),
    },
  ];

  const itemColumns: Column<ShopItem>[] = [
    {
      key: "item",
      title: "Награда",
      width: "minmax(240px,2fr)",
      sort: (a, b) => a.title.localeCompare(b.title, "ru"),
      render: (item) => <Reward icon={item.icon} title={item.title} sub={item.description} />,
    },
    { key: "price", title: "Цена", width: "120px", align: "right", sort: (a, b) => a.price - b.price, render: (item) => <Price value={item.price} /> },
    {
      key: "stock",
      title: "Осталось",
      width: "120px",
      align: "right",
      sort: (a, b) => (a.stock ?? Number.POSITIVE_INFINITY) - (b.stock ?? Number.POSITIVE_INFINITY),
      render: (item) => (item.stock === null ? <span className="text-muted">без счёта</span> : <span><Num value={item.stock} /> шт.</span>),
    },
    {
      key: "taken",
      title: "Брали",
      width: "150px",
      sort: (a, b) => (taken[a.id] ?? 0) - (taken[b.id] ?? 0),
      render: (item) => <span className="text-muted">{takenLabel(taken[item.id] ?? 0)}</span>,
    },
    {
      key: "shown",
      title: "Витрина",
      width: "110px",
      // shown is the usual state — a plain word; hidden is the one worth noticing, quiet like its row
      render: (item) => (item.is_active ? <span>видна</span> : <span className="text-muted">скрыта</span>),
    },
    {
      key: "edit",
      title: "",
      width: "120px",
      align: "right",
      render: (item) => (
        <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
          Изменить
        </Button>
      ),
    },
  ];

  const recentColumns: Column<Order>[] = [
    { key: "who", title: "Кто", width: "minmax(180px,1fr)", render: (order) => <PersonCell name={order.user?.full_name ?? "Сотрудник"} /> },
    { key: "item", title: "Награда", width: "minmax(200px,1.4fr)", render: (order) => <Reward icon={order.item?.icon ?? null} title={order.item?.title ?? "Награда"} /> },
    { key: "price", title: "Цена", width: "120px", align: "right", render: (order) => <Price value={order.price} /> },
    {
      key: "when",
      title: "Выдано",
      width: "150px",
      sort: byTime("delivered_at"),
      render: (order) => <span className="nums whitespace-nowrap text-muted">{order.delivered_at ? humanAqtobe(new Date(order.delivered_at)) : "—"}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-label="Выдать">
        <SectionHead title="Выдать" count={waiting.length} />
        <DataGrid
          aria-label="Заказы к выдаче"
          columns={queueColumns}
          rows={waiting}
          rowKey={(order) => order.id}
          rowTone={(order) => (order.status === "pending" ? "warn" : "accent")}
          empty={
            <EmptyState
              title={orders.isPending ? "Загружаю заказы" : "Выдавать нечего"}
              hint={orders.isPending ? undefined : "Заказ сотрудника появится здесь сразу — очки за него уже придержаны"}
            />
          }
        />
      </section>

      <section className="flex flex-col gap-2" aria-label="Награды">
        <SectionHead
          title="Награды"
          count={list.length}
          end={
            <Button size="sm" onClick={() => setEditing("new")} data-testid="shop-add-item">
              + Награда
            </Button>
          }
        />
        <DataGrid
          aria-label="Награды магазина"
          columns={itemColumns}
          rows={list}
          rowKey={(item) => item.id}
          selectedKey={selectedItem}
          onSelect={(item) => setSelectedItem(item.id)}
          onActivate={(item) => setEditing(item)}
          rowTone={(item) => (item.is_active ? null : "muted")}
          empty={
            <EmptyState
              title={items.isPending ? "Загружаю награды" : "Наград пока нет"}
              hint={items.isPending ? undefined : "Добавьте первую: что человек получит и сколько это стоит в очках"}
            />
          }
        />
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Недавно выдано">
          <SectionHead title="Недавно выдано" />
          <DataGrid aria-label="Недавно выданные награды" columns={recentColumns} rows={recent} rowKey={(order) => order.id} empty={null} />
        </section>
      ) : null}

      <ItemEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        item={editing}
        companyId={me?.companyId}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
