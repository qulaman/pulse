import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, SHORT_STATUS } from "@/lib/tasks/status-text";

/**
 * «→ Марат · в работе» — what a handed-over point or sub-point became, as the director's own
 * phone says it (D-102 §8; the wall says less — no «отказ», no «просрочена», D-45). Before the
 * director's tasks have loaded — «→ поручено».
 */
export function handedLabel(task: Pick<TaskWithPeople, "status" | "deadline" | "assignee"> | undefined, now: Date): string {
  if (!task) return "→ поручено";
  const name = task.assignee?.full_name?.trim().split(/\s+/)[0];
  const state = isOverdue(task, now) ? "просрочена" : SHORT_STATUS[task.status];
  return [name ? `→ ${name}` : "→ поручено", state].filter(Boolean).join(" · ");
}
