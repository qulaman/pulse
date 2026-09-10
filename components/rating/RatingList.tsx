"use client";

import { useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { useAwardPoints, useRating, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

const MEDAL = ["🥇", "🥈", "🥉"];
const PRESETS = [5, 10, 20];
const REASONS = ["за скорость", "за качество", "за инициативу", "за выручку"];

function Delta({ value }: { value: number }) {
  // no movement yet — an empty line reads cleaner than a dash
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className="nums text-[13px] leading-4" style={{ color: up ? "var(--ok)" : "var(--danger)" }}>
      {up ? "↑" : "↓"}
      {Math.abs(value)}
    </span>
  );
}

function Row({ row, canAward, onAward }: { row: RatingRow; canAward: boolean; onAward: (row: RatingRow) => void }) {
  const medal = row.points > 0 ? MEDAL[row.rank - 1] : undefined;
  return (
    <li
      className="flex items-center gap-3 rounded-[16px] border px-3 py-3"
      style={{
        borderColor: row.is_me ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--border)",
        background: row.is_me ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
      }}
    >
      <span className="nums flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[16px] font-semibold">
        {medal ?? row.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] leading-[22px]">
          {row.display_name}
          {row.is_me ? <span className="ml-1 text-[13px] text-muted">· вы</span> : null}
        </p>
        <p className="flex items-center gap-2 text-[13px] leading-4 text-muted">
          <Delta value={row.delta_vs_prev} />
          {row.on_time_pct !== null ? <span className="nums">{row.on_time_pct}% в срок</span> : null}
        </p>
      </div>
      <span className="nums text-[19px] font-semibold leading-6" style={{ color: "var(--gold)" }}>
        {row.points}
      </span>
      {canAward ? (
        <Button variant="secondary" className="!min-h-[36px] !px-3 !text-[13px]" onClick={() => onAward(row)}>
          +
        </Button>
      ) : null}
    </li>
  );
}

export function RatingList({ canAward, pointsEnabled }: { canAward: boolean; pointsEnabled: boolean }) {
  const [period, setPeriod] = useState<RatingPeriod>("week");
  const [target, setTarget] = useState<RatingRow | null>(null);
  const rating = useRating(period);
  const award = useAwardPoints();

  const rows = rating.data ?? [];

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Chip tone={period === "week" ? "accent" : "neutral"} onClick={() => setPeriod("week")}>
          Неделя
        </Chip>
        <Chip tone={period === "month" ? "accent" : "neutral"} onClick={() => setPeriod("month")}>
          Месяц
        </Chip>
      </div>

      {!pointsEnabled ? (
        <p className="mt-4 rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-4 text-warn">
          {canAward
            ? "Очки выключены на время пилота. Включить — в Настройках"
            : "Очки включатся после пилота"}
        </p>
      ) : null}

      {rating.isLoading ? (
        <p className="mt-6 text-[16px] leading-[22px] text-muted">Считаю очки…</p>
      ) : (
        <>
          {rows.length === 0 || rows.every((r) => r.points === 0) ? (
            <div className="mt-4 flex items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-3 text-left">
              <Mascot state="calm" size={44} />
              <div>
                <p className="text-[16px] leading-[22px]">Пока никто не набрал очков</p>
                <p className="mt-0.5 text-[13px] leading-4 text-muted">
                  {canAward ? "Нажми «+» у сотрудника или скажи «Марату плюс десять за скорость»" : "Первые очки придут за закрытые в срок задачи"}
                </p>
              </div>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {rows.map((row) => (
                <Row key={row.user_id} row={row} canAward={canAward && pointsEnabled} onAward={setTarget} />
              ))}
            </ul>
          ) : null}
        </>
      )}

      <AwardSheet
        target={target}
        onClose={() => setTarget(null)}
        pending={award.isPending}
        onSubmit={(amount, reason) => {
          if (!target) return;
          award.mutate({ userId: target.user_id, amount, reason });
          setTarget(null);
        }}
      />
    </div>
  );
}

function AwardSheet({
  target,
  onClose,
  pending,
  onSubmit,
}: {
  target: RatingRow | null;
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
          className="nums min-h-[32px] w-20 rounded-[12px] border border-border bg-surface-2 px-2 text-[14px] outline-none focus:border-accent"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          aria-label="Сумма очков"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Chip key={r} tone={reason === r && !custom ? "accent" : "neutral"} onClick={() => { setReason(r); setCustom(""); }}>
            {r}
          </Chip>
        ))}
      </div>
      <input
        className="mt-3 min-h-[44px] w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[16px] outline-none focus:border-accent"
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
