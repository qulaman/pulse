"use client";

import { useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";

const PRESETS = [5, 10, 20];
const REASONS = ["за скорость", "за качество", "за инициативу", "за выручку"];

export type AwardTarget = { user_id: string; display_name: string };

/** «Поощрить»: presets, a reason chip or a typed one — the same sheet from the rating and the person card. */
export function AwardSheet({
  target,
  onClose,
  pending,
  onSubmit,
}: {
  target: AwardTarget | null;
  onClose: () => void;
  pending: boolean;
  onSubmit: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState("");

  const finalReason = custom.trim() || reason;

  return (
    <Sheet open={target !== null} onClose={onClose} title={target ? `Поощрить: ${target.display_name}` : "Поощрить"}>
      <div className="flex items-center gap-3">
        <Mascot state="happy" size={44} />
        <p className="text-[13px] leading-4 text-muted">
          Очки видят все в рейтинге. Снятие очков — только с причиной и не голосом
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        {PRESETS.map((p) => (
          <Chip key={p} tone={amount === p ? "accent" : "neutral"} onClick={() => setAmount(p)}>
            +{p}
          </Chip>
        ))}
        <input
          type="number"
          className="nums min-h-[32px] w-20 field px-2 text-[14px] outline-none focus:border-accent"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          aria-label="Сумма очков"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Chip
            key={r}
            tone={reason === r && !custom ? "accent" : "neutral"}
            onClick={() => {
              setReason(r);
              setCustom("");
            }}
          >
            {r}
          </Chip>
        ))}
      </div>
      <input
        className="mt-3 min-h-[44px] w-full field px-3 text-[16px] outline-none focus:border-accent"
        placeholder="Своя причина"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
      />

      <div className="mt-4">
        <Button block disabled={pending || amount === 0 || !finalReason} onClick={() => onSubmit(amount, finalReason)}>
          {amount > 0 ? `Начислить +${amount}` : `Снять ${amount}`}
        </Button>
      </div>
    </Sheet>
  );
}
