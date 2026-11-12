import { isOver, myStatus } from "@/lib/calendar/agenda";
import { isRunning } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";

/**
 * What a meeting is to this person right now — the one word the grid, the month, the list and the
 * card colour it by (D-174): over; on now; waiting for this person's answer; refused by them; ahead.
 * On now wins over an answer still owed: the meeting is happening, the question is moot.
 */
export type MeetingState = "over" | "running" | "owes" | "declined" | "ahead";

export function meetingState(event: CalendarEvent, meId: string, now: Date): MeetingState {
  if (isOver(event, now)) return "over";
  if (isRunning(event, now)) return "running";
  if (event.author_id === meId) return "ahead";
  const mine = myStatus(event, meId);
  if (mine === "invited") return "owes";
  if (mine === "declined") return "declined";
  return "ahead";
}

/** How the answers stand: who comes, who does not, who has not said — the author counts as coming. */
export function answersOf(event: CalendarEvent): { going: number; declined: number; waiting: number; total: number } {
  let going = 0;
  let declined = 0;
  for (const person of event.participants) {
    if (person.status === "going" || person.user_id === event.author_id) going += 1;
    else if (person.status === "declined") declined += 1;
  }
  const total = event.participants.length;
  return { going, declined, waiting: total - going - declined, total };
}
