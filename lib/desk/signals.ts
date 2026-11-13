import type { Errand } from "@/lib/errands/queries";
import { sceneOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { awaitingDirector, isMessage, statusLine, unreadMessages, type VisitLike } from "@/lib/visits/text";

/**
 * What reaches a person at the desk outside the tab (D-175): the browser tab's words, a dot on
 * its icon, a soft chime for something new and, for the secretary, the ring of «Охрана» until
 * somebody takes it. Pure functions here; the browser's side is DeskShell (title, icon, sound)
 * and lib/desk/chime.ts (the sound itself and the «Без звука» choice).
 */

export type SignalErrand = Pick<
  Errand,
  "id" | "kind" | "label" | "status" | "created_at" | "accepted_at" | "claimed_by" | "author_id" | "question" | "asked_at" | "answer" | "answered_at"
>;
export type SignalVisit = VisitLike & { author_id: string };

/** The icon's dot: nothing, something waits, the alarm. */
export type SignalDot = "none" | "wait" | "alarm";

export type DeskSignal = {
  /** The number in the tab: what waits for this person. */
  count: number;
  /** The words after it: the newest request, the alarm, an answer that has just come. */
  words: string | null;
  dot: SignalDot;
  /** Keys of what chimes once when it is new (a request's id, a visitor's id). */
  chime: string[];
  /** «Охрана» nobody has taken: the ring repeats until it is taken. */
  ringing: boolean;
};

/** An answer of the director stays in the tab this long (D-175): she may be in another program. */
export const ANSWER_FRESH_MS = 60_000;

const newestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);
const oldestFirst = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

const isSecurity = (errand: Pick<SignalErrand, "kind" | "label">, catalogue: readonly SecretaryAction[]) => sceneOf(errand, catalogue) === "security";

/**
 * The «Охрана» the desk alarm is about: one nobody has taken first (the oldest — it has waited
 * longest), then one taken and still open. A second alarm arriving while the first is in hand
 * must call again, so the untaken one wins.
 */
export function alarmOf<T extends SignalErrand>(errands: readonly T[], catalogue: readonly SecretaryAction[] = []): T | null {
  const open = errands.filter((e) => (e.status === "sent" || e.status === "accepted") && isSecurity(e, catalogue)).sort(oldestFirst);
  return open.find((e) => e.status === "sent") ?? open[0] ?? null;
}

/** Long words cut short: a tab shows about thirty letters. */
function clip(text: string, max = 40): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const fresh = (iso: string | null | undefined, now: Date) => {
  if (!iso) return false;
  const age = now.getTime() - new Date(iso).getTime();
  // a clock a few seconds ahead of the server still counts the answer as new
  return age < ANSWER_FRESH_MS && age > -10_000;
};

/**
 * The director's answer to this secretary that is less than a minute old: to her question on a
 * request she holds («Директор: да»), or to a visitor or a message she announced («Директор: пусть
 * заходит»). The newest one; null when there is none.
 */
export function freshAnswer(errands: readonly SignalErrand[], visits: readonly SignalVisit[], meId: string, now: Date): string | null {
  const answers: { at: string; words: string }[] = [];
  for (const e of errands) {
    if (e.claimed_by === meId && e.answer && fresh(e.answered_at, now)) answers.push({ at: e.answered_at as string, words: `Директор: ${clip(e.answer, 28)}` });
  }
  for (const v of visits) {
    if (v.author_id === meId && v.status !== "waiting" && v.status !== "expired" && fresh(v.answered_at, now)) answers.push({ at: v.answered_at as string, words: statusLine(v) });
  }
  answers.sort((a, b) => b.at.localeCompare(a.at));
  return answers[0]?.words ?? null;
}

/**
 * The secretary's signal: the requests nobody has taken (the same count as «Заявки» in the
 * navigation), the newest one's name — or «Охрана!» while it waits — and for a minute the
 * director's answer to her. A new request chimes once; «Охрана» rings instead of chiming.
 */
