"use client";

import { useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { useOpenDisputes, useResolveDispute, type OpenDispute } from "@/lib/points/game";

function DisputeCard({ item }: { item: OpenDispute }) {
  const resolve = useResolveDispute();
  const [answer, setAnswer] = useState("");
  const amount = item.tx?.amount ?? 0;
  const busy = resolve.isPending;

  return (
    <li className="card flex flex-col gap-2 px-4 py-3" data-testid="dispute-card">
      <div className="flex items-center justify-between gap-3">
        <PersonCell name={item.user?.full_name ?? "Сотрудник"} />
        <span className="nums shrink-0 text-[12px] leading-4 text-muted">{humanAqtobe(new Date(item.created_at))}</span>
      </div>
      <p className="text-[14px] leading-5 text-muted">
        <span className="nums font-semibold" style={{ color: "var(--danger)" }}>
          {amount}
        </span>{" "}
        {item.tx?.reason ?? ""}
      </p>
      <p className="text-[14px] leading-5">«{item.text}»</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={500}
          placeholder="Ответ, если нужно"
          aria-label="Ответ"
          className="field h-9 min-w-0 flex-1 px-3 text-[14px] leading-5 outline-none focus:border-accent"
        />
        <Button size="sm" disabled={busy} onClick={() => resolve.mutate({ id: item.id, refund: true, answer: answer.trim() })} data-testid="dispute-refund">
          Вернуть {Math.abs(amount)}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => resolve.mutate({ id: item.id, refund: false, answer: answer.trim() })}
          data-testid="dispute-keep"
        >
          Оставить
        </Button>
      </div>
    </li>
  );
}

/**
 * «Оспаривают» (D-14, D-133): the minuses people disagree with, oldest first. «Вернуть» writes one
 * quiet row giving the points back, «Оставить» keeps the minus; a few words to the person are
 * optional. The answered card leaves at once (the hook's optimistic queue).
 */
export function DisputesList() {
  const disputes = useOpenDisputes(true);
  const items = disputes.data ?? [];

  if (items.length === 0) {
    return disputes.isPending ? (
      <EmptyState title="Загружаю споры" />
    ) : (
      <EmptyState title="Споров нет" hint="Когда человек оспорит снятые очки, спор появится здесь: вернуть их или оставить — с ответом" />
    );
  }

  return (
    <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(440px,1fr))]" aria-label="Оспаривания">
      {items.map((item) => (
        <DisputeCard key={item.id} item={item} />
      ))}
    </ul>
  );
}
