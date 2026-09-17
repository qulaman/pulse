"use client";

import { useState } from "react";

import { ItemCard } from "@/components/shop/ItemCard";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { useDeleteShopItem, useSaveShopItem, type ItemDraft, type ShopItem } from "@/lib/shop/queries";

const ICONS = ["🎁", "🧥", "🦺", "🏖️", "💰", "☕", "🎟️", "🍽️", "🎧", "⛽"];
const PRICES = [100, 200, 500, 1000, 2000];

const INPUT = "mt-1.5 min-h-[46px] w-full field px-3 text-[16px] outline-none";
// поле остатка стоит рядом с чипом «сколько угодно» — своя ширина, без w-full
const INPUT_QTY = "nums min-h-[46px] w-24 field px-3 text-[16px] outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <span className="eyebrow">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-4 text-muted">{hint}</span> : null}
    </div>
  );
}

/**
 * Редактор награды — один лист и для «добавить», и для «изменить»: id выдаётся заранее,
 * поэтому сохранение всегда upsert, а повторный тап не рождает второй товар (принцип 7).
 * Сверху — живое превью: директор видит карточку ровно такой, какой её увидит сотрудник,
 * и не гадает, как сложатся значок, название и цена. Удаление возможно, только пока
 * награду никто не заказывал: история заказов дороже.
 */
export function ItemEditor({
  item,
  companyId,
  onClose,
}: {
  item: ShopItem | "new" | null;
  companyId: string | undefined;
  onClose: () => void;
}) {
  const existing = item !== null && item !== "new" ? item : null;
  const save = useSaveShopItem(companyId);
  const remove = useDeleteShopItem();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "🎁");
  const [price, setPrice] = useState(String(existing?.price ?? ""));
  const [stock, setStock] = useState(existing?.stock === null || existing === null ? "" : String(existing.stock));
  const [active, setActive] = useState(existing?.is_active ?? true);

  const priceNumber = Math.trunc(Number(price));
  const stockNumber = stock.trim() === "" ? null : Math.trunc(Number(stock));
  const valid = title.trim().length > 0 && Number.isFinite(priceNumber) && priceNumber > 0;

  // превью — та же карточка, что на витрине; баланс не передаём, поэтому кнопки в ней нет
  const preview: ShopItem = {
    id: existing?.id ?? "preview",
    company_id: companyId ?? "",
    title: title.trim() || "Название награды",
    description: description?.trim() || null,
    icon,
    photo_path: null,
    price: priceNumber > 0 ? priceNumber : 0,
    stock: stockNumber,
    is_active: active,
    sort: existing?.sort ?? 100,
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: existing?.updated_at ?? new Date().toISOString(),
  };

  const submit = () => {
    if (!valid) return;
    const draft: ItemDraft = {
      id: existing?.id ?? crypto.randomUUID(),
      title,
      description,
      icon,
      price: priceNumber,
      stock: stockNumber,
      is_active: active,
    };
    save.mutate(draft, { onSuccess: onClose });
  };

  return (
    <Sheet open={item !== null} onClose={onClose} title={existing ? "Награда" : "Новая награда"}>
      <p className="eyebrow">Так увидит сотрудник</p>
      <ul className="mt-1.5 pointer-events-none">
        <ItemCard item={preview} />
      </ul>

      <Field label="Значок">
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ICONS.map((emoji) => (
            <Chip key={emoji} tone={icon === emoji ? "accent" : "neutral"} onClick={() => setIcon(emoji)}>
              <span className="text-[16px] leading-5">{emoji}</span>
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Что это">
        <input
          className={INPUT}
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Брендовая куртка"
        />
        <input
          className={INPUT}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Одна строка: что человек получает"
        />
      </Field>

      <Field label="Сколько стоит">
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PRICES.map((p) => (
            <Chip key={p} tone={priceNumber === p ? "accent" : "neutral"} onClick={() => setPrice(String(p))}>
              {p}
            </Chip>
          ))}
        </div>
        <input
          className={`${INPUT} nums`}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Своя цена в очках"
        />
      </Field>

      <Field label="Сколько есть">
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Chip tone={stockNumber === null ? "accent" : "neutral"} onClick={() => setStock("")}>
            Сколько угодно
          </Chip>
          <input
            className={INPUT_QTY}
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="шт."
            aria-label="Сколько штук"
          />
        </div>
      </Field>

      <button
        type="button"
        onClick={() => setActive((on) => !on)}
        className="mt-4 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[12px] border border-border px-3.5 text-left"
      >
        <span className="text-[15px] leading-5">
          Показывать в магазине
          <span className="mt-0.5 block text-[12px] leading-4 text-muted">
            {active ? "Сотрудники видят её на витрине" : "Скрыта: заказать нельзя, история цела"}
          </span>
        </span>
        <span
          aria-hidden
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[120ms]"
          style={{ background: active ? "var(--accent)" : "var(--surface-2)" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-[120ms]"
            style={{ left: active ? 22 : 2 }}
          />
        </span>
      </button>

      <Button block className="mt-5" loading={save.isPending} disabled={!valid} onClick={submit}>
        {existing ? "Сохранить" : "Добавить"}
      </Button>
      {existing ? (
        <button
          type="button"
          onClick={() => remove.mutate(existing, { onSuccess: onClose })}
          disabled={remove.isPending}
          className="mt-2 min-h-[44px] w-full text-[14px] leading-5"
          style={{ color: "var(--danger)" }}
        >
          Удалить награду
        </button>
      ) : null}
    </Sheet>
  );
}
