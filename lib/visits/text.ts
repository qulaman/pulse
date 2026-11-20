/**
 * What the director's and the secretary's phones say about a visit (D-96) — as pure functions, with
 * tests: the wording is part of the product. Gender is never guessed (docs/DESIGN.md): «Директор
 * просит подождать», not «попросил»; «Посетитель ждёт» agrees with the word, not with the
 * person. A visit is of two kinds: a visitor at the desk and the secretary's message on the screen
 * (D-116) — a message has one answer, «Понятно».
 */

export type VisitLike = {
  id: string;
  /** `visitor` | `message` (D-116). */
  kind: string;
  status: string;
  note: string | null;
  created_at: string;
  answered_at: string | null;
  shown_at: string | null;
  closed_at: string | null;
};

const newestFirst = (a: VisitLike, b: VisitLike) => b.created_at.localeCompare(a.created_at);
const oldestFirst = (a: VisitLike, b: VisitLike) => a.created_at.localeCompare(b.created_at);

export const isMessage = (visit: Pick<VisitLike, "kind">) => visit.kind === "message";

/** Whom the director still has to let in or send away: the unanswered first, the earlier arrivals first. */
export function awaitingDirector<T extends VisitLike>(visits: readonly T[]): T[] {
  const open = visits.filter((v) => !isMessage(v) && !v.closed_at && (v.status === "waiting" || v.status === "wait"));
  return [
    ...open.filter((v) => v.status === "waiting").sort(oldestFirst),
    ...open.filter((v) => v.status === "wait").sort(oldestFirst),
  ];
}

/** The secretary's messages the director has not marked «Понятно» yet: in order, as they were written. */
export function unreadMessages<T extends VisitLike>(visits: readonly T[]): T[] {
  return visits.filter((v) => isMessage(v) && !v.closed_at && v.status === "waiting").sort(oldestFirst);
}

/** The secretary's live cards — everything not put away yet, the fresh ones on top. */
export function reception<T extends VisitLike>(visits: readonly T[]): T[] {
  return visits.filter((v) => !v.closed_at).sort(newestFirst);
}

const STATUS_LINE: Record<string, string> = {
  waiting: "Ждём ответа директора",
  wait: "Директор просит подождать",
  invited: "Директор: пусть заходит",
  declined: "Директор не примет",
  expired: "Директор не ответил",
};

const MESSAGE_LINE: Record<string, string> = {
  waiting: "Ждём, пока директор прочитает",
  read: "Директор прочитал",
  expired: "Директор не прочитал",
};

export function statusLine(visit: VisitLike): string {
  if (isMessage(visit)) return MESSAGE_LINE[visit.status] ?? MESSAGE_LINE.waiting;
  return STATUS_LINE[visit.status] ?? STATUS_LINE.waiting;
}

export type VisitTone = "accent" | "warn" | "ok" | "muted";

export function statusTone(visit: VisitLike): VisitTone {
  if (visit.status === "invited" || visit.status === "read") return "ok";
  if (visit.status === "wait") return "warn";
  if (visit.status === "waiting") return "accent";
  return "muted";
}

/** The wall's receipt (principle 8): the words appeared on the screen in the office — or not yet. */
export function wallLine(visit: VisitLike): string | null {
  if (visit.status !== "waiting" && visit.status !== "wait") return null;
  return visit.shown_at ? "На экране у директора" : "Отправлено, экран ещё не показал";
}

/**
 * The card's one button: cancel while undecided (a message — while unread, and it leaves the wall
 * too); «Готово» once the visitor is in; «Понятно» otherwise.
 */
export function closeLabel(visit: VisitLike): string {
  if (visit.status === "waiting" || visit.status === "wait") return "Отменить";
  if (visit.status === "invited") return "Готово";
  return "Понятно";
}

/**
 * The secretary's recent words — as chips in the sheet: the same supplier comes more than once, the same
 * «Звонил Ахметов» is written more than once. Visitors and messages — each in its own list.
 */
export function recentNotes(visits: readonly VisitLike[], kind: "visitor" | "message" = "visitor", limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const visit of [...visits].sort(newestFirst)) {
    if (isMessage(visit) !== (kind === "message")) continue;
    const note = visit.note?.trim();
    if (!note) continue;
    const key = note.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
    if (out.length === limit) break;
  }
  return out;
}

/** «только что», «3 мин», «1 ч 5 мин». */
export function waitedSince(fromIso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}
