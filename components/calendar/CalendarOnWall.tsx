"use client";

import { toast } from "@/components/ui/Toast";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { sceneOf } from "@/lib/tv/state";

/**
 * «На экран» у календаря директора (D-96): тот же жест, что «На экран» на карточке
 * сотрудника, — неделя вперёд встаёт на стену в кабинете заставкой «Календарь». Повторный
 * тап возвращает лицо. Команда — пультом (`tv_control`), без сети — честное «нет связи».
 */
export function CalendarOnWall() {
  const state = useTvState();
  const control = useTvControl();
  const onWall = sceneOf(state.data ?? null) === "calendar";

  return (
    <button
      type="button"
      aria-label={onWall ? "Убрать календарь со стены" : "Показать календарь на стене"}
      aria-pressed={onWall}
      disabled={control.isPending}
      onClick={() =>
        control.mutate(
          { scene: onWall ? "face" : "calendar" },
          { onSuccess: () => toast(onWall ? "Календарь убран со стены" : "Календарь на стене · неделя вперёд") },
        )
      }
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors duration-[120ms] active:bg-surface-2 disabled:opacity-50"
      style={{ color: onWall ? "var(--accent)" : "var(--text-muted)", background: onWall ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined }}
      data-testid="calendar-on-wall"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M9 20.5h6M12 16.5v4" />
      </svg>
    </button>
  );
}