export function secretarySignal({
  meId,
  errands,
  visits,
  now,
  catalogue = [],
}: {
  meId: string;
  errands: readonly SignalErrand[];
  visits: readonly SignalVisit[];
  now: Date;
  catalogue?: readonly SecretaryAction[];
}): DeskSignal {
  const sent = errands.filter((e) => e.status === "sent").sort(newestFirst);
  const alarm = alarmOf(errands, catalogue);
  const ringing = alarm?.status === "sent";
  const answer = freshAnswer(errands, visits, meId, now);
  const words = ringing ? "Охрана!" : (answer ?? (sent[0] ? clip(sent[0].label) : null));
  return {
    count: sent.length,
    words,
    dot: ringing ? "alarm" : sent.length > 0 || answer ? "wait" : "none",
    chime: sent.filter((e) => !isSecurity(e, catalogue)).map((e) => `e:${e.id}`),
    ringing,
  };
}

/**
 * The director's signal: the number the tab always showed (decisions, visitors, open requests —
 * the navigation's counts, `count`), the dot while it is above zero; with the sound on, a chime
 * for a visitor or a message at the door and for the secretary's question on his request.
 */
export function directorSignal({
  meId,
  count,
  errands,
  visits,
}: {
  meId: string;
  count: number;
  errands: readonly SignalErrand[];
  visits: readonly SignalVisit[];
}): DeskSignal {
  const door = [...awaitingDirector(visits).filter((v) => v.status === "waiting"), ...unreadMessages(visits)];
  const asked = errands.filter((e) => e.author_id === meId && e.status === "accepted" && e.question && e.asked_at && !e.answered_at);
  return {
    count,
    words: null,
    dot: count > 0 ? "wait" : "none",
    chime: [...door.map((v) => `v:${v.id}`), ...asked.map((e) => `q:${e.id}:${e.asked_at}`)],
    ringing: false,
  };
}

/** «(1) Кофе — Pulse», «(3) Pulse», «Директор: да — Pulse», «Pulse». */
export function tabTitle({ count, words }: Pick<DeskSignal, "count" | "words">): string {
  const number = count > 0 ? `(${count > 99 ? "99+" : count}) ` : "";
  return words ? `${number}${words} — Pulse` : `${number}Pulse`;
}

/** The keys that were not there before: each chimes once. */
export function newKeys(seen: ReadonlySet<string>, keys: readonly string[]): string[] {
  return keys.filter((key) => !seen.has(key));
}

// ---- the sound ----------------------------------------------------------------------------

/** Per browser (D-175): «on» / «off»; nothing chosen — on for the secretary, off for the director. */
export const SOUND_KEY = "pulse.desk.sound";

export function parseSound(value: string | null | undefined, role: "director" | "secretary"): boolean {
  if (value === "on") return true;
  if (value === "off") return false;
  return role === "secretary";
}

// ---- the desk alarm's words ----------------------------------------------------------------

/**
 * The guard's number as it is read off a screen and dialled by hand: a Kazakh mobile or city
 * number of eleven digits — «+7 701 555 12 34»; anything else (a short internal number) as typed.
 */
export function guardPhone(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (/^[78]\d{10}$/.test(digits) && /^(\+7|7|8)/.test(text.replace(/[\s()-]/g, ""))) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return text;
}

/** «1:12», «12:05», «1:02:40» — a timer of the alarm, from a moment to now. */
export function clock(fromIso: string, now: Date): string {
  const total = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** «30 с назад», «2 мин назад» — as the phone's alarm says it. */
export function agoLine(fromIso: string, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 1000));
  return s < 60 ? `${s} с назад` : `${Math.floor(s / 60)} мин назад`;
}

/**
 * What waits behind the alarm, so the secretary knows what she comes back to: «После тревоги:
 * ждут ещё 2 · у вас 2 · в приёмной 1». Nothing behind it — null.
 */
export function afterAlarm({
  errands,
  visits,
  meId,
  alarmId,
}: {
  errands: readonly SignalErrand[];
  visits: readonly SignalVisit[];
  meId: string;
  alarmId: string;
}): string | null {
  const waiting = errands.filter((e) => e.status === "sent" && e.id !== alarmId).length;
  const mine = errands.filter((e) => e.status === "accepted" && e.claimed_by === meId && e.id !== alarmId).length;
  const lobby = visits.filter((v) => !isMessage(v) && !v.closed_at && (v.status === "waiting" || v.status === "wait" || v.status === "invited")).length;
  const parts = [waiting ? `ждут ещё ${waiting}` : "", mine ? `у вас ${mine}` : "", lobby ? `в приёмной ${lobby}` : ""].filter(Boolean);
  return parts.length ? `После тревоги: ${parts.join(" · ")}` : null;
}
