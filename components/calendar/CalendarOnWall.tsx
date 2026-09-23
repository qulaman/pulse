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
      // the round button of the screen heads («Задачи», «Заметки», «Календарь»)
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color,color] duration-[120ms] active:scale-95 disabled:opacity-50 ${
        onWall ? "border-accent/60 bg-accent/15 text-accent" : "border-border/80 bg-surface text-muted"
      }`}
      data-testid="calendar-on-wall"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M9 20.5h6M12 16.5v4" />
      </svg>
    </button>
  );
}
