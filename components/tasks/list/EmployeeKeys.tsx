"use client";

import { Button } from "@/components/ui/Button";
import { isWorking } from "@/lib/tasks/lifecycle";
import { BUTTON, type TaskStatus } from "@/lib/tasks/status-text";

import { Icon } from "../icons";

export type EmployeeAction = "accept" | "ask" | "decline" | "complete";

/** A key of a new order's row: its words' width plus an equal share, as on Лента's card (D-173). */
const KEY = "min-w-0 flex-auto !px-2 whitespace-nowrap [&>span]:gap-1";

/**
 * The employee's buttons of FRONTEND «Состояние задачи → набор кнопок», wherever a task shows
 * them — a card of «Мои дела», the task's own screen, the full card of Лента: Принял / Уточнить /
 * Не могу on a new task, Выполнено / Уточнить / Не могу on work in hand (rework needs no second
 * «Принял» — the tap walks rework → accepted → pending_review itself). Three at most — принцип 2,
 * not to be widened. Nothing for any other state. `className` is laid on the row (a card with a
 * rail wants it `relative`).
 */
export function EmployeeKeys({
  status,
  onPress,
  className = "",
}: {
  status: TaskStatus;
  onPress: (action: EmployeeAction) => void;
  className?: string;
}) {
  if (status === "sent") {
    // three keys in a row, each as wide as its words plus an equal share of the rest, the icon
    // close to its word: in equal thirds «Уточнить» ran its icon into the edge at 360 px (D-173)
    return (
      <div className={`mt-4 flex gap-2 ${className}`}>
        <Button data-testid="task-action-accept" className={KEY} icon={<Icon name="check" />} onClick={() => onPress("accept")}>
          {BUTTON.accept}
        </Button>
        <Button variant="secondary" className={KEY} icon={<Icon name="question" />} onClick={() => onPress("ask")}>
          {BUTTON.ask}
        </Button>
        <Button variant="danger" className={KEY} icon={<Icon name="x" />} onClick={() => onPress("decline")}>
          {BUTTON.cant}
        </Button>
      </div>
    );
  }
  if (isWorking(status)) {
    // «Выполнено» leads on its own row: three keys of a third each clip it on an iPhone SE;
    // «Не могу» after «Принял» asks for time, names the right colleague or refuses (D-128)
    return (
      <div className={`mt-4 grid grid-cols-2 gap-2 ${className}`}>
        <Button data-testid="task-action-complete" className="col-span-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onPress("complete")}>
          {BUTTON.complete}
        </Button>
        <Button variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onPress("ask")}>
          {BUTTON.ask}
        </Button>
        <Button data-testid="task-action-cant" variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="clock" />} onClick={() => onPress("decline")}>
          {BUTTON.cant}
        </Button>
      </div>
    );
  }
  return null;
}
