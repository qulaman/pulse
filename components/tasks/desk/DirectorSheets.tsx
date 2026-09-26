"use client";

import { useState } from "react";

import { DeadlineSheet } from "@/components/confirm/DeadlineSheet";
import { PeoplePicker, type PickedPerson } from "@/components/people/PeoplePicker";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { reassignNeedsDeadline } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, TEXT } from "@/lib/tasks/status-text";

import { ReworkSheet } from "../TaskSheets";

export type DirectorSheetName = "rework" | "extend" | "reassign" | "revoke" | "delete" | "passDeadline";

const NAMES: readonly string[] = ["rework", "extend", "reassign", "revoke", "delete", "passDeadline"];

/** A reassign waiting for its new deadline (D-129): who takes the task and the director's word. */
export type PassTo = { person: PickedPerson; note: string };

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
  suggestedId,
  passTo,
  onNeedsDeadline,
}: {
  task: TaskWithPeople;
  open: DirectorSheetName | null;
  onClose: () => void;
  actions: TaskActions;
  /** On the task's own page there is nothing left to look at after «Удалить». */
  afterRemove?: () => void;
  /** The colleague the employee suggested — on top of «Кому передать?» (D-129). */
  suggestedId?: string | null;
  /** The reassign that asks for a new deadline before it goes (D-129). */
  passTo?: PassTo | null;
  /** The old deadline is behind or within the hour: the caller opens «Срок для …». */
  onNeedsDeadline?: (pass: PassTo) => void;
}) {
  const [note, setNote] = useState("");
  const now = new Date();
  const passFirst = passTo?.person.full_name.trim().split(/\s+/)[0] ?? "";
  const oldLine = task.deadline
    ? new Date(task.deadline).getTime() < now.getTime()
      ? `Прежний срок прошёл: ${humanAqtobe(new Date(task.deadline), now)}`
      : `До прежнего срока меньше часа: ${humanAqtobe(new Date(task.deadline), now)}`
    : null;

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
        hint="Задача уйдёт этому человеку как новая; прежний увидит «передана»"
        currentId={task.assignee_id}
        suggestedIds={suggestedId ? [suggestedId] : undefined}
        footer={
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Пару слов новому исполнителю — по желанию"
            aria-label="Слова новому исполнителю"
            data-testid="reassign-note"
            className="field min-h-[44px] w-full px-3 text-[16px] outline-none placeholder:text-muted focus:border-accent"
          />
        }
        onPick={(person) => {
          const word = note.trim();
          setNote("");
          // a deadline already behind (or all but gone) would reach the new person late at birth
          if (reassignNeedsDeadline(task.deadline, new Date()) && onNeedsDeadline) {
            onNeedsDeadline({ person, note: word });
            return;
          }
          actions.reassign({ taskId: task.id, assigneeId: person.id, assigneeName: person.full_name, note: word || undefined });
        }}
      />
      <DeadlineSheet
        open={open === "passDeadline" && Boolean(passTo)}
        onClose={onClose}
        title={passFirst ? `Срок для: ${passFirst}` : "Новый срок"}
        hint={oldLine}
        currentIso={null}
        onPick={(iso) => {
          if (!passTo) return;
          actions.reassign({
            taskId: task.id,
            assigneeId: passTo.person.id,
            assigneeName: passTo.person.full_name,
            changeDeadline: true,
            deadlineIso: iso,
            note: passTo.note || undefined,
          });
        }}
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
