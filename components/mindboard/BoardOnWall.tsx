"use client";

import { NoteIcon } from "@/components/notes/icons";
import { toast } from "@/components/ui/Toast";
import { boardOnWall } from "@/lib/mindboard/list";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

/**
 * «На стену» in the head of a board (D-102 §3): the same gesture as the calendar's — one tap
 * puts this board on the office wall till the end of the day, a second tap gives the wall
 * back to the face. The command is the remote's (`tv_control`); no network — an honest
 * «нет связи», never «later».
 */
export function BoardOnWall({ boardId, now }: { boardId: string; now: Date }) {
  const state = useTvState();
  const control = useTvControl();
  const onWall = boardOnWall(state.data, boardId, now);

  return (
    <button
      type="button"
      aria-label={onWall ? "Убрать доску со стены" : "Показать доску на стене"}
      aria-pressed={onWall}
      disabled={control.isPending}
      data-testid="board-on-wall"
      onClick={() =>
        control.mutate(onWall ? { scene: "face" } : { board: boardId }, {
          onSuccess: (row) => {
            if (onWall) toast("Доска убрана со стены");
            else toast(row.board_until ? `Доска на стене до ${TIME.format(new Date(row.board_until))}` : "Доска на стене");
          },
        })
      }
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color,color] duration-[120ms] active:scale-95 disabled:opacity-50 ${
        onWall ? "border-accent/60 bg-accent/15 text-accent" : "border-border/80 bg-surface text-muted"
      }`}
    >
      <NoteIcon name="wall" size={20} />
    </button>
  );
}
