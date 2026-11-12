import { isOver, myStatus } from "./agenda";
import type { CalendarEvent } from "./queries";

/**
 * Invitations that still owe this person an answer (D-167): the «Календарь» of Ленты answers
 * them in place, and the greeting names them. One rule for both, and the same one the sheet
 * of a meeting answers by (`EventDetails`): a participant who is not the author, of a meeting
 * that is neither cancelled nor over — a meeting already running can still be answered.
 *
 * A meeting of a series (D-148) counts like any other: its people are written `invited`
 * without a notice, and the row already says «нужен ответ» to them.
 */
export function awaitsMyAnswer(event: CalendarEvent, meId: string, now: Date): boolean {
  if (!meId || event.author_id === meId || event.cancelled_at) return false;
  if (isOver(event, now)) return false;
  return myStatus(event, meId) === "invited";
}

/** Every invitation waiting for my «Буду / Не смогу», the nearest first. */
export function pendingInvites(events: readonly CalendarEvent[], meId: string, now: Date): CalendarEvent[] {
  return events
    .filter((event) => awaitsMyAnswer(event, meId, now))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}
