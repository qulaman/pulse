import { reassignNeedsDeadline } from "./lifecycle";
import type { TaskWithPeople } from "./query-core";
import type { TaskStatus } from "./status-text";

/**
 * «Изменить задачу» (D-200) without the screen: which tasks the form opens for, what the form
 * starts from, what it would send, what stops it and what it tells the director will happen.
 * Pure — the clock comes in, so the words are unit-tested.
 */

/** Every open task: closed ones (`done`, `revoked`) stay history. */
export const EDITABLE: readonly TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework", "pending_review", "declined"];

export function canEdit(status: TaskStatus): boolean {
  return EDITABLE.includes(status);
}

/** Handed-in work is judged first — «Принять» or «На доработку» — and only then changes hands. */
export function canChangePerson(status: TaskStatus): boolean {
  return canEdit(status) && status !== "pending_review";
}

type Editable = Pick<TaskWithPeople, "title" | "body" | "priority" | "deadline" | "status" | "assignee_id" | "scheduled_send_at"> & {
  assignee?: { full_name: string | null } | null;
};

export type EditDraft = {
  title: string;
  body: string;
  urgent: boolean;
  deadline: string | null;
  assigneeId: string;
  assigneeName: string;
  /** a word to a new person — rides in their push, as «Передать» does */
  note: string;
};

export function draftOf(task: Editable): EditDraft {
  return {
    title: task.title,
    body: task.body ?? "",
    urgent: task.priority === "high",
    deadline: task.deadline,
    assigneeId: task.assignee_id,
    assigneeName: task.assignee?.full_name ?? "",
    note: "",
  };
}

/** What the form sends: the words always, the rest only when it changed. */
export type EditPlan = {
  changed: boolean;
  title: string;
  body: string | null;
  priority?: TaskWithPeople["priority"];
  deadline?: { iso: string | null };
  assignee?: { id: string; name: string };
  note?: string;
};

const sameMoment = (a: string | null, b: string | null) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : a === b);

export function planOf(task: Editable, draft: EditDraft): EditPlan {
  const title = draft.title.trim();
  const body = draft.body.trim() || null;
  const priority = draft.urgent ? "high" : task.priority === "high" ? "normal" : task.priority;
  const plan: EditPlan = { changed: false, title, body };
  if (title !== task.title.trim() || body !== (task.body?.trim() || null)) plan.changed = true;
  if (priority !== task.priority) {
    plan.priority = priority;
    plan.changed = true;
  }
  if (!sameMoment(draft.deadline, task.deadline)) {
    plan.deadline = { iso: draft.deadline };
    plan.changed = true;
  }
  if (draft.assigneeId && draft.assigneeId !== task.assignee_id) {
    plan.assignee = { id: draft.assigneeId, name: draft.assigneeName };
    if (draft.note.trim() && task.status !== "scheduled") plan.note = draft.note.trim();
    plan.changed = true;
  }
  return plan;
}

/** What stops the save, said at its field. */
export type EditProblem = { field: "title" | "deadline"; text: string };

export function problemOf(task: Editable, draft: EditDraft, now: Date = new Date()): EditProblem | null {
  const plan = planOf(task, draft);
  if (!plan.title) return { field: "title", text: "Без текста задачу не сохранить" };
  const iso = plan.deadline?.iso ?? null;
  if (iso && new Date(iso).getTime() <= now.getTime()) return { field: "deadline", text: "Это время уже прошло — выберите позже" };
  if (iso && task.status === "scheduled" && task.scheduled_send_at && new Date(iso).getTime() <= new Date(task.scheduled_send_at).getTime()) {
    return { field: "deadline", text: "Задача уйдёт позже этого срока — выберите позже" };
  }
  // a deadline behind (or all but gone) would reach the new person late at birth (D-128)
  if (plan.assignee && !plan.deadline && task.status !== "scheduled" && reassignNeedsDeadline(task.deadline, now)) {
    return { field: "deadline", text: `Срок прошёл или вот-вот — назначьте новый для: ${firstName(plan.assignee.name)}` };
  }
  return null;
}

const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * What the save will do, in one line under the form — so the director knows who learns of it
 * (principle 8). `names` — the screen's short names of the people.
 */
export function noticeOf(task: Editable, plan: EditPlan, names: { now: string; next?: string } = { now: firstName(task.assignee?.full_name) }): string {
  if (!plan.changed) return "Пока ничего не изменено";
  if (task.status === "scheduled") return "Задача ещё не ушла — уйдёт уже с правкой, отдельного уведомления не будет";
  if (plan.assignee) {
    const next = names.next || firstName(plan.assignee.name);
    return names.now ? `${next} получит задачу заново, уже с правкой. ${names.now} увидит у себя «Задача передана»` : `${next} получит задачу заново, уже с правкой`;
  }
  const who = names.now || "Исполнитель";
  // the task keeps its status: a refused one still waits for «Настоять», handed-in work for the director
  if (task.status === "declined") return `${who} получит уведомление «Задача изменена». Задача по-прежнему с отказом — в работу её вернёт «Настоять»`;
  if (task.status === "pending_review") return `${who} получит уведомление «Задача изменена». Сданная работа по-прежнему ждёт вашей проверки`;
  return `${who} получит уведомление «Задача изменена», в переписке останется, что было. Принимать заново не нужно`;
}
