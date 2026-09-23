import { aqtobeDay } from "@/lib/ai/time";

import { isOverdue, type TaskStatus } from "./status-text";

/**
 * How «Задачи» orders what the director handed out. A planner's list is not a feed:
 * the first question is «что горит», not «что последнее». So the page groups by the
 * deadline — просрочено → срочно → на приёмке → сегодня → завтра → на неделе → позже →
 * без срока — and closed work sinks to its own group at the bottom. Two piles answer «чей
 * ход» instead of «когда»: «Срочно» is what the director called urgent without naming a
 * time (it means «сейчас», so it never hides in «Без срока»), and «На приёмке» is work
 * already handed in — nobody can move it, so it stands by the director's hand in their
 * list and at the foot of the employee's. Pure functions: the page only renders them.
 */

/** The shape the grouping needs; a full TaskWithPeople satisfies it. */
export type Groupable = {
  id: string;
  status: TaskStatus;
  deadline: string | null;
  priority: string;
  created_at: string;
  assignee: { full_name: string } | null;
};

export type GroupBy = "deadline" | "person" | "none";

export const GROUP_LABEL: Record<GroupBy, string> = {
  deadline: "по сроку",
  person: "по людям",
  none: "новые сверху",
};

export type Bucket = "overdue" | "urgent" | "review" | "today" | "tomorrow" | "week" | "later" | "none" | "closed";

export const BUCKET_TITLE: Record<Bucket, string> = {
  overdue: "Просрочено",
  urgent: "Срочно",
  review: "На приёмке",
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "На этой неделе",
  later: "Позже",
  none: "Без срока",
  closed: "Закрытые",
};

/** Piles that answer «когда», in order. The rest answer «чей ход». */
export const TIME_BUCKETS: Bucket[] = ["today", "tomorrow", "week", "later", "none"];

/**
 * «На приёмке» means «твой ход» to the director and «не твой ход» to the employee, so
 * the same pile stands at the top of one list and at the foot of the other.
 */
function orderOf(reviewFirst: boolean): Bucket[] {
  return reviewFirst
    ? ["overdue", "urgent", "review", ...TIME_BUCKETS, "closed"]
    : ["overdue", "urgent", ...TIME_BUCKETS, "review", "closed"];
}

const CLOSED: readonly TaskStatus[] = ["done", "declined", "revoked"];

export type TaskGroup<T> = { key: Bucket | string; title: string; tasks: T[] };

/** Which pile a task falls into. A closed task is never «просрочено» — it is history. */
export function bucketOf(task: Groupable, now: Date = new Date()): Bucket {
  if (CLOSED.includes(task.status)) return "closed";
  // handed in and waiting for the director: nobody can work on it, so it is neither
  // «срочно» nor a date — it is a pile of its own (D-05: приёмка is a lane)
  if (task.status === "pending_review") return "review";
  // «Срочно» без срока — это «сейчас», а не «когда-нибудь»: место такой задачи сразу
  // под просроченными, а не в подвале списка (директор сказал «срочно», парсер времени
  // не услышал — docs/AI.md §10)
  if (!task.deadline) return task.priority === "high" ? "urgent" : "none";
  if (isOverdue(task, now)) return "overdue";
  const days = aqtobeDay(new Date(task.deadline)) - aqtobeDay(now);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

/** Inside a pile: the nearest deadline first, the undated by recency. */
export function compareTasks(a: Groupable, b: Groupable): number {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.deadline && !b.deadline) return -1;
  if (!a.deadline && b.deadline) return 1;
  return a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0;
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, "ru");
}

const NOBODY = "Без исполнителя";

export type GroupOptions = {
  /** The director's list: «На приёмке» is their own queue and stands near the top. */
  reviewFirst?: boolean;
};

export function groupTasks<T extends Groupable>(
  tasks: T[],
  by: GroupBy,
  now: Date = new Date(),
  { reviewFirst = false }: GroupOptions = {},
): TaskGroup<T>[] {
  const order = orderOf(reviewFirst);
  if (by === "none") {
    const all = [...tasks].sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));
    return all.length ? [{ key: "all", title: "", tasks: all }] : [];
  }

  if (by === "person") {
    const piles = new Map<string, T[]>();
    for (const task of tasks) {
      const name = task.assignee?.full_name ?? NOBODY;
      const pile = piles.get(name);
      if (pile) pile.push(task);
      else piles.set(name, [task]);
    }
    return [...piles.entries()]
      .sort(([a], [b]) => (a === NOBODY ? 1 : b === NOBODY ? -1 : byName(a, b)))
      .map(([name, pile]) => ({
        key: name,
        title: name,
        // inside a person: the same urgency order as the deadline view
        tasks: pile.sort((a, b) => {
          const byBucket = order.indexOf(bucketOf(a, now)) - order.indexOf(bucketOf(b, now));
          return byBucket !== 0 ? byBucket : compareTasks(a, b);
        }),
      }));
  }

  const piles = new Map<Bucket, T[]>();
  for (const task of tasks) {
    const bucket = bucketOf(task, now);
    const pile = piles.get(bucket);
    if (pile) pile.push(task);
    else piles.set(bucket, [task]);
  }
  return order.filter((bucket) => piles.has(bucket)).map((bucket) => ({
    key: bucket,
    title: BUCKET_TITLE[bucket],
    tasks: (piles.get(bucket) as T[]).sort(
      bucket === "closed"
        ? (a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0)
        : compareTasks,
    ),
  }));
}

/** The soonest deadline still ahead — the one fact worth putting under the title. */
export function nearestDeadline(tasks: Groupable[], now: Date = new Date()): string | null {
  let soonest: string | null = null;
  for (const task of tasks) {
    if (CLOSED.includes(task.status) || !task.deadline) continue;
    if (new Date(task.deadline).getTime() < now.getTime()) continue;
    if (!soonest || task.deadline < soonest) soonest = task.deadline;
  }
  return soonest;
}

/** How many of these are past their deadline right now. */
export function overdueCount(tasks: Groupable[], now: Date = new Date()): number {
  return tasks.filter((task) => isOverdue(task, now)).length;
}
