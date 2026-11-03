"use client";

import { useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAwardPoints } from "@/lib/points/queries";

const PRESETS = [5, 10, 20, 50];
const REASONS = ["за скорость", "за качество", "за инициативу", "за выручку"];

const FIELD = "field h-9 w-full px-3 text-[14px] leading-5 outline-none focus:border-accent";

/** Who the dialog opens for: a person picked from a row, or nobody yet (the screen's own button). */
export type AwardFor = { userId?: string };

export type AwardPerson = { id: string; name: string };

function Label({ children }: { children: string }) {
  return <span className="mb-1.5 block text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{children}</span>;
}

function AwardForm({ initialUser, people, onDone }: { initialUser?: string; people: AwardPerson[]; onDone: () => void }) {
  const award = useAwardPoints();
  const [userId, setUserId] = useState(initialUser ?? "");
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const finalReason = custom.trim() || reason;
  const ready = Boolean(userId) && amount !== 0 && Boolean(finalReason) && !award.isPending;
  const submit = () => {
    if (!ready) return;
    // «Сказать в Эфире» is the praise's: a minus never goes to Эфир (D-133)
    award.mutate({ userId, amount, reason: finalReason, isPublic: amount > 0 && isPublic }, { onSuccess: onDone });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="block">
        <Label>Кому</Label>
        <Select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="w-full"
          aria-label="Кому"
          data-autofocus={initialUser ? undefined : ""}
        >
          <option value="" disabled>
            Выберите человека
          </option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </label>

      <div>
        <Label>Сколько</Label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <Chip key={preset} tone={amount === preset ? "accent" : "neutral"} onClick={() => setAmount(preset)}>
              +{preset}
            </Chip>
          ))}
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(Math.trunc(Number(event.target.value)) || 0)}
            aria-label="Сумма очков"
            data-autofocus={initialUser ? "" : undefined}
            className="nums field h-9 w-24 px-2 text-center text-[14px] outline-none focus:border-accent"
          />
        </div>
        <span className="mt-1.5 block text-[12px] leading-4 text-muted">Минус снимает очки — только с причиной, человек может оспорить</span>
      </div>

      <div>
        <Label>За что</Label>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((item) => (
            <Chip
              key={item}
              tone={reason === item && !custom.trim() ? "accent" : "neutral"}
              onClick={() => {
                setReason(item);
                setCustom("");
              }}
            >
              {item}
            </Chip>
          ))}
        </div>
        <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Своя причина" aria-label="Своя причина" className={`mt-2 ${FIELD}`} />
      </div>

      {amount > 0 ? (
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] leading-5" data-testid="award-public">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>
            Сказать в Эфире <span className="text-muted">· команда увидит похвалу, без пуша</span>
          </span>
        </label>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" size="sm" loading={award.isPending} disabled={!ready}>
          {amount >= 0 ? `Начислить +${amount}` : `Снять ${amount}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * «Начислить» (D-48): a person, a sum and a reason in one dialog — the same RPC as the phone's
 * «Поощрить», idempotent by its request id. Opened from a person's row the person is chosen.
 */
export function AwardDialog({ target, people, onClose }: { target: AwardFor | null; people: AwardPerson[]; onClose: () => void }) {
  // the form stays on the card while the dialog fades out; every opening starts a fresh one
  const [shown, setShown] = useState<{ for: AwardFor; n: number } | null>(target ? { for: target, n: 0 } : null);
  if (target && target !== shown?.for) setShown({ for: target, n: (shown?.n ?? 0) + 1 });
  return (
    <Dialog open={target !== null} onClose={onClose} title="Начислить очки" width="sm">
      {shown ? <AwardForm key={shown.n} initialUser={shown.for.userId} people={people} onDone={onClose} /> : null}
    </Dialog>
  );
}
