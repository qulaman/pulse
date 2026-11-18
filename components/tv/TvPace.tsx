"use client";

import { paceView, type TvPaceData } from "@/lib/tv/results";

/**
 * Темп дня под лицом стены (D-182): «Сегодня принято 9» и тонкая полоса к обычному дню. Ниже
 * обычного — только число, без полосы и сравнения; выше — «больше обычного» (D-45). Пока ничего
 * не принято — ничего не показывается. Полоса меняется transform'ом (scaleX), не шириной.
 */
export function TvPace({ pace }: { pace: TvPaceData }) {
  const view = paceView(pace);
  if (!view) return null;

  return (
    <div className="flex w-[44vh] max-w-full flex-col items-center gap-[1.2vh]" data-testid="tv-pace">
      <p className="tv-text text-center">
        <span className="text-muted">Сегодня принято </span>
        <span className="nums font-bold tabular-nums">{view.done}</span>
      </p>
      {view.bar != null ? (
        <span className="relative block h-[0.8vh] w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ok) 18%, transparent)" }}>
          <span
            className="absolute inset-0 origin-left rounded-full"
            style={{ background: "var(--ok)", transform: `scaleX(${view.bar})`, transition: "transform 600ms cubic-bezier(0.2, 0, 0, 1)" }}
          />
        </span>
      ) : null}
      {view.note ? (
        <p className="tv-caption" style={{ color: "var(--ok)" }}>
          {view.note}
        </p>
      ) : null}
    </div>
  );
}
