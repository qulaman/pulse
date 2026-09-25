"use client";

import { Button } from "@/components/ui/Button";
import { boardOnWall } from "@/lib/mindboard/list";
import { stepLabel, stepPoint } from "@/lib/mindboard/tree";
import { useTvBoardControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { boardPointOf } from "@/lib/tv/state";

export type PresenterPoint = { id: string; text: string; done: boolean };

type Props = {
  boardId: string;
  /** Points of the top level with words, in the order of the board: the steps go through these. */
  points: PresenterPoint[];
  now: Date;
  /** Where it is drawn: under the board on the phone, or in the «Доска на стене» seam of the remote. */
  variant: "board" | "remote";
};

/**
 * Ведущий (D-121): пока доска на стене, ◀ ▶ ведут совещание по пунктам — стена
 * подсвечивает обсуждаемый, остальные приглушает. Один компонент на двух местах: на
 * экране доски и на пульте. Команда — `tv_board_control`, без очереди (D-76 §3).
 *
 * FOUNDATION STUB — owned by the remote stream; the phone stream only places it.
 */
export function BoardPresenter({ boardId, points, now, variant }: Props) {
  const state = useTvState();
  const control = useTvBoardControl();
  if (!boardOnWall(state.data, boardId, now)) return null;

  const order = points.map((point) => point.id);
  const current = boardPointOf(state.data ?? null, now);
  const spot = current && order.includes(current) ? current : null;
  const label = stepLabel(order, spot);
  const go = (direction: 1 | -1) => {
    const next = stepPoint(order, spot, direction);
    if (next) control.mutate({ point: next });
  };

  return (
    <div className="flex items-center gap-2" data-testid={`presenter-${variant}`}>
      <Button variant="secondary" size="sm" aria-label="Предыдущий пункт" disabled={order.length === 0} onClick={() => go(-1)}>
        ◀
      </Button>
      <span className="nums min-w-0 flex-1 truncate text-center text-[14px] font-semibold" data-testid="presenter-label">
        {label ?? "Ведущий: ▶ — первый пункт"}
      </span>
      <Button variant="secondary" size="sm" aria-label="Следующий пункт" disabled={order.length === 0} onClick={() => go(1)}>
        ▶
      </Button>
      {spot ? (
        <Button variant="ghost" size="sm" onClick={() => control.mutate({ clearPoint: true })}>
          Снять
        </Button>
      ) : null}
    </div>
  );
}
