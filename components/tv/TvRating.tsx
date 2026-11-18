"use client";

import { RollingNumber } from "@/components/ui/RollingNumber";
import { pluralRu } from "@/lib/tasks/status-text";
import type { RatingView } from "@/lib/tv/focus";

/**
 * Рейтинг человека на стене (D-120): место с медалью (только из первой пятёрки), очки
 * недели, рост к прошлой неделе и четыре недели столбиками — плитка «число + тренд».
 * Ниже — итог недели одним числом («сдано 9»). «В срок» рядом со «сдано»
 * не печатается: пара чисел сама выдаёт опоздание (D-45, D-182). Правило — в `ratingView`.
 *
 * Столбики — один ряд одного цвета: прошлые недели приглушены, текущая — золотом, без
 * легенды (серия одна) и без подсказок (на стене ничего не нажимают).
 */

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (components/rating/Podium.tsx). */
const MEDAL = ["var(--gold)", "#B8C2CC", "#C98A5B"];

export function TvRating({ view }: { view: RatingView }) {
  const max = Math.max(1, ...(view.bars ?? []).map((bar) => bar.value));
  const showPoints = view.rank !== null || view.points !== null || view.bars !== null;

  return (
    // a fragment: each block is its own item of the person column, which drops whole blocks that do not fit
    <>
      {showPoints ? (
        <section className="flex w-full flex-col gap-[1vh]" data-testid="tv-rating">
          <p className="tv-caption font-semibold text-muted">Рейтинг недели</p>

          {view.rank !== null ? (
            <p className="flex items-center gap-[1.4vh]">
              <span
                className="tv-caption nums flex h-[5vh] w-[5vh] items-center justify-center rounded-full font-bold tabular-nums"
                style={{
                  color: view.rank <= 3 ? MEDAL[view.rank - 1] : "var(--text)",
                  boxShadow: `inset 0 0 0 0.45vh ${view.rank <= 3 ? MEDAL[view.rank - 1] : "var(--border)"}`,
                }}
              >
                {view.rank}
              </span>
              <span className="tv-text font-bold">место</span>
            </p>
          ) : null}

          <div className="flex items-end justify-between gap-[2vh]">
            {view.points !== null ? (
              <div className="min-w-0">
                <p className="flex items-baseline gap-[1vh]">
                  <span className="tv-title nums font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                    <RollingNumber value={view.points} />
                  </span>
                  <span className="tv-caption text-muted">{pluralRu(view.points, ["очко", "очка", "очков"])}</span>
                </p>
                {view.delta !== null ? (
                  <p className="tv-caption nums font-semibold tabular-nums" style={{ color: "var(--ok)" }}>
                    ▲ +{view.delta} к прошлой
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* four weeks as bars: no words under them, the shape is the message */}
            {view.bars ? (
              <div className="flex h-[7vh] shrink-0 items-end gap-[0.8vh]" aria-label="Очки по неделям">
                {view.bars.map((bar, index) => (
                  <span
                    key={index}
                    className="w-[2.6vh] rounded-t-[0.5vh]"
                    style={{
                      // anchored to the baseline; an empty week keeps a hairline, not a gap
                      height: `${Math.max(0.4, (bar.value / max) * 7)}vh`,
                      background: "var(--gold)",
                      opacity: bar.current ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {view.week ? (
        <section className="flex w-full flex-col">
          <p className="tv-caption font-semibold text-muted">За неделю</p>
          <p className="tv-text font-semibold">
            сдано <span className="nums tabular-nums">{view.week.done}</span>
          </p>
        </section>
      ) : null}
    </>
  );
}
