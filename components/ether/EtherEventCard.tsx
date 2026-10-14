"use client";

import { humanAqtobe } from "@/lib/ai/time";
import type { EtherEvent } from "@/lib/ether/queries";

/**
 * A line of good news on Эфир (D-133, И-46): a reward handed out from the shop or the director's
 * praise. Quieter than an announcement — nothing to acknowledge, no push behind it; gold, because
 * it is about points. The director may take it off; the points stay.
 */
export function EtherEventCard({ item, onDelete }: { item: EtherEvent; onDelete?: (id: string) => void }) {
  const name = item.user?.full_name ?? "Сотрудник";
  const merch = item.kind === "merch";

  return (
    <article className="card-in card flex items-start gap-3 px-4 py-3" data-testid="ether-event" data-kind={item.kind}>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[18px] leading-none"
        style={{ background: "color-mix(in srgb, var(--gold) 14%, transparent)" }}
      >
        {merch ? item.icon || "🎁" : "👏"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-[21px]">
          <span className="font-semibold">{name}</span>
          {merch ? <> — «{item.title}»</> : <> — {item.title}</>}
        </p>
        <p className="nums mt-0.5 text-[13px] leading-4 text-muted">
          {merch ? "награда из магазина" : "похвала директора"}
          {!merch && item.amount ? (
            <>
              {" · "}
              <span style={{ color: "var(--gold)" }}>+{item.amount}</span>
            </>
          ) : null}
          {" · "}
          {humanAqtobe(new Date(item.created_at))}
        </p>
      </div>
      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label="Убрать из Эфира"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] active:bg-surface-2"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </article>
  );
}
