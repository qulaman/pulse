/**
 * The name of a scene, always in one place — top left of the safe frame (D-185): a passer-by knows
 * what the wall shows in two seconds. One line, no caps-with-spacing kicker above it; `sub` is a
 * quieter note on the same baseline («последние 7 дней», «пятница, 20 ноября»).
 *
 * Scenes that are one picture — «Сегодня», the clock, a moment, photos, the welcome — have no head.
 */
export function TvSceneHead({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <div className="flex items-baseline gap-[2.4vh]" data-testid="tv-scene-head">
      <h2 className="tv-small font-semibold" style={{ color: "var(--tv-text)" }}>
        {title}
      </h2>
      {sub ? <span className="tv-small text-muted">{sub}</span> : null}
    </div>
  );
}
