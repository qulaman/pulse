"use client";

import { pointsWord } from "@/lib/shop/format";
import type { ShopItem } from "@/lib/shop/queries";

/**
 * Плитка награды на пульте директора: значок крупно, название, цена золотом и одна
 * строка состояния. Скрытая награда гаснет, а не исчезает — директор должен видеть,
 * что она есть. Тап по плитке — редактор, других органов управления на плитке нет.
 */
export function RewardTile({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  const dim = !item.is_active;
  const state = !item.is_active
    ? { text: "скрыта", color: "var(--text-muted)" }
    : item.stock === 0
      ? { text: "закончилась", color: "var(--danger)" }
      : item.stock !== null
        ? { text: `осталось ${item.stock}`, color: "var(--warn)" }
        : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-testid="admin-item"
      data-active={item.is_active}
      className="card flex min-h-[148px] flex-col items-start gap-1 px-3.5 py-3.5 text-left transition-transform duration-[120ms] active:scale-[0.98]"
      style={{ opacity: dim ? 0.55 : 1 }}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-[14px] text-[26px] leading-none"
        style={{ background: "var(--surface-2)" }}
      >
        {item.icon ?? "🎁"}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-5">{item.title}</span>
      <span className="mt-auto">
        <span className="nums text-[19px] font-bold leading-6" style={{ color: "var(--gold)" }}>
          {item.price}
        </span>
        <span className="ml-1 text-[13px] leading-4 text-muted">{pointsWord(item.price)}</span>
      </span>
      <span className="text-[12px] leading-4" style={{ color: state?.color ?? "transparent" }}>
        {state?.text ?? "·"}
      </span>
    </button>
  );
}

/** Пустая плитка «добавить» — та же сетка, пунктир вместо карточки. */
export function AddRewardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="add-item"
      className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-3 text-center transition-transform duration-[120ms] active:scale-[0.98]"
      style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))" }}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full text-[24px] leading-none"
        style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
      >
        +
      </span>
      <span className="text-[14px] font-semibold leading-5" style={{ color: "var(--accent)" }}>
        Добавить награду
      </span>
    </button>
  );
}
