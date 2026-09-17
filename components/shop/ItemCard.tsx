"use client";

import { Button } from "@/components/ui/Button";
import { pointsWord, progressPct, shortfall } from "@/lib/shop/format";
import type { ShopItem } from "@/lib/shop/queries";

type Props = {
  item: ShopItem;
  /** Баланс того, кто смотрит; у директора и завхоза очков нет — им приходит undefined. */
  balance?: number;
  busy?: boolean;
  onOrder?: (item: ShopItem) => void;
};

/**
 * Карточка ништяка: за что и сколько. Когда очков хватает — одна кнопка «Обменять»;
 * когда нет — полоска накопления и сколько осталось, чтобы цель читалась, а не запрет
 * (кнопки-обманки, которая ругается после тапа, здесь нет — она и не нажимается).
 */
export function ItemCard({ item, balance, busy, onOrder }: Props) {
  const canOrder = balance !== undefined && onOrder !== undefined;
  const missing = canOrder ? shortfall(item.price, balance) : item.price;
  const affordable = canOrder && missing === 0;
  const soldOut = item.stock !== null && item.stock <= 0;

  return (
    <li className="card p-4" data-testid="shop-item" data-price={item.price}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[26px] leading-none"
          style={{ background: "var(--surface-2)" }}
        >
          {item.icon ?? "🎁"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-[22px]">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 text-[13px] leading-4 text-muted">{item.description}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-right">
          <span className="nums block text-[20px] font-bold leading-6" style={{ color: "var(--gold)" }}>
            {item.price}
          </span>
          <span className="block text-[12px] leading-4 text-muted">{pointsWord(item.price)}</span>
        </span>
      </div>

      {item.stock !== null && item.stock > 0 && item.stock <= 3 ? (
        <p className="mt-2 text-[12px] leading-4" style={{ color: "var(--warn)" }}>
          Осталось {item.stock}
        </p>
      ) : null}

      {soldOut ? (
        <p className="mt-3 text-[13px] leading-4 text-muted">Закончился — завхоз пополнит</p>
      ) : affordable ? (
        <Button
          variant="gold"
          block
          className="mt-3"
          loading={busy}
          onClick={() => onOrder?.(item)}
          data-testid="order"
        >
          Обменять
        </Button>
      ) : canOrder ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${progressPct(item.price, balance)}%`, background: "var(--gold)" }}
            />
          </div>
          <p className="mt-1.5 text-[13px] leading-4 text-muted">
            Ещё {missing} {pointsWord(missing)}
          </p>
        </div>
      ) : null}
    </li>
  );
}
