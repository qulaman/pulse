"use client";

import Link from "next/link";
import { useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { AwardSheet, type AwardTarget } from "@/components/rating/AwardSheet";
import { Podium } from "@/components/rating/Podium";
import { PointsSheet } from "@/components/rating/PointsSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { RatingListBone } from "@/components/ui/PageSkeletons";
import { initialsOf } from "@/lib/people/queries";
import { useAwardPoints, useRating, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

const PERIODS: { key: RatingPeriod; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "all", label: "Всё время" },
];

const RING = ["var(--gold)", "#B8C2CC", "#C98A5B"];

function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className="nums text-[13px] leading-4" style={{ color: up ? "var(--ok)" : "var(--danger)" }}>
      {up ? "↑" : "↓"}
      {Math.abs(value)}
    </span>
  );
}

function Row({ row, canAward, onAward, onOpen }: { row: RatingRow; canAward: boolean; onAward: (row: RatingRow) => void; onOpen: (row: RatingRow) => void }) {
  const ring = row.points > 0 && row.rank <= 3 ? RING[row.rank - 1] : null;
  return (
    <li
      className="flex items-center gap-3 rounded-[16px] border px-3 py-3"
      style={{
        borderColor: row.is_me ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--border)",
        background: row.is_me ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
      }}
    >
      <button type="button" onClick={() => onOpen(row)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${row.display_name}: подробности`}>
        <span className="nums flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted">
          {row.rank}
        </span>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-bg"
          style={{
            background: "linear-gradient(135deg, var(--accent), #1FA88F)",
            boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 4px ${ring}` : undefined,
          }}
        >
          {initialsOf(row.display_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] leading-[22px]">
            {row.display_name}
            {row.is_me ? <span className="ml-1 text-[13px] text-muted">· вы</span> : null}
          </span>
          <span className="flex items-center gap-2 text-[13px] leading-4 text-muted">
            <Delta value={row.delta_vs_prev} />
            {row.on_time_pct !== null ? <span className="nums">{row.on_time_pct}% в срок</span> : <span>без закрытых</span>}
          </span>
        </span>
        <span className="nums text-[19px] font-semibold leading-6" style={{ color: row.points > 0 ? "var(--gold)" : "var(--text-muted)" }}>
          {row.points}
        </span>
      </button>
      {canAward ? (
        <Button variant="secondary" className="!min-h-[36px] !px-3 !text-[13px]" onClick={() => onAward(row)} aria-label={`Поощрить: ${row.display_name}`}>
          +
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The rating: a podium for the top three, the team's totals for the period, the
 * person's own place with what it takes to climb, then every row — tap a row for
 * the story behind the points, «+» to award (director).
 */
export function RatingList({ canAward, pointsEnabled, isDirector }: { canAward: boolean; pointsEnabled: boolean; isDirector: boolean }) {
  const [period, setPeriod] = useState<RatingPeriod>("week");
  const [target, setTarget] = useState<AwardTarget | null>(null);
  const [open, setOpen] = useState<RatingRow | null>(null);
  const rating = useRating(period);
  const award = useAwardPoints();

  const rows = rating.data ?? [];
  const scored = rows.filter((r) => r.points > 0);
  const total = rows.reduce((sum, r) => sum + r.points, 0);
  const onTime = rows.filter((r) => r.on_time_pct !== null);
  const onTimeAvg = onTime.length ? Math.round(onTime.reduce((s, r) => s + (r.on_time_pct ?? 0), 0) / onTime.length) : null;
  const me = rows.find((r) => r.is_me);
  const ahead = me ? rows.find((r) => r.rank === me.rank - 1) : undefined;

  const startAward = (row: RatingRow) => {
    setOpen(null);
    setTarget({ user_id: row.user_id, display_name: row.display_name });
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Chip key={p.key} tone={period === p.key ? "accent" : "neutral"} onClick={() => setPeriod(p.key)}>
            {p.label}
          </Chip>
        ))}
      </div>

      {!pointsEnabled ? (
        <p className="mt-4 rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-4 text-warn">
          {isDirector ? (
            <>
              Очки выключены на время пилота.{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Включить в Настройках
              </Link>
            </>
          ) : (
            "Очки включатся после пилота"
          )}
        </p>
      ) : null}

      {rating.isLoading ? (
        <RatingListBone withAward={canAward} />
      ) : (
        <>
          {scored.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 card px-4 py-3 text-left">
              <Mascot state="calm" size={44} />
              <div>
                <p className="text-[16px] leading-[22px]">Пока никто не набрал очков</p>
                <p className="mt-0.5 text-[13px] leading-4 text-muted">
                  {canAward ? "Нажми «+» у сотрудника или скажи «Марату плюс десять за скорость»" : "Первые очки придут за закрытые в срок задачи"}
                </p>
              </div>
            </div>
          ) : (
            <>
              <Podium rows={rows} onPick={setOpen} />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { value: total, label: "очков за период" },
                  { value: scored.length, label: "с очками" },
                  { value: onTimeAvg === null ? "—" : `${onTimeAvg}%`, label: "в срок" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-[12px] bg-surface-2 px-2 py-2 text-center">
                    <p className="nums text-[19px] font-bold leading-6">{stat.value}</p>
                    <p className="text-[11px] leading-4 text-muted">{stat.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {me && !isDirector ? (
            <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-accent/40 bg-surface px-4 py-3">
              <Mascot state={me.points > 0 ? "happy" : "calm"} size={36} />
              <p className="text-[14px] leading-[18px]">
                {me.points > 0 ? (
                  <>
                    Вы на <span className="nums font-semibold">{me.rank}</span> месте
                    {ahead && ahead.points > me.points ? (
                      <>
                        {" "}
                        · {ahead.display_name.split(/\s+/)[0]} впереди на{" "}
                        <span className="nums font-semibold" style={{ color: "var(--gold)" }}>
                          {ahead.points - me.points}
                        </span>
                      </>
                    ) : me.rank === 1 ? (
                      " · вы лидер"
                    ) : null}
                  </>
                ) : (
                  "Очков за период пока нет. Закрытая в срок задача — первые очки"
                )}
              </p>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {rows.map((row) => (
                <Row key={row.user_id} row={row} canAward={canAward && pointsEnabled} onAward={startAward} onOpen={setOpen} />
              ))}
            </ul>
          ) : null}
        </>
      )}

      <PointsSheet
        row={open}
        canRead={isDirector || open?.is_me === true}
        canAward={canAward && pointsEnabled}
        onClose={() => setOpen(null)}
        onAward={startAward}
      />

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
