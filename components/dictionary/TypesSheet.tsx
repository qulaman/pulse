"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { KIND_LABEL_MAX, NO_KIND_LABEL, WORD_KINDS_MAX, entryKey, type WordKindDef } from "@/lib/dictionary";
import { useEditKinds } from "@/lib/dictionary-queries";
import { pluralRu } from "@/lib/tasks/status-text";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none placeholder:text-muted focus:border-accent";

function words(n: number): string {
  return `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;
}

/**
 * «Типы слов» (D-111 §19): the company's own list — Контрагент, Товар, whatever its words
 * are. A type opens in place: a new name, «Выше» / «Ниже» (the order of the chips and of the
 * groups), «Удалить». A type with words asks where they go — another type or «Без типа» —
 * before it goes; an empty one goes at once, «Вернуть» in the toast. Saved on the tap.
 */
export function TypesSheet({
  open,
  onClose,
  kinds,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  kinds: readonly WordKindDef[];
  /** Words per type id. */
  counts: Readonly<Record<string, number>>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Типы слов">
      {open ? <TypesBody kinds={kinds} counts={counts} /> : null}
    </Sheet>
  );
}

function TypesBody({ kinds, counts }: { kinds: readonly WordKindDef[]; counts: Readonly<Record<string, number>> }) {
  const edit = useEditKinds();
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  const name = fresh.replace(/\s+/g, " ").trim();
  const clash = kinds.some((k) => entryKey(k.label) === entryKey(name));
  const full = kinds.length >= WORD_KINDS_MAX;
  const canAdd = entryKey(name).length > 0 && name.length <= KIND_LABEL_MAX && !clash && !full;

  const add = () => {
    if (!canAdd) return;
    edit.mutate({ op: "add", id: `k_${crypto.randomUUID().slice(0, 8)}`, label: name });
    setFresh("");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="types-sheet">
      <p className="text-[13px] leading-[18px] text-muted">
        Типы — для порядка в списке слов. Распознаванию они не нужны: подсказка остаётся та же.
      </p>
      <ul className="card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
        {kinds.map((kind, index) => (
          <KindRow
            key={kind.id}
            kind={kind}
            index={index}
            kinds={kinds}
            count={counts[kind.id] ?? 0}
            open={openId === kind.id}
            onToggle={() => setOpenId((id) => (id === kind.id ? null : kind.id))}
            onClose={() => setOpenId(null)}
          />
        ))}
        {kinds.length === 0 ? <li className="px-4 py-4 text-[14px] leading-5 text-muted">Типов нет — все слова «{NO_KIND_LABEL}»</li> : null}
      </ul>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Новый тип</span>
        <div className="flex gap-2">
          <input
            className={FIELD}
            value={fresh}
            placeholder="Поставщик, Станция"
            aria-label="Новый тип"
            maxLength={KIND_LABEL_MAX + 6}
            onChange={(e) => setFresh(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button disabled={!canAdd} onClick={add}>
            Добавить
          </Button>
        </div>
        {clash && name ? <span className="text-[13px] leading-[18px] text-warn">Тип «{name}» уже есть</span> : null}
        {full ? <span className="text-[13px] leading-[18px] text-muted">Типов уже {WORD_KINDS_MAX} — больше не нужно</span> : null}
      </div>
    </div>
  );
}

function KindRow({
  kind,
  index,
  kinds,
  count,
  open,
  onToggle,
  onClose,
}: {
  kind: WordKindDef;
  index: number;
  kinds: readonly WordKindDef[];
  count: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const edit = useEditKinds();
  const [label, setLabel] = useState(kind.label);
  const [removing, setRemoving] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const next = label.replace(/\s+/g, " ").trim();
  const clash = kinds.some((k) => k.id !== kind.id && entryKey(k.label) === entryKey(next));
  const renamed = next !== kind.label && entryKey(next).length > 0 && next.length <= KIND_LABEL_MAX && !clash;
  const others = kinds.filter((k) => k.id !== kind.id);

  const remove = (to: string | null) => {
    edit.mutate({ op: "remove", id: kind.id, move_to: to });
    onClose();
    if (count === 0) {
      toast(`Удалил тип «${kind.label}»`, {
        lifetimeMs: 5000,
        action: {
          label: "Вернуть",
          onClick: () => {
            edit.mutate({ op: "add", id: kind.id, label: kind.label });
            edit.mutate({ op: "move", id: kind.id, index });
          },
        },
      });
    } else {
      toast(`Удалил тип «${kind.label}» — ${words(count)} ${to ? `теперь «${others.find((k) => k.id === to)?.label}»` : `без типа`}`);
    }
  };

  return (
    <li data-testid="kind-row">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors duration-[120ms] active:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate text-[16px] leading-[22px]">{kind.label}</span>
        <span className="shrink-0 text-[13px] leading-4 text-muted">{count ? words(count) : "пусто"}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          className="shrink-0 text-muted transition-transform duration-[120ms]"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="card-in flex flex-col gap-3 px-4 pb-4">
          <div className="flex gap-2">
            <input
              className={FIELD}
              value={label}
              aria-label={`Название типа «${kind.label}»`}
              maxLength={KIND_LABEL_MAX + 6}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamed) edit.mutate({ op: "rename", id: kind.id, label: next });
              }}
            />
            {renamed ? <Button onClick={() => edit.mutate({ op: "rename", id: kind.id, label: next })}>Сохранить</Button> : null}
          </div>
          {clash ? <span className="-mt-1 text-[13px] leading-[18px] text-warn">Тип «{next}» уже есть</span> : null}

          {removing ? (
            <div className="flex flex-col gap-2 rounded-[12px] border border-danger/40 p-3">
              <p className="text-[14px] leading-5">
                В типе {words(count)}. Куда {count === 1 ? "его" : "их"} перенести?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {others.map((k) => (
                  <Chip key={k.id} tone={moveTo === k.id ? "accent" : "neutral"} onClick={() => setMoveTo(k.id)}>
                    {k.label}
                  </Chip>
                ))}
                <Chip tone={moveTo === null ? "accent" : "muted"} onClick={() => setMoveTo(null)}>
                  {NO_KIND_LABEL}
                </Chip>
              </div>
              <div className="flex gap-2">
                <Button variant="danger" block onClick={() => remove(moveTo)}>
                  Удалить тип
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={index === 0}
                aria-label={`Поднять «${kind.label}»`}
                onClick={() => edit.mutate({ op: "move", id: kind.id, index: index - 1 })}
              >
                ↑ Выше
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={index === kinds.length - 1}
                aria-label={`Опустить «${kind.label}»`}
                onClick={() => edit.mutate({ op: "move", id: kind.id, index: index + 1 })}
              >
                ↓ Ниже
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="ml-auto"
                onClick={() => (count ? setRemoving(true) : remove(null))}
              >
                Удалить
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
