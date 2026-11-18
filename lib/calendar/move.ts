import { draftOf, endMs } from "./agenda";
import type { EventDraft } from "./mutations";
import type { CalendarEvent } from "./queries";

/** How long the write of a dragged meeting waits for «Отменить»: everyone in it gets «Перенос» (D-180). */
export const MOVE_HOLD_MS = 5000;

/**
 * The same meeting at another time (D-180, a drag on the desk week): its own draft (`draftOf` —
 * place, agenda, reminder, people or «все» as they are), only the time new. A meeting said without
 * its end keeps none: it still lasts the calendar's one hour.
 */
export function moveDraft(event: CalendarEvent, start: Date, end: Date): EventDraft {
  return { ...draftOf(event), starts_at: start.toISOString(), ends_at: event.ends_at ? end.toISOString() : null };
}

/** The meeting may be dragged: the author's own and not over yet. */
export function canMove(event: Pick<CalendarEvent, "author_id" | "starts_at" | "ends_at">, meId: string, now: Date): boolean {
  return Boolean(meId) && event.author_id === meId && endMs(event) > now.getTime();
}
