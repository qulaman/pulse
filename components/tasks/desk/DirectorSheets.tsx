"use client";

import { DeadlineSheet } from "@/components/confirm/DeadlineSheet";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, TEXT } from "@/lib/tasks/status-text";

import { ReworkSheet } from "../TaskSheets";

export type DirectorSheetName = "rework" | "extend" | "reassign" | "revoke" | "delete";

const NAMES: readonly string[] = ["rework", "extend", "reassign", "revoke", "delete"];

/** Narrows a card's open-sheet state to the director's sheets. */
export function directorSheetOf(name: string): DirectorSheetName | null {
  return NAMES.includes(name) ? (name as DirectorSheetName) : null;
}

/**
 * The director's sheets of a task, in one place: the thread card and the cards of
 * «Задачи» (D-83) open the same ones, so a word or a button cannot drift between them.
 * Each sheet calls the existing action and closes; nothing here decides what is allowed.
 */
export function DirectorSheets({
  task,
  open,
  onClose,
  actions,
  afterRemove,
}: {
  task: TaskWithPeople;
  open: DirectorSheetName | null;
  onClose: () => void;
  actions: TaskActions;
  /** On the task's own page there is nothing left to look at after «Удалить». */
  afterRemove?: () => void;
}) {
  return (
    <>
      <ReworkSheet open={open === "rework"} onClose={onClose} onSubmit={(comment) => actions.transition({ taskId: task.id, toStatus: "rework", comment })} />

      <DeadlineSheet
        open={open === "extend"}
        onClose={onClose}
        currentIso={task.deadline}
        onPick={(iso) => actions.extend({ taskId: task.id, deadlineIso: iso })}
      />
      <PeoplePicker
        open={open === "reassign"}
        onClose={onClose}
        title="Кому передать?"
        subject={task.title}
        hint="Задача уйдёт этому человеку как новая, у прежнего исполнителя закроется с пометкой"
        currentId={task.assignee_id}
        onPick={(person) => actions.reassign({ taskId: task.id, assigneeId: person.id, assigneeName: person.full_name })}
      />

      <Sheet open={open === "revoke"} onClose={onClose} title={BUTTON.revoke}>
        <p className="text-[16px] leading-[22px] text-muted">{TEXT.revokeConfirm}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              actions.revoke(task.id);
              onClose();
            }}
          >
            {BUTTON.revoke}
          </Button>
          <Button variant="secondary" block onClick={onClose}>
            Не сейчас
          </Button>
        </div>
      </Sheet>

      <Sheet open={open === "delete"} onClose={onClose} title={BUTTON.remove}>
        <p className="text-[16px] leading-[22px] text-muted">{TEXT.removeConfirm}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              actions.remove(task.id);
              onClose();
              afterRemove?.();
            }}
          >
            {BUTTON.remove}
          </Button>
          <Button variant="secondary" block onClick={onClose}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </>
  );
}
