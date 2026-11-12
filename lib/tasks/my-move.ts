/**
 * The orders waiting for the employee's move (D-173): a new one to take («Принял»), one returned
 * for rework, one in work past its deadline. One rule for every number that says «дела ждут вас»
 * — the «Дела» tab badge, the app icon badge and the «Дела» ball on Лента — so they never disagree.
 */
export const MY_MOVE_STATUSES = ["sent", "rework"] as const;

/** The same rule as a PostgREST `or` filter, for a count read (`.or(myMoveFilter(now))`). */
export function myMoveFilter(now: Date): string {
  return `status.in.(${MY_MOVE_STATUSES.join(",")}),and(status.eq.accepted,deadline.lt.${now.toISOString()})`;
}

/** The same rule on a row already in hand. */
export function awaitsMyMove(task: { status: string; deadline: string | null }, now: Date): boolean {
  if ((MY_MOVE_STATUSES as readonly string[]).includes(task.status)) return true;
  return task.status === "accepted" && task.deadline !== null && new Date(task.deadline).getTime() < now.getTime();
}
