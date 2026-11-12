"use client";

import { EyeOff, Pencil, Plus } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ItemDialog } from "@/components/desk/settings/points/ItemDialog";
import { TileFace } from "@/components/desk/team/TeamGrid";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { formatNum } from "@/lib/desk/format";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { isOpenOrder, ORDER_STATUS, pointsWord, recentDeliveries, takenCounts, takenLabel, waitingRu } from "@/lib/shop/format";
import { useAllShopItems, useCancelOrder, useOrders, useSaveShopItem, useSetOrderStatus, type Order, type ShopItem } from "@/lib/shop/queries";
import { useMe } from "@/lib/tasks/queries";

function SectionHead({ title, count, end }: { title: string; count?: number; end?: ReactNode }) {
  return (
    <SectionLabel count={count} action={end} className="pts-shop-head min-h-9">
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

/** A reward in a table cell: its icon on a small well, the title. */
function Reward({ title, icon }: { title: string; icon?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="pts-reward-icon">
        {icon || "🎁"}
      </span>
      <span className="truncate text-[14px] leading-5" title={title}>
        {title}
      </span>
    </span>
  );
}

/** A person in a table cell of the shop: their circle and the name. */
function Who({ id, name, avatar }: { id: string; name: string; avatar: string | null }) {
  useNamesKey();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TileFace person={{ id, full_name: name, avatar_url: avatar }} size={26} />
      <span className="truncate" title={name}>
        {shortName(name)}
      </span>
    </span>
  );
}

const byTime = (field: "created_at" | "delivered_at") => (a: Order, b: Order) =>
  new Date(a[field] ?? 0).getTime() - new Date(b[field] ?? 0).getTime();

/**
 * A reward as a product card: its icon large, the title and the line under it, the price in the
 * reward's gold, what is left and how often it was taken; a hidden one is quiet with its word.
 * A click or Enter opens the editor, the right button its menu.
 */
function ItemCardDesk({ item, taken, chosen, index, onOpen, onChoose }: { item: ShopItem; taken: number; chosen: boolean; index: number; onOpen: () => void; onChoose: () => void }) {
  const soldOut = item.stock !== null && item.stock <= 0;
  return (
    <button
      type="button"
      className="pts-item"
      data-row-key={item.id}
      data-hidden={item.is_active ? undefined : ""}
      data-chosen={chosen ? "" : undefined}
      data-testid="shop-item-card"
      onClick={onOpen}
      onFocus={onChoose}
      aria-label={`${item.title}, ${formatNum(item.price)} ${pointsWord(item.price)}${item.is_active ? "" : ", скрыта"} — изменить`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <span className="pts-item-top">
        <span aria-hidden className="pts-item-icon">
          {item.icon || "🎁"}
        </span>
        {item.is_active ? null : (
          <span className="pts-item-flag">
            <EyeOff size={12} strokeWidth={2.25} aria-hidden />
            скрыта
          </span>
        )}
        <Pencil size={14} strokeWidth={2} aria-hidden className="pts-item-edit" />
      </span>
      <span className="pts-item-title">{item.title}</span>
      <span className="pts-item-about">{item.description || " "}</span>
      <span className="pts-item-price">
        <span className="nums">{formatNum(item.price)}</span>
        <span className="pts-item-unit">{pointsWord(item.price)}</span>
      </span>
      <span className="pts-item-facts">
        <span data-tone={soldOut ? "warn" : undefined}>{item.stock === null ? "без счёта" : soldOut ? "закончилась" : `осталось ${formatNum(item.stock)} шт.`}</span>
        <span>{takenLabel(taken)}</span>
      </span>
    </button>
  );
}

/** The shelf while the rewards load: cards of the real size. */
function ShelfBone() {
  return (
    <div className="pts-shelf" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="pts-item pts-item-bone">
          <Bone h={44} w={44} />
          <Bone h={16} w="70%" className="mt-4" />
          <Bone h={12} w="90%" className="mt-2" />
          <Bone h={22} w={80} className="mt-4" />
        </div>
      ))}
    </div>
  );
}

/**
 * «Магазин» of «Очки и магазин» (D-71, D-153, D-174): what waits to be handed out — the only thing
 * the director acts on today — as a queue with faces; the rewards as a shelf of product cards, the
 * desk's editor in a dialog (an upsert by an id given in advance) and a right click to hide or show
 * one; who got what lately. Handing out writes no points: the price was held when the order was
 * made and the hold is final (principle 4); a cancel gives exactly the hold back.
 */
