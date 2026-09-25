"use client";

import { HeadButton } from "@/components/ui/HeadButton";
import { toast } from "@/components/ui/Toast";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { effectiveMode } from "@/lib/tv/state";

/** What can go up on the wall: a live order or an accepted one — never a declined or revoked (D-45). */
const ON_WALL = new Set(["sent", "accepted", "in_progress", "rework", "pending_review", "done"]);

/**
 * «На экран» на экране задачи директора (D-123): тот же жест, что у карточки сотрудника и
 * календаря (D-109), — это дело со всей его историей встаёт на стену в кабинете на 10 минут,
 * повторный тап возвращает эфир. Команда — пультом (`tv_control`), без сети — честное «нет
 * связи». Отказанное, отозванное и отложенное дело кнопки не получает.
 */
export function TaskOnWall({ taskId, status, title }: { taskId: string; status: string; title: string }) {
  const state = useTvState();
  const control = useTvControl();
  if (!ON_WALL.has(status)) return null;

  const row = state.data ?? null;
  const onWall = effectiveMode(row, new Date()) === "task" && row?.task_id === taskId;

  // the round button of the screen head (D-109): the diode is lit while the order is on the wall
  return (
    <HeadButton
      label={onWall ? "Убрать дело со стены" : "Показать дело на стене"}
      icon="tv"
      live={onWall}
      disabled={control.isPending}
      testId="task-on-wall"
      onClick={() =>
        control.mutate(onWall ? { mode: "ether" } : { mode: "task", taskId }, {
          onSuccess: () => toast(onWall ? "Дело убрано со стены" : `На стене — «${title.trim()}» · 10 мин`),
        })
      }
    />
  );
}
