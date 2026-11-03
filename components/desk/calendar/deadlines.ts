import type { Ymd } from "@/lib/datetime/calendar";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

import { wallOf } from "./week";

/**
 * «Сроки задач» — the director's open orders laid over the calendar (D-154): the planning is
 * done by the deadlines, so the week can show them in their hour. One mark per order; an order
 * given to several people at once (one `group_id`, one deadline) is one mark with a count.
 */

/** Closed: nothing is due any more. */
const CLOSED: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["done", "declined", "revoked"]);

export type DeadlineTone = "danger" | "warn" | "muted";

export type DeadlineMark = {
  /** The task the mark opens (the first of a group). */
  id: string;
  ymd: Ymd;
  /** Minutes past the wall clock's midnight. */
  minutes: number;
  time: string;
  /** The assignee's full name — or null for a group, which has `count` instead. */
  who: string | null;
  count: number;
  title: string;
  tone: DeadlineTone;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Overdue — the loudest; due today — a warning; any other day — quiet. */
function toneOf(tasks: readonly TaskWithPeople[], ymd: Ymd, today: Ymd, now: Date): DeadlineTone {
  if (tasks.some((task) => isOverdue(task, now))) return "danger";
  return ymd === today ? "warn" : "muted";
}

/** The marks of the days on screen, by day, in the order of the clock. */
export function deadlineMarks(tasks: readonly TaskWithPeople[], days: readonly Ymd[], today: Ymd, now: Date): Map<Ymd, DeadlineMark[]> {
  const shown = new Set(days);
  const groups = new Map<string, TaskWithPeople[]>();
  for (const task of tasks) {
    if (!task.deadline || CLOSED.has(task.status)) continue;
    if (!shown.has(wallOf(task.deadline).ymd)) continue;
    const key = task.group_id ? `${task.group_id}|${task.deadline}` : task.id;
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }

  const byDay = new Map<Ymd, DeadlineMark[]>();
  for (const list of groups.values()) {
    const first = list[0];
    const { ymd, minutes } = wallOf(first.deadline as string);
    const mark: DeadlineMark = {
      id: first.id,
      ymd,
      minutes,
      time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      who: list.length === 1 ? (first.assignee?.full_name ?? null) : null,
      count: list.length,
      title: first.title.trim(),
      tone: toneOf(list, ymd, today, now),
    };
    const day = byDay.get(ymd);
    if (day) day.push(mark);
    else byDay.set(ymd, [mark]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.minutes - b.minutes || a.title.localeCompare(b.title, "ru"));
  return byDay;
}

/** How many marks there are on screen. */
export function markCount(byDay: Map<Ymd, DeadlineMark[]>): number {
  let count = 0;
  for (const list of byDay.values()) count += list.length;
  return count;
}

/** The loudest tone among a day's marks. */
export function loudest(marks: readonly DeadlineMark[]): DeadlineTone {
  if (marks.some((mark) => mark.tone === "danger")) return "danger";
  if (marks.some((mark) => mark.tone === "warn")) return "warn";
  return "muted";
}
