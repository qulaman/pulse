"use client";

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

import { Aside, BlockLink, BlockNote, HeadMove, Quiet, RowsBone } from "./parts";

/** A row of the five: the place in the margin, the name, what grew since last week, the points. */
const RATING_ROW = "grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-[7px] text-[13px] leading-5";

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
        Рейтинг недели
      </SectionLabel>
      <BlockNote state={load} failed="Рейтинг не загрузился" now={now} onRetry={() => void rating.refetch()} />
      {load.kind === "loading" ? (
        <RowsBone rows={5} wide="64%" />
      ) : load.kind === "failed" ? null : rows.length === 0 ? (
        <div className="desk-list">
          <Quiet testId="home-rating-empty">За неделю очков пока нет — начислите строкой поручения: «Марату 50 очков за объект»</Quiet>
        </div>
      ) : (
        <ol className="desk-list" data-testid="home-rating-list">
          {rows.map((row) => (
            <li key={row.user_id} className={RATING_ROW} data-testid="home-rating-row">
              <span className={`nums text-[13px] ${row.rank <= 3 ? "font-semibold" : "text-muted"}`}>{row.rank}</span>
              <span className="min-w-0 truncate text-[14px]" title={row.display_name}>
                {shortName(row.display_name)}
              </span>
              <span className="nums text-[12px]" style={{ color: "var(--ok)" }} title={row.delta_vs_prev > 0 ? `На ${row.delta_vs_prev} больше, чем за прошлую неделю` : undefined}>
                {row.delta_vs_prev > 0 ? `↑${row.delta_vs_prev}` : ""}
              </span>
              <span className="nums text-right text-[14px] font-semibold" style={{ color: "var(--gold)" }}>
                {row.points}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Aside>
  );
}
