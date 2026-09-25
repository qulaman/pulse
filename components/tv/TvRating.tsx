"use client";

import { pluralRu } from "@/lib/tasks/status-text";
import type { RatingView } from "@/lib/tv/focus";

/**
 * Рейтинг человека на стене (D-120): место с медалью (только из первой пятёрки), очки
 * недели, рост к прошлой неделе и четыре недели столбиками — плитка «число + тренд».
 * Ниже — итоги недели: сколько сдано и сколько из них в срок, и сколько — сегодня. Всё, что читалось бы
 * упрёком, сюда не доходит — правило в `ratingView` (D-45).
 *
 * Столбики — один ряд одного цвета: прошлые недели приглушены, текущая — золотом, без
 * легенды (серия одна) и без подсказок (на стене ничего не нажимают).
 */

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (components/rating/Podium.tsx). */
const MEDAL = ["var(--gold)", "#B8C2CC", "#C98A5B"];

export function TvRating({ view, today }: { view: RatingView; today: number }) {
  const max = Math.max(1, ...(view.bars ?? []).map((bar) => bar.value));
  const showPoints = view.rank !== null || view.points !== null || view.bars !== null;

  return (
    <div className="flex flex-col gap-[2.6vh]" data-testid="tv-rating">
      {showPoints ? (
        <section className="flex flex-col gap-[1.2vh]">
          <p className="text-[2.2vh] font-semibold leading-[2.8vh] text-muted">Рейтинг недели</p>

          {view.rank !== null ? (
            <p className="flex items-center gap-[1.4vh]">
              <span
                className="flex h-[5vh] w-[5vh] items-center justify-center rounded-full text-[2.8vh] font-bold tabular-nums"
                style={{
                  color: view.rank <= 3 ? MEDAL[view.rank - 1] : "var(--text)",
                  boxShadow: `inset 0 0 0 0.45vh ${view.rank <= 3 ? MEDAL[view.rank - 1] : "var(--border)"}`,
                }}
              >
                {view.rank}
              </span>
              <span className="text-[3.4vh] font-bold leading-[4vh]">место</span>
            </p>
          ) : null}

          <div className="flex items-end justify-between gap-[2vh]">
            {view.points !== null ? (
              <div className="min-w-0">
                <p className="flex items-baseline gap-[1vh]">
                  <span className="text-[6vh] font-bold leading-[6.4vh] tabular-nums" style={{ color: "var(--gold)" }}>
                    {view.points}
                  </span>
                  <span className="text-[2.4vh] leading-[3vh] text-muted">
                    {pluralRu(view.points, ["очко", "очка", "очков"])}
                  </span>
                </p>
                {view.delta !== null ? (
                  <p className="text-[2.2vh] font-semibold leading-[2.8vh] tabular-nums" style={{ color: "var(--ok)" }}>
                    ▲ +{view.delta} к прошлой неделе
                  </p>
                ) : null}
              </div>
            ) : null}

            {view.bars ? (
              <div className="flex shrink-0 flex-col items-end gap-[0.8vh]" aria-label="Очки по неделям">
                <div className="flex h-[7vh] items-end gap-[0.8vh]">
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
                <span className="text-[1.8vh] leading-[2.2vh] text-muted">4 недели</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {view.week ? (
        <section className="flex flex-col gap-[0.6vh]">
          <p className="text-[2.2vh] font-semibold leading-[2.8vh] text-muted">За неделю</p>
          <p className="text-[3.2vh] font-semibold leading-[4vh]">
            сдано <span className="tabular-nums">{view.week.done}</span>
            {view.week.onTime > 0 ? (
              <span className="text-muted">
                {" "}
                · в срок <span className="tabular-nums">{view.week.onTime}</span>
              </span>
            ) : null}
          </p>
          {today > 0 ? (
            <p className="flex items-center gap-[1vh] text-[2.6vh] font-semibold leading-[3.2vh]" style={{ color: "var(--ok)" }}>
              <CheckIcon />
              сегодня <span className="tabular-nums">{today}</span>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[1em] w-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
