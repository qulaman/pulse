"use client";

import { Mascot } from "@/components/brand/Mascot";
import { initialsOf } from "@/lib/people/queries";
import type { RatingRow } from "@/lib/points/queries";

const RING = ["var(--gold)", "#B8C2CC", "#C98A5B"];
const MEDAL = ["🥇", "🥈", "🥉"];
const HEIGHT = [92, 68, 52];

/**
 * The top three as a podium: the leader in the middle and highest, silver on the
 * left, bronze on the right. Only people with points stand here — an empty podium
 * says nothing, so the caller skips it when nobody scored.
 */
export function Podium({ rows, onPick }: { rows: RatingRow[]; onPick?: (row: RatingRow) => void }) {
  const top = rows.filter((r) => r.points > 0).slice(0, 3);
  if (top.length === 0) return null;
  // visual order: 2nd, 1st, 3rd
  const order = [top[1], top[0], top[2]];

  return (
    <div className="mt-4 rounded-[16px] border border-border bg-surface px-3 pb-3 pt-4">
      <div className="flex items-end justify-center gap-2">
        {order.map((row, i) =>
          row ? (
            <button
              key={row.user_id}
              type="button"
              onClick={() => onPick?.(row)}
              className="card-in flex w-[31%] flex-col items-center"
              style={{ animationDelay: `${i * 60}ms` }}
              aria-label={`${row.rank} место: ${row.display_name}, ${row.points} очков`}
            >
              <span className="relative">
                {row.rank === 1 ? (
                  <span className="absolute -right-6 -top-5">
                    <Mascot state="happy" size={30} />
                  </span>
                ) : null}
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-[16px] font-semibold text-bg"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), #1FA88F)",
                    boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${RING[row.rank - 1] ?? "var(--border)"}`,
                  }}
                >
                  {initialsOf(row.display_name)}
                </span>
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[16px] leading-none" aria-hidden>
                  {MEDAL[row.rank - 1]}
                </span>
              </span>
              <span className="mt-4 w-full truncate text-center text-[13px] leading-4">{row.display_name.split(/\s+/)[0]}</span>
              <span className="nums text-[16px] font-semibold leading-[22px]" style={{ color: "var(--gold)" }}>
                {row.points}
              </span>
              <span
                className="mt-2 w-full rounded-t-[10px]"
                style={{
                  height: HEIGHT[row.rank - 1] ?? 40,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${RING[row.rank - 1] ?? "var(--border)"} 45%, var(--surface-2)), var(--surface-2))`,
                }}
                aria-hidden
              />
            </button>
          ) : (
            <span key={`empty-${i}`} className="w-[31%]" aria-hidden />
          ),
        )}
      </div>
    </div>
  );
}
