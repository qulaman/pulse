import type { RowKey } from "@/lib/desk/tasks";
import { answersFor } from "@/lib/tasks/answers";

/**
 * «.» on a task: its «Ещё» under `root` opens as if clicked — a row's «⋯», the panel's or the
 * stack's «Ещё», each marked `data-desk-more` with the task's id.
 */
export function openMoreOf(taskId: string, root: ParentNode | null | undefined) {
  root?.querySelector<HTMLElement>(`[data-desk-more="${CSS.escape(taskId)}"]`)?.click();
}

export type TaskKeyTarget = {
  /** where the task's «Ещё» stands */
  root: ParentNode | null | undefined;
  /** the task's letters (`rowKeys`) */
  letters: readonly RowKey[];
  /** the employee's open question: the digits give its quick answers (`answersFor`) */
  question?: string | null;
  now?: Date;
  onAnswer?: (text: string, deadlineIso: string | undefined) => void;
  /** a letter's move; «reply» — the caret into the answer field */
  onLetter: (action: RowKey["action"]) => void;
};

/**
 * One task's own keys at the desk — the table's chosen row, the decision under the cursor of
 * «Сегодня», the card of «Разобрать», the panel: «.» opens its «Ещё», a digit gives the quick
 * answer of that number to its open question, a letter does its move. True — the key was the
 * task's: the caller takes it (`preventDefault`).
 */
export function pressTaskKey(code: string, task: { id: string; deadline: string | null }, target: TaskKeyTarget): boolean {
  if (code === "Period") {
    openMoreOf(task.id, target.root);
    return true;
  }
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit && target.question && target.onAnswer) {
    const answer = answersFor(target.question, task.deadline, target.now)[Number(digit[1]) - 1];
    if (!answer) return false;
    target.onAnswer(answer.text, answer.deadlineIso);
    return true;
  }
  const key = target.letters.find((one) => one.code === code);
  if (!key) return false;
  target.onLetter(key.action);
  return true;
}
