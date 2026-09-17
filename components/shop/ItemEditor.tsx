"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { pointsWord } from "@/lib/shop/format";
import { useDeleteShopItem, useSaveShopItem, type ItemDraft, type ShopItem } from "@/lib/shop/queries";

const ICONS = ["🎁", "🧥", "🦺", "🏖️", "💰", "☕", "🎟️", "🍽️", "🎧", "⛽"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="eyebrow">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

const INPUT = "mt-1.5 min-h-[44px] w-full field px-3 text-[16px] outline-none";

/**
 * Редактор награды — один и тот же лист для «добавить» и «изменить»: id выдаётся заранее,
 * поэтому сохранение всегда upsert, а повторный тап не рождает второй товар (принцип 7).
 * Удаление возможно, только пока награду никто не заказывал: история заказов дороже.
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
  const valid =
    title.trim().length > 0 &&
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    (stockNumber === null || (Number.isFinite(stockNumber) && stockNumber >= 0));

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
      <Field label="Значок">
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ICONS.map((emoji) => (
            <Chip key={emoji} tone={icon === emoji ? "accent" : "neutral"} onClick={() => setIcon(emoji)}>
              <span className="text-[16px] leading-5">{emoji}</span>
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Название">
        <input
          className={INPUT}
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Брендовая куртка"
        />
      </Field>

      <Field label="Описание" hint="Одна строка: что человек получает">
        <input
          className={INPUT}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Тёплая куртка с логотипом компании"
        />
      </Field>

      <div className="flex gap-3">
        <Field label="Цена в очках">
          <input
            className={`${INPUT} nums`}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="200"
          />
        </Field>
        <Field label="Остаток" hint="Пусто — без ограничения">
          <input
            className={`${INPUT} nums`}
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="∞"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setActive((on) => !on)}
        className="mt-4 flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[12px] border border-border px-3 text-left"
      >
        <span className="text-[15px] leading-5">
          Показывать в магазине
          <span className="mt-0.5 block text-[12px] leading-4 text-muted">
            {active ? "Сотрудники видят награду на витрине" : "Скрыта: заказать нельзя, история цела"}
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

      <div className="mt-5 flex items-center gap-3">
        <Button block loading={save.isPending} disabled={!valid} onClick={submit}>
          {existing ? "Сохранить" : `Добавить за ${priceNumber > 0 ? `${priceNumber} ${pointsWord(priceNumber)}` : "очки"}`}
        </Button>
      </div>
      {existing ? (
        <Button
          variant="danger"
          block
          className="mt-2"
          loading={remove.isPending}
          onClick={() => remove.mutate(existing, { onSuccess: onClose })}
        >
          Удалить
        </Button>
      ) : null}
    </Sheet>
  );
}
