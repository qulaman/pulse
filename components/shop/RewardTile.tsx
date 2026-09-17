"use client";

import { pointsWord, takenLabel } from "@/lib/shop/format";
import type { ShopItem } from "@/lib/shop/queries";

/**
 * Плитка награды: значок на золотом ореоле, название, ценник-ярлык и одна строка жизни —
 * сколько раз награду уносили. Состояние склада (скрыта / закончилась / осталось N) висит
 * поверх ореола ярлыком, чтобы не спорить с ценой. Тап открывает редактор; других органов
 * управления на плитке нет — руководителю хватает одного жеста.
 */
export function RewardTile({
  item,
  taken,
  onOpen,
}: {
  item: ShopItem;
  taken: number;
  onOpen: (item: ShopItem) => void;
}) {
  const state = !item.is_active
    ? { text: "скрыта", color: "var(--text-muted)", border: "var(--border)" }
    : item.stock === 0
      ? { text: "нет на складе", color: "var(--danger)", border: "color-mix(in srgb, var(--danger) 45%, transparent)" }
      : item.stock !== null
        ? { text: `${item.stock} шт.`, color: "var(--warn)", border: "color-mix(in srgb, var(--warn) 45%, transparent)" }
        : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-testid="admin-item"
      data-active={item.is_active}
      className="card relative flex min-h-[176px] flex-col items-start px-4 pb-4 pt-5 text-left transition-transform duration-[140ms] ease-out active:scale-[0.97]"
      style={{ opacity: item.is_active ? 1 : 0.6 }}
    >
      {state ? (
        <span
          className="absolute right-3 top-3 rounded-full border px-2 py-0.5 font-display text-[11px] font-semibold leading-4"
          style={{ color: state.color, borderColor: state.border }}
        >
          {state.text}
        </span>
      ) : null}

      <span className="relative flex h-14 w-14 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 22%, transparent), transparent 72%)" }}
        />
        <span aria-hidden className="relative text-[32px] leading-none">
          {item.icon ?? "🎁"}
        </span>
      </span>

      <span className="mt-3 line-clamp-2 text-[15px] font-semibold leading-5">{item.title}</span>

      <span className="mt-auto pt-3">
        <span
          className="inline-flex items-baseline gap-1 rounded-full px-2.5 py-1"
          style={{ background: "color-mix(in srgb, var(--gold) 14%, transparent)" }}
        >
          <span className="nums text-[17px] font-bold leading-5" style={{ color: "var(--gold)" }}>
            {item.price}
          </span>
          <span className="text-[12px] leading-4" style={{ color: "color-mix(in srgb, var(--gold) 70%, var(--text-muted))" }}>
            {pointsWord(item.price)}
          </span>
        </span>
        <span className="mt-1.5 block text-[12px] leading-4 text-muted">{takenLabel(taken)}</span>
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
      className="flex min-h-[176px] flex-col items-center justify-center gap-2.5 rounded-[16px] border border-dashed px-3 text-center transition-transform duration-[140ms] ease-out active:scale-[0.97]"
      style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))" }}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full text-[26px] leading-none"
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
