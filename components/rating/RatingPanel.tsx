"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { initialsOf } from "@/lib/people/queries";
import { useRating } from "@/lib/points/queries";
import { useTvControl } from "@/lib/tv/mutations";

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (Podium.tsx). */
const RING = ["var(--gold)", "#B8C2CC", "#C98A5B"];

/**
 * Шарик «Рейтинг» на Пульсе директора (D-123): пятёрка недели в один тап от лица, дальше —
 * «Весь рейтинг» (экран `/rating` с месяцем, всем временем и «+») и «На стену» — та же
 * пятёрка заставкой в кабинете. Раньше рейтинг у директора жил только в «Настройках».
 */
export function RatingPanel() {
  const rating = useRating("week");
  const control = useTvControl();
  const rows = (rating.data ?? []).filter((row) => row.points > 0).slice(0, 5);

  return (
    <div className="flex flex-col gap-2" data-testid="rating-panel">
      {rating.isLoading ? null : rows.length === 0 ? (
        <p className="py-4 text-center text-[16px] leading-[22px] text-muted">
          За неделю очков пока нет. Скажи «Марату 50 очков за объект».
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const ring = row.rank <= 3 ? RING[row.rank - 1] : null;
            return (
              <li key={row.user_id} className="card flex items-center gap-3 px-3 py-2.5">
                <span className="nums w-5 shrink-0 text-center text-[14px] font-semibold text-muted">{row.rank}</span>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), #1FA88F)",
                    boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 4px ${ring}` : undefined,
                  }}
                >
                  {initialsOf(row.display_name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px] leading-[22px]">{row.display_name}</span>
                {row.delta_vs_prev > 0 ? (
                  <span className="nums shrink-0 text-[13px] leading-4" style={{ color: "var(--ok)" }}>
                    ↑{row.delta_vs_prev}
                  </span>
                ) : null}
                <span className="nums shrink-0 text-[18px] font-semibold leading-6" style={{ color: "var(--gold)" }}>
                  {row.points}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-1 grid grid-cols-2 gap-2">
        <Link
          href="/rating"
          className="btn-secondary inline-flex min-h-[44px] select-none items-center justify-center rounded-[12px] px-4 font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] text-text transition-transform duration-[120ms] active:scale-[0.97]"
          data-testid="rating-open"
        >
          Весь рейтинг
        </Link>
        <Button
          variant="secondary"
          className="!min-h-[44px] !text-[15px]"
          disabled={control.isPending}
          data-testid="rating-on-wall"
          onClick={() =>
            control.mutate({ scene: "rating", rating: "week" }, { onSuccess: () => toast("На стене — рейтинг недели") })
          }
        >
          На экран
        </Button>
      </div>
    </div>
  );
}
