"use client";

import { HeadButton } from "@/components/ui/HeadButton";
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

  // the round button of the screen head (D-109): the diode is lit while the board is on the wall
  return (
    <HeadButton
      label={onWall ? "Убрать доску со стены" : "Показать доску на стене"}
      icon="wall"
      live={onWall}
      disabled={control.isPending}
      testId="board-on-wall"
      onClick={() =>
        control.mutate(onWall ? { scene: "face" } : { board: boardId }, {
          onSuccess: (row) => {
            if (onWall) toast("Доска убрана со стены");
            else toast(row.board_until ? `Доска на стене до ${TIME.format(new Date(row.board_until))}` : "Доска на стене");
          },
        })
      }
    />
  );
}
