"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { useOpenDisputes, useResolveDispute, type OpenDispute } from "@/lib/points/game";

/**
 * «Оспаривания» (D-14, D-133): the director's queue of disputed minuses, on top of the rating
 * where the points live. Each says who, what was taken and why they disagree; one tap answers —
 * «Вернуть очки» writes one quiet row giving them back, «Оставить» keeps the minus; a few words
 * to the person are optional. Nothing open — the block is not there.
 */
export function DisputesBlock() {
  const disputes = useOpenDisputes(true);
  const items = disputes.data ?? [];
  // a push «Оспаривает» opens /rating#disputes: the block arrives after the hash scroll, so it
  // brings itself into view once — not again each time Realtime empties and refills the list
  // under a hash that is still in the address
  const arrived = items.length > 0;
  const scrolled = useRef(false);
  useEffect(() => {
    if (!arrived || scrolled.current || window.location.hash !== "#disputes") return;
    scrolled.current = true;
    document.getElementById("disputes")?.scrollIntoView({ block: "start" });
  }, [arrived]);
  if (items.length === 0) return null;

  return (
    <section id="disputes" aria-label="Оспаривания" className="mt-4 scroll-mt-24" data-testid="disputes">
      <h2 className="px-1 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-warn">
        Оспаривают · {items.length}
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <DisputeCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function DisputeCard({ item }: { item: OpenDispute }) {
  const resolve = useResolveDispute();
  const [answer, setAnswer] = useState("");
  const amount = item.tx?.amount ?? 0;
  const name = item.user?.full_name ?? "Сотрудник";

  return (
    <li className="card px-4 py-3" data-testid="dispute-card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-semibold leading-5">{name}</p>
        <span className="nums shrink-0 text-[12px] leading-4 text-muted">{humanAqtobe(new Date(item.created_at))}</span>
      </div>
      <p className="mt-1 text-[14px] leading-[19px] text-muted">
        <span className="nums font-semibold" style={{ color: "var(--danger)" }}>
          {amount}
        </span>{" "}
        {item.tx?.reason ?? ""}
      </p>
      <p className="mt-2 text-[15px] leading-[21px]">«{item.text}»</p>
      <input
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        maxLength={500}
        placeholder="Ответ, если нужно"
        className="field mt-3 min-h-[44px] w-full px-3 text-[16px] outline-none focus:border-accent"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ id: item.id, refund: true, answer: answer.trim() })}
          data-testid="dispute-refund"
        >
          Вернуть {Math.abs(amount)}
        </Button>
        <Button
          variant="secondary"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ id: item.id, refund: false, answer: answer.trim() })}
          data-testid="dispute-keep"
        >
          Оставить
        </Button>
      </div>
    </li>
  );
}
