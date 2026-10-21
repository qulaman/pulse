"use client";

import { useRef } from "react";

import { HeadButton } from "@/components/ui/HeadButton";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { boardOnWall } from "@/lib/mindboard/list";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { afterBoard } from "@/lib/tv/state";

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

/** A press this long is a hold: «Как на стене» instead of the tap's «до 21:00». */
const HOLD_MS = 450;

/**
 * «На стену» in the head of a board (D-102 §3): the same gesture as the calendar's — one tap
 * puts this board on the office wall till the end of the day, a second tap gives the wall
 * back to the face (and `onEjected` says what the meeting got through, D-140). A hold opens
 * «Как на стене» (`onHold`): the preview, the view and a shorter time. The command is the
 * remote's (`tv_control`); no network — an honest «нет связи», never «later».
 */
export function BoardOnWall({ boardId, now, onHold, onEjected }: { boardId: string; now: Date; onHold?: () => void; onEjected?: () => void }) {
  const state = useTvState();
  const control = useTvControl();
  const onWall = boardOnWall(state.data, boardId, now);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // the round button of the screen head (D-109): the diode is lit while the board is on the wall
  return (
    <span
      className="contents"
      onPointerDown={() => {
        held.current = false;
        if (!onHold) return;
        cancel();
        timer.current = setTimeout(() => {
          held.current = true;
          haptic(12);
          onHold();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
      // the hold already answered: the click that follows the release is not a tap
      onClickCapture={(event) => {
        if (!held.current) return;
        held.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <HeadButton
        label={onWall ? "Убрать доску со стены" : "Показать доску на стене"}
        icon="wall"
        live={onWall}
        disabled={control.isPending}
        testId="board-on-wall"
        onClick={() =>
          // taken down, the wall goes to the face — or to the round, while a week board waits in it (D-144)
          control.mutate(onWall ? afterBoard(state.data ?? null, new Date()) : { board: boardId }, {
            onSuccess: (row) => {
              if (onWall) {
                if (onEjected) onEjected();
                else toast("Доска убрана со стены");
              } else toast(row.board_until ? `Доска на стене до ${TIME.format(new Date(row.board_until))}` : "Доска на стене");
            },
          })
        }
      />
    </span>
  );
}
