import type { Tone } from "@/components/desk/ui/tone";
import { aqtobeDay } from "@/lib/errands/scene";
import { ERRAND_STATUS_WORD, type Errand, type ErrandStatus } from "@/lib/errands/queries";

/** A request's state in one word — the phone's `/secretary` words, from lib. */
export const STATUS_WORD = ERRAND_STATUS_WORD;

/** The colour of that word on the desk: waiting — accent, taken — ok, refused — danger. */
export const STATUS_TONE: Record<ErrandStatus, Tone> = {
  sent: "accent",
  accepted: "ok",
  done: "muted",
  declined: "danger",
  cancelled: "muted",
};

/** Asked today on the Aqtobe clock — «Сегодня закрыто», a «спасибо» still in place. */
export function today(iso: string | null, now: Date): boolean {
  return Boolean(iso) && aqtobeDay(new Date(iso as string)) === aqtobeDay(now);
}

/** «Спасибо ♥» for a request closed today and not thanked yet — behind the points switch, as on the phone (D-97). */
export function canThank(errand: Errand, now: Date, pointsOn: boolean): boolean {
  return pointsOn && errand.status === "done" && !errand.thanked_at && today(errand.done_at, now);
}
