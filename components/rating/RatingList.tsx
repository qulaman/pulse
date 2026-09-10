"use client";

import { useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { AwardSheet } from "@/components/rating/AwardSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAwardPoints, useRating, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

const MEDAL = ["🥇", "🥈", "🥉"];

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
