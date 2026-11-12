"use client";

import { useEffect, useState } from "react";

import { Switch } from "@/components/desk/settings/form";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ItemCard } from "@/components/shop/ItemCard";
import { Button } from "@/components/ui/Button";
import { formatNum } from "@/lib/desk/format";
import { useDeleteShopItem, useSaveShopItem, type ItemDraft, type ShopItem } from "@/lib/shop/queries";

const ICONS = ["🎁", "🧥", "🦺", "🏖️", "💰", "☕", "🎟️", "🍽️", "🎧", "⛽", "📱", "🎫"];
const PRICES = [100, 200, 500, 1000, 2000];

function Label({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="desk-label mb-0.5 block uppercase">
      {children}
    </label>
  );
}

function ItemForm({ item, companyId, onDone }: { item: ShopItem | null; companyId: string | undefined; onDone: () => void }) {
  const save = useSaveShopItem(companyId);
  const remove = useDeleteShopItem();
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [icon, setIcon] = useState(item?.icon ?? "🎁");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [stock, setStock] = useState(item?.stock === null || !item ? "" : String(item.stock));
  const [counted, setCounted] = useState(item ? item.stock !== null : false);
  const [active, setActive] = useState(item?.is_active ?? true);
  const [sure, setSure] = useState(false);

  // «Удалить» asks once more, and forgets the question after a moment
  useEffect(() => {
    if (!sure) return;
    const timer = setTimeout(() => setSure(false), 3500);
    return () => clearTimeout(timer);
  }, [sure]);

  const priceNumber = Math.trunc(Number(price));
  const stockNumber = counted ? Math.max(0, Math.trunc(Number(stock) || 0)) : null;
  const valid = title.trim().length > 0 && Number.isFinite(priceNumber) && priceNumber > 0;

  // the same card as on the shop's shelf; no balance — so no button in it
  const preview: ShopItem = {
    id: item?.id ?? "preview",
    company_id: companyId ?? "",
    title: title.trim() || "Название награды",
    description: description.trim() || null,
    icon,
    photo_path: null,
    price: priceNumber > 0 ? priceNumber : 0,
    stock: stockNumber,
    is_active: active,
    sort: item?.sort ?? 100,
    created_at: item?.created_at ?? new Date().toISOString(),
    updated_at: item?.updated_at ?? new Date().toISOString(),
  };

  const submit = () => {
    if (!valid || save.isPending) return;
    // the id is given before the save: a repeated save is the same upsert, never a second reward (principle 7)
    const draft: ItemDraft = { id: item?.id ?? crypto.randomUUID(), title, description, icon, price: priceNumber, stock: stockNumber, is_active: active };
    save.mutate(draft, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }}
      className="item-form desk-fields grid grid-cols-[minmax(0,1fr)_260px] gap-6"
      data-testid="shop-item-form"
    >
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="item-title">Что это</Label>
          <input id="item-title" data-autofocus value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Брендовая куртка" className="field h-9 w-full text-[14px] leading-5 outline-none" />
          <input
            aria-label="Описание"
            value={description}
            maxLength={140}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Одна строка: что человек получает"
            className="field h-9 w-full text-[14px] leading-5 outline-none"
          />
        </div>

        <div>
          <Label>Значок</Label>
          <div role="radiogroup" aria-label="Значок" className="flex flex-wrap items-center gap-1">
            {ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={icon === emoji}
                onClick={() => setIcon(emoji)}
                className="desk-choice item-icon-choice w-8 text-center !text-[16px] !leading-none"
              >
                {emoji}
              </button>
            ))}
            <input aria-label="Свой значок" value={ICONS.includes(icon) ? "" : icon} maxLength={4} onChange={(event) => setIcon(event.target.value || "🎁")} placeholder="свой" className="field ml-1 h-8 w-14 text-[14px] outline-none" />
          </div>
        </div>

        <div>
          <Label htmlFor="item-price">Цена</Label>
          <div className="flex flex-wrap items-center gap-x-3">
            <input
              id="item-price"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const step = event.shiftKey ? 100 : 10;
                setPrice(String(Math.max(0, (priceNumber || 0) + (event.key === "ArrowUp" ? step : -step))));
              }}
              placeholder="0"
              className="nums field h-9 w-20 pr-1 text-right text-[14px] outline-none"
            />
            <span className="text-[13px] text-muted">очков</span>
            {PRICES.map((p) => (
              <button key={p} type="button" aria-pressed={priceNumber === p} onClick={() => setPrice(String(p))} className="desk-choice award-chip nums px-1">
                {formatNum(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="item-toggles desk-list">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="min-w-0">
            <label htmlFor="item-counted" className="cursor-pointer text-[14px] font-medium leading-5">
              Считать остаток
            </label>
            <p className="text-[12px] leading-4 text-muted">{counted ? "Кончится — заказать будет нельзя" : "Без счёта — сколько угодно"}</p>
          </div>
          <span className="flex items-center gap-2">
            {counted ? (
              <input
                aria-label="Сколько штук"
                inputMode="numeric"
                value={stock}
                onChange={(event) => setStock(event.target.value.replace(/[^\d]/g, ""))}
                placeholder="шт."
                className="nums field h-8 w-16 pr-1 text-right text-[14px] outline-none"
              />
            ) : null}
            <Switch id="item-counted" label="Считать остаток" checked={counted} onChange={setCounted} />
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 py-2">
          <div className="min-w-0">
            <label htmlFor="item-active" className="cursor-pointer text-[14px] font-medium leading-5">
              Показывать в магазине
            </label>
            <p className="text-[12px] leading-4 text-muted">{active ? "Сотрудники видят её на витрине" : "Скрыта: заказать нельзя, история цела"}</p>
          </div>
          <Switch id="item-active" label="Показывать в магазине" checked={active} onChange={setActive} />
        </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="desk-label item-preview-label uppercase">Так увидит сотрудник</span>
        {/* the employee's phone is dark: the card keeps its tokens, as the wall's preview does */}
        <ul className="desk-phone-look item-preview pointer-events-none p-2" aria-label="Предпросмотр">
          <ItemCard item={preview} />
        </ul>
      </div>

      <div className="col-span-2 flex items-center gap-2">
        {item ? (
          <Button
            size="sm"
            variant={sure ? "danger" : "ghost"}
            disabled={remove.isPending}
            onClick={() => (sure ? remove.mutate(item, { onSuccess: onDone }) : setSure(true))}
            className={sure ? "" : "!text-danger/80 hover:!text-danger"}
          >
            {sure ? "Точно удалить" : "Удалить награду"}
          </Button>
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-[12px] text-muted">
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Отмена
        </Button>
        <Button size="sm" type="submit" loading={save.isPending} disabled={!valid} data-testid="shop-item-save">
          {item ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A reward of the shop, added or changed (D-71) — the desk's form instead of the phone's sheet:
 * the fields on the left, the card as an employee will see it on the right, Ctrl+Enter saves. The
 * id is given in advance, so «add» and «change» are one upsert. Deleting asks once more; a reward
 * somebody ordered can only be hidden (the server says so).
 */
export function ItemDialog({ item, companyId, onClose }: { item: ShopItem | "new" | null; companyId: string | undefined; onClose: () => void }) {
  const existing = item !== null && item !== "new" ? item : null;
  // the form stays on the card while the dialog fades out
  const [shown, setShown] = useState<{ item: ShopItem | null; key: string } | null>(null);
  const key = item === null ? null : item === "new" ? "new" : item.id;
  if (key !== null && shown?.key !== key) setShown({ item: existing, key });
  return (
    <Dialog open={item !== null} onClose={onClose} title={existing ? `Награда: ${existing.title}` : "Новая награда"} width="lg">
      {shown ? <ItemForm key={shown.key} item={shown.item} companyId={companyId} onDone={onClose} /> : null}
    </Dialog>
  );
}
