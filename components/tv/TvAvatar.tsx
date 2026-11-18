"use client";

import { initialsOfName } from "@/lib/tv/focus";

/**
 * Лицо человека на стене: фото, если оно есть, иначе инициалы в круге бренда. Размер — в
 * `vh`, как всё на стене; `ring` — цветное кольцо (медаль пьедестала, акцент фокуса).
 * Кольцо — статичная тень: на стене ничего не светится анимацией (D-45).
 *
 * `yields` — круг уступает место тексту, когда пульт растит шрифт («Крупность», `--tv-k`, D-182):
 * при «далеко» он меньше на четверть, и сцена с крупными словами всё равно помещается.
 */
export function TvAvatar({
  name,
  src,
  size,
  ring,
  yields = false,
}: {
  name: string;
  src: string | null | undefined;
  /** Диаметр в vh. */
  size: number;
  ring?: string;
  yields?: boolean;
}) {
  const d = yields ? `calc(${size}vh * (2.3 - var(--tv-k, 1)) / 1.3)` : `${size}vh`;
  const inner = `${Math.max(0.3, size * 0.035)}vh`;
  const outer = `${Math.max(0.6, size * 0.07)}vh`;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold leading-none"
      style={{
        width: d,
        height: d,
        fontSize: `calc(${d} * 0.4)`,
        background: "color-mix(in srgb, var(--accent-2) 30%, var(--surface-2))",
        boxShadow: ring
          ? `0 0 0 ${inner} var(--bg), 0 0 0 ${outer} ${ring}`
          : `0 0 0 ${inner} color-mix(in srgb, var(--accent-2) 55%, transparent)`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOfName(name)
      )}
    </span>
  );
}
