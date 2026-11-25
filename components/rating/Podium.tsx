"use client";

import { Mascot } from "@/components/brand/Mascot";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { shortName, initialsOf } from "@/lib/people/names";

import type { RatingRow } from "@/lib/points/queries";

const RING = ["var(--gold)", "#B8C2CC", "#C98A5B"];
const MEDAL = ["🥇", "🥈", "🥉"];
const HEIGHT = [92, 68, 52];

/**
 * The top three as a podium: the leader in the middle and highest, silver on the
 * left, bronze on the right. Only people with points stand here — an empty podium
 * says nothing, so the caller skips it when nobody scored. One person is a leader's card,
 * not a lone column in an empty box; two stand side by side without a gap for the third (4.5).
 */
export function Podium({ rows, onPick }: { rows: RatingRow[]; onPick?: (row: RatingRow) => void }) {
  const top = rows.filter((r) => r.points > 0).slice(0, 3);
  if (top.length === 0) return null;
  if (top.length === 1) return <Leader row={top[0]} onPick={onPick} />;
  // visual order: 2nd, 1st, 3rd — a missing third leaves no hole
  const order = top.length === 2 ? [top[1], top[0]] : [top[1], top[0], top[2]];

  return (
    <div className="mt-4 card px-3 pb-3 pt-4">
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
              <span className="mt-4 w-full truncate text-center text-[13px] leading-4">{shortName(row.display_name)}</span>
              <span className="nums max-w-full truncate whitespace-nowrap text-[16px] font-semibold leading-[22px]" style={{ color: "var(--gold)" }}>
                <RollingNumber value={row.points} />
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

/** The only one with points: a leader's card — the face, the name, the number, no pedestal. */
function Leader({ row, onPick }: { row: RatingRow; onPick?: (row: RatingRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(row)}
      className="card-in mt-4 flex w-full items-center gap-3.5 card px-4 py-3.5 text-left"
      aria-label={`Лидер: ${row.display_name}, ${row.points} очков`}
    >
      <span className="relative shrink-0">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-[15px] font-semibold text-bg"
          style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)", boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${RING[0]}` }}
        >
          {initialsOf(row.display_name)}
        </span>
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[14px] leading-none" aria-hidden>
          {MEDAL[0]}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-[22px]">{shortName(row.display_name)}</span>
        <span className="block text-[13px] leading-4 text-muted">впереди всех</span>
      </span>
      <span className="nums shrink-0 whitespace-nowrap text-[22px] font-bold leading-7" style={{ color: "var(--gold)" }}>
        <RollingNumber value={row.points} />
      </span>
      <span className="shrink-0">
        <Mascot state="happy" size={34} />
      </span>
    </button>
  );
}