export function ShopDesk() {
  const me = useMe().data;
  const items = useAllShopItems(true);
  const orders = useOrders();
  const people = usePeople();
  const setStatus = useSetOrderStatus();
  const cancel = useCancelOrder();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const saveItem = useSaveShopItem(me?.companyId);
  const menu = useContextMenu();
  const shelf = useRef<HTMLDivElement>(null);
  /** Shown or hidden from the card's menu: the same upsert as the editor's, every field as it is. */
  const toggleShown = (item: ShopItem) =>
    saveItem.mutate({ id: item.id, title: item.title, description: item.description, icon: item.icon, price: item.price, stock: item.stock, is_active: !item.is_active });

  const avatars = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.avatar_url])), [people.data]);
  const all = useMemo(() => orders.data ?? [], [orders.data]);
  // the director's own orders are not his to hand out (as on the phone)
  const waiting = useMemo(() => all.filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId), [all, me?.userId]);
  const taken = useMemo(() => takenCounts(all), [all]);
  const recent = useMemo(() => recentDeliveries(all, 10), [all]);
  const list = items.data ?? [];

  const queueColumns: Column<Order>[] = [
    { key: "who", title: "Кто", width: "minmax(100px,1fr)", render: (order) => <Who id={order.user_id} name={order.user?.full_name ?? "Сотрудник"} avatar={avatars.get(order.user_id) ?? null} /> },
    { key: "item", title: "Награда", width: "minmax(110px,1.3fr)", render: (order) => <Reward title={order.item?.title ?? "Награда"} icon={order.item?.icon} /> },
    { key: "price", title: "Цена", width: "96px", align: "right", sort: (a, b) => a.price - b.price, render: (order) => <Price value={order.price} /> },
    {
      key: "status",
      title: "Статус",
      width: "172px",
      render: (order) => (
        <span className="pts-status whitespace-nowrap" data-tone={ORDER_STATUS[order.status].tone}>
          {ORDER_STATUS[order.status].text}
        </span>
      ),
    },
    {
      key: "wait",
      title: "Ждёт",
      width: "80px",
      sort: byTime("created_at"),
      render: (order) => (
        <span className="whitespace-nowrap text-muted">
          <When>{waitingRu(new Date(order.created_at))}</When>
        </span>
      ),
    },
    {
      key: "act",
      title: "",
      width: "164px",
      align: "right",
      render: (order) => (
        <span className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="desk-move !min-h-7 !px-2.5"
            loading={setStatus.isPending && setStatus.variables?.order.id === order.id}
            onClick={() => setStatus.mutate({ order, status: "delivered" })}
            data-testid="order-deliver"
          >
            Выдал
          </Button>
          <Button size="sm" variant="ghost" className="!min-h-7 !px-2" disabled={cancel.isPending && cancel.variables?.id === order.id} onClick={() => cancel.mutate(order)}>
            Отменить
          </Button>
        </span>
      ),
    },
  ];

  const recentColumns: Column<Order>[] = [
    { key: "who", title: "Кто", width: "minmax(180px,1fr)", render: (order) => <Who id={order.user_id} name={order.user?.full_name ?? "Сотрудник"} avatar={avatars.get(order.user_id) ?? null} /> },
    { key: "item", title: "Награда", width: "minmax(200px,1.4fr)", render: (order) => <Reward title={order.item?.title ?? "Награда"} icon={order.item?.icon} /> },
    { key: "price", title: "Цена", width: "120px", align: "right", render: (order) => <Price value={order.price} /> },
    {
      key: "when",
      title: "Выдано",
      width: "150px",
      sort: byTime("delivered_at"),
      render: (order) => (
        <span className="whitespace-nowrap text-muted">
          <When>{order.delivered_at ? humanAqtobe(new Date(order.delivered_at)) : "—"}</When>
        </span>
      ),
    },
  ];

  /** ←/→/↑/↓ walk the shelf as it stands, Enter opens the card under the caret (the button's own). */
  const walkShelf = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 };
    if (!(event.key in moves)) return;
    const cards = [...(shelf.current?.querySelectorAll<HTMLElement>(".pts-item[data-row-key]") ?? [])];
    const at = cards.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    let next = at + moves[event.key];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // the card straight under or over this one: the nearest by its left edge in the next row
      const box = cards[at].getBoundingClientRect();
      const rows = cards.filter((card) => {
        const other = card.getBoundingClientRect();
        return event.key === "ArrowDown" ? other.top > box.bottom - 4 : other.bottom < box.top + 4;
      });
      const row = event.key === "ArrowDown" ? rows.filter((card) => card.getBoundingClientRect().top === rows[0]?.getBoundingClientRect().top) : rows.filter((card) => card.getBoundingClientRect().top === rows.at(-1)?.getBoundingClientRect().top);
      const target = row.sort((a, b) => Math.abs(a.getBoundingClientRect().left - box.left) - Math.abs(b.getBoundingClientRect().left - box.left))[0];
      next = target ? cards.indexOf(target) : at;
    }
    cards[Math.max(0, Math.min(cards.length - 1, next))]?.focus();
  };

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-2" aria-label="Выдать">
        <SectionHead title="Выдать" count={waiting.length} />
        <div
          onContextMenu={(event) => {
            const row = (event.target as Element).closest<HTMLElement>("[data-row-key]");
            const order = row ? waiting.find((o) => o.id === row.dataset.rowKey) : undefined;
            if (!order) return;
            setSelectedOrder(order.id);
            menu.open(event, [
              { key: "deliver", label: "Выдал", onSelect: () => setStatus.mutate({ order, status: "delivered" }) },
              "separator",
              { key: "cancel", label: "Отменить заказ — очки вернутся", danger: true, onSelect: () => cancel.mutate(order) },
            ]);
          }}
        >
          <DataGrid
            aria-label="Заказы к выдаче"
            columns={queueColumns}
            rows={waiting}
            rowKey={(order) => order.id}
            selectedKey={selectedOrder}
            onSelect={(order) => setSelectedOrder(order.id)}
            empty={
              orders.isPending ? (
                <EmptyState title="Загружаю заказы" />
              ) : (
                <EmptyState tone="ok" title="Выдавать нечего" hint="Заказ сотрудника появится здесь сразу — очки за него уже придержаны" />
              )
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Награды">
        <SectionHead
          title="Награды"
          count={list.length}
          end={
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")} data-testid="shop-add-item" icon={<Plus size={15} strokeWidth={2.25} />}>
              Награда
            </Button>
          }
        />
        {items.isPending ? (
          <ShelfBone />
        ) : items.isError ? (
          <EmptyState
            title="Награды не загрузить"
            hint="Проверьте связь и попробуйте ещё раз"
            action={
              <Button size="sm" variant="secondary" onClick={() => void items.refetch()}>
                Повторить
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            title="Наград пока нет"
            hint="Добавьте первую: что человек получит и сколько это стоит в очках"
            action={
              <Button size="sm" variant="secondary" onClick={() => setEditing("new")} icon={<Plus size={15} strokeWidth={2.25} />}>
                Награда
              </Button>
            }
          />
        ) : (
          <div
            ref={shelf}
            role="list"
            aria-label="Награды магазина"
            className="pts-shelf"
            onKeyDown={walkShelf}
            onContextMenu={(event) => {
              const card = (event.target as Element).closest<HTMLElement>("[data-row-key]");
              const item = card ? list.find((i) => i.id === card.dataset.rowKey) : undefined;
              if (!item) return;
              setSelectedItem(item.id);
              menu.open(event, [
                { key: "edit", label: "Изменить…", hint: "Enter", onSelect: () => setEditing(item) },
                { key: "shown", label: item.is_active ? "Скрыть с витрины" : "Показать на витрине", onSelect: () => toggleShown(item) },
              ]);
            }}
          >
            {list.map((item, index) => (
              <div key={item.id} role="listitem" className="contents">
                <ItemCardDesk item={item} taken={taken[item.id] ?? 0} chosen={selectedItem === item.id} index={index} onOpen={() => setEditing(item)} onChoose={() => setSelectedItem(item.id)} />
              </div>
            ))}
            <div role="listitem" className="contents">
              <button type="button" className="pts-item pts-item-add" onClick={() => setEditing("new")} aria-label="Добавить награду">
                <Plus size={20} strokeWidth={2} aria-hidden />
                <span>Новая награда</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Недавно выдано">
          <SectionHead title="Недавно выдано" />
          <DataGrid aria-label="Недавно выданные награды" columns={recentColumns} rows={recent} rowKey={(order) => order.id} empty={null} />
        </section>
      ) : null}

      {menu.node}
      <ItemDialog item={editing} companyId={me?.companyId} onClose={() => setEditing(null)} />
    </div>
  );
}
