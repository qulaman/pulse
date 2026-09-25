"use client";

import { initialsOfName } from "@/lib/tv/focus";

/**
 * Лицо человека на стене: фото, если оно есть, иначе инициалы в круге бренда. Размер — в
 * `vh`, как всё на стене; `ring` — цветное кольцо (медаль пьедестала, акцент фокуса).
 * Кольцо — статичная тень: на стене ничего не светится анимацией (D-45).
 */
export function TvAvatar({
  name,
  src,
  size,
  ring,
}: {
  name: string;
  src: string | null | undefined;
  /** Диаметр в vh. */
  size: number;
  ring?: string;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold leading-none"
      style={{
        width: `${size}vh`,
        height: `${size}vh`,
        fontSize: `${size * 0.4}vh`,
        background: "color-mix(in srgb, var(--accent-2) 30%, var(--surface-2))",
        boxShadow: ring
          ? `0 0 0 ${Math.max(0.3, size * 0.035)}vh var(--bg), 0 0 0 ${Math.max(0.6, size * 0.07)}vh ${ring}`
          : `0 0 0 ${Math.max(0.3, size * 0.035)}vh color-mix(in srgb, var(--accent-2) 55%, transparent)`,
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
