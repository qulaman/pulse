"use client";

import { HeadButton } from "@/components/ui/HeadButton";
import { toast } from "@/components/ui/Toast";
import { usePointsEnabled } from "@/lib/points/queries";
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
  // the round of scenes counts the rating only with points on (D-123): the same count as the wall
  const points = usePointsEnabled().data ?? true;
  const onWall = sceneOf(state.data ?? null, new Date(), points) === "calendar";

  // the round button of the screen head (D-109): the diode is lit while the calendar is on the wall
  return (
    <HeadButton
      label={onWall ? "Убрать календарь со стены" : "Показать календарь на стене"}
      icon="tv"
      live={onWall}
      disabled={control.isPending}
      testId="calendar-on-wall"
      onClick={() =>
        control.mutate(
          { scene: onWall ? "face" : "calendar" },
          { onSuccess: () => toast(onWall ? "Календарь убран со стены" : "Календарь на стене · неделя вперёд") },
        )
      }
    />
  );
}
