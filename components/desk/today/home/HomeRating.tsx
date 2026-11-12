"use client";

import { Crown, Medal, TrendingUp, Trophy } from "lucide-react";
import { useMemo } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { toast } from "@/components/ui/Toast";
import { topOf } from "@/lib/desk/home";
import { loadStateOf } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { useRating } from "@/lib/points/queries";
import { useNow } from "@/lib/pulse/queries";
import { useTvControl } from "@/lib/tv/mutations";

import { AllClear, Face, Mark, Meter, rise, Titled } from "./look";
import { Aside, BlockLink, BlockNote, HeadMove, RowsBone } from "./parts";

/** A row of the five: the place in the margin, the name over a bar of the points, what grew since last week, the points. */
const RATING_ROW = "grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-[7px] text-[13px] leading-5";

/** The full rating on the desk: the balances of «Очки и магазин», the week by default. */
const RATING_HREF = "/desk/settings/points";

/**
 * «Рейтинг» on the desk's home (D-164): the phone's «Рейтинг» ball — the week's top five, only
 * where the company plays the points game (renders nothing otherwise). Contract frozen with TodayScreen.
 *
 * The phone's `RatingPanel` (D-123) as rows: the place, the name, the rise against last week, the
 * points of the week; «На экран» puts the same five on the wall, «Весь рейтинг» leads to the
 * balances. A disputed minus is not repeated here: «Ждут вас» on the left already holds it with
 * its two moves.
 */
export function HomeRating() {
  const { pointsEnabled } = useDeskScope();
  // the rating is read only where the game is on
  return pointsEnabled ? <WeekTop /> : null;
}

function WeekTop() {
  const rating = useRating("week");
  const control = useTvControl();
  const now = useNow(60_000);
  const load = loadStateOf(rating);
  const rows = useMemo(() => topOf(rating.data ?? []), [rating.data]);
  const leader = Math.max(1, ...rows.map((row) => row.points));

  return (
    <Aside testId="home-rating">
      <SectionLabel
        action={
          <span className="flex items-center gap-4">
            <HeadMove
              onPress={() => control.mutate({ scene: "rating", rating: "week" }, { onSuccess: () => toast("На стене — рейтинг недели") })}
              disabled={control.isPending}
              title="Показать пятёрку недели на экране в офисе"
              testId="home-rating-wall"
            >
              На экран
            </HeadMove>
            <BlockLink href={RATING_HREF} testId="home-rating-all">
              Весь рейтинг →
            </BlockLink>
          </span>
        }
      >
        <Titled icon={Trophy} ink="gold">
          Рейтинг недели
        </Titled>
      </SectionLabel>
      <BlockNote state={load} failed="Рейтинг не загрузился" now={now} onRetry={() => void rating.refetch()} />
      {load.kind === "loading" ? (
        <RowsBone rows={5} wide="64%" />
      ) : load.kind === "failed" ? null : rows.length === 0 ? (
        <div className="desk-list">
          <AllClear icon={Trophy} ink="muted" hint="Начислите строкой поручения: «Марату 50 очков за объект»" testId="home-rating-empty">
            За неделю очков пока нет
          </AllClear>
        </div>
      ) : (
        <ol className="desk-list" data-testid="home-rating-list">
          {rows.map((row, index) => (
            <li key={row.user_id} className={`${RATING_ROW} ${rise(index).className}`} style={rise(index).style} data-testid="home-rating-row">
              {/* the first three wear a crown and medals: the place is seen before it is read */}
              <span className="flex items-center justify-center">
                {row.rank === 1 ? (
                  <Mark icon={Crown} ink="gold" size={16} title="1 место" />
                ) : row.rank <= 3 ? (
                  <Mark icon={Medal} ink={row.rank === 2 ? "sky" : "violet"} size={15} title={`${row.rank} место`} />
                ) : (
                  <span className="nums text-[13px] text-muted">{row.rank}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <Face name={row.display_name} size={20} ink={row.rank === 1 ? "gold" : undefined} />
                  <span className={`min-w-0 truncate text-[14px] ${row.rank === 1 ? "font-semibold" : ""}`} title={row.display_name}>
                    {shortName(row.display_name)}
                  </span>
                </span>
                {/* the points against the leader's: the week's race as bars */}
                <Meter value={row.points} of={leader} ink="gold" />
              </span>
              <span className="nums inline-flex items-center gap-0.5 text-[12px]" style={{ color: "var(--ok)" }} title={row.delta_vs_prev > 0 ? `На ${row.delta_vs_prev} больше, чем за прошлую неделю` : undefined}>
                {row.delta_vs_prev > 0 ? (
                  <>
                    <TrendingUp size={12} strokeWidth={2.5} aria-hidden />
                    {row.delta_vs_prev}
                  </>
                ) : null}
              </span>
              <span className="nums text-right text-[15px] font-semibold" style={{ color: "var(--gold)" }}>
                {row.points}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Aside>
  );
}
