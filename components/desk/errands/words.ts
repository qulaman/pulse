import type { Tone } from "@/components/desk/ui/tone";
import { aqtobeDay } from "@/lib/errands/scene";
import { ERRAND_STATUS_WORD, isActive, type Errand, type ErrandStatus } from "@/lib/errands/queries";

/** «Кофе» → «кофе» inside a sentence. */
export const lower = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** A request's state in one word — the phone's `/secretary` words, from lib. */
export const STATUS_WORD = ERRAND_STATUS_WORD;

/** The ink of that word on the sheet (D-158): live — print, refused — the red pencil, the rest quiet. Nothing here is the director's move. */
export const STATUS_TONE: Record<ErrandStatus, Tone> = {
  sent: "ok",
  accepted: "ok",
  done: "muted",
  declined: "danger",
  cancelled: "muted",
};

/** Only who asked takes a request back, while it is alive — the rule of `transition_errand`. */
export function canCancel(errand: Pick<Errand, "status" | "author_id">, meId: string): boolean {
  return isActive(errand) && errand.author_id === meId;
}

/** The phone's words for it (D-101 §3): at an alarm the tap says what it means. */
export function cancelWord(errand: Pick<Errand, "urgent">): string {
  return errand.urgent ? "Ложная тревога" : "Отменить";
}

/** Asked today on the Aqtobe clock — «Сегодня закрыто», a «спасибо» still in place. */
export function today(iso: string | null, now: Date): boolean {
  return Boolean(iso) && aqtobeDay(new Date(iso as string)) === aqtobeDay(now);
}

/** «Спасибо ♥» for a request closed today and not thanked yet — behind the points switch, as on the phone (D-97). */
export function canThank(errand: Errand, now: Date, pointsOn: boolean): boolean {
  return pointsOn && errand.status === "done" && !errand.thanked_at && today(errand.done_at, now);
}
