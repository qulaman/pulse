"use client";

import { Quote, Undo2 } from "lucide-react";
import { useState } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { formatNum, pointsTone } from "@/lib/desk/format";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useOpenDisputes, useResolveDispute, type OpenDispute } from "@/lib/points/game";

/**
 * One dispute as a card: who and when, the minus and what it was for, the person's own words as a
 * quote, then the director's answer and his two moves — give the points back, or keep the minus.
 */
function DisputeCard({ item, avatar, index }: { item: OpenDispute; avatar: string | null; index: number }) {
  useNamesKey();
  const resolve = useResolveDispute();
  const [answer, setAnswer] = useState("");
  const amount = item.tx?.amount ?? 0;
  const busy = resolve.isPending;
  const name = item.user?.full_name ?? "Сотрудник";

  return (
    <li className="pts-dispute desk-fields flex flex-col gap-1 py-2.5" data-testid="dispute-card" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <TileFace person={{ id: item.user_id, full_name: name, avatar_url: avatar }} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-medium leading-5">{shortName(name)}</span>
            <span className="text-[12px] leading-4 text-muted">
              оспаривает · <When>{humanAqtobe(new Date(item.created_at))}</When>
            </span>
          </span>
        </span>
        <span className="pts-amount" data-sign={amount > 0 ? "plus" : amount < 0 ? "minus" : undefined}>
          <Num value={amount} signed tone={pointsTone(amount)} className="font-semibold" />
        </span>
      </div>
      <p className="pts-dispute-reason text-[13px] leading-[18px] text-muted">за что: {item.tx?.reason ?? "—"}</p>
      <blockquote className="pts-dispute-quote text-[14px] leading-5">
        <Quote size={14} strokeWidth={2} aria-hidden className="pts-dispute-mark" />
        «{item.text}»
      </blockquote>
      <div className="pts-dispute-moves flex items-center gap-2">
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={500}
          placeholder="Ответ, если нужно — человек его увидит"
          aria-label="Ответ"
          className="field h-9 min-w-0 flex-1 text-[14px] leading-5 outline-none"
        />
        <Button
          size="sm"
          variant="secondary"
          className="desk-move"
          disabled={busy}
          onClick={() => resolve.mutate({ id: item.id, refund: true, answer: answer.trim() })}
          data-testid="dispute-refund"
          icon={<Undo2 size={14} strokeWidth={2.25} />}
        >
          Вернуть {formatNum(Math.abs(amount))}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolve.mutate({ id: item.id, refund: false, answer: answer.trim() })} data-testid="dispute-keep">
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
  const people = usePeople();
  const items = disputes.data ?? [];
  const avatars = new Map((people.data ?? []).map((p) => [p.id, p.avatar_url]));

  if (items.length === 0) {
    return disputes.isPending ? (
      <EmptyState title="Загружаю споры" />
    ) : disputes.isError ? (
      <EmptyState
        title="Споры не загрузить"
        hint="Проверьте связь и попробуйте ещё раз"
        action={
          <Button size="sm" variant="secondary" onClick={() => void disputes.refetch()}>
            Повторить
          </Button>
        }
      />
    ) : (
      <EmptyState tone="ok" title="Споров нет" hint="Когда человек оспорит снятые очки, спор появится здесь: вернуть их или оставить — с ответом" />
    );
  }

  return (
    <ul className="pts-disputes desk-list" aria-label="Оспаривания">
      {items.map((item, index) => (
        <DisputeCard key={item.id} item={item} avatar={avatars.get(item.user_id) ?? null} index={index} />
      ))}
    </ul>
  );
}
