/**
 * Что говорят о визите телефоны директора и секретаря (D-96) — чистыми функциями, с
 * тестами: формулировки — часть продукта. Род не угадываем (docs/DESIGN.md): «Директор
 * просит подождать», а не «попросил»; «Посетитель ждёт» согласуется со словом, а не с
 * человеком. Визит бывает двух видов: посетитель у стола и сообщение секретаря на экран
 * (D-116) — у сообщения один ответ, «Понятно».
 */

import { tvTime } from "@/lib/tv/clock";

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

/** Кого директору ещё предстоит принять или отпустить: сначала без ответа, раньше пришедшие первыми. */
export function awaitingDirector<T extends VisitLike>(visits: readonly T[]): T[] {
  const open = visits.filter((v) => !isMessage(v) && !v.closed_at && (v.status === "waiting" || v.status === "wait"));
  return [
    ...open.filter((v) => v.status === "waiting").sort(oldestFirst),
    ...open.filter((v) => v.status === "wait").sort(oldestFirst),
  ];
}

/** Сообщения секретаря, которые директор ещё не отметил «Понятно»: по порядку, как писались. */
export function unreadMessages<T extends VisitLike>(visits: readonly T[]): T[] {
  return visits.filter((v) => isMessage(v) && !v.closed_at && v.status === "waiting").sort(oldestFirst);
}

/** Живые карточки секретаря — всё, что ещё не убрано, свежие сверху. */
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

/**
 * A live wall shows the words within a second or two of the secretary's tap (the kiosk acks the
 * version that carried them at once): fifteen seconds without it — the screen is off or offline (D-182).
 */
const SHOWN_WITHIN_MS = 15_000;

/**
 * Квитанция стены (принцип 8): надпись появилась на экране в кабинете — или ещё нет. С часами
 * (`now`) «ещё не показал» живёт 15 секунд, дальше — честное «Экран у директора не отвечает с
 * 9:14»: с той минуты, как секретарь отправила, а не вечное «отправлено» (D-182). Секретарь не
 * читает строку стены, поэтому «с» — время её отправки: с него экран точно молчит.
 */
export function wallLine(visit: VisitLike, now?: Date): string | null {
  if (visit.status !== "waiting" && visit.status !== "wait") return null;
  if (visit.shown_at) return "На экране у директора";
  const sent = new Date(visit.created_at);
  if (now && now.getTime() - sent.getTime() >= SHOWN_WITHIN_MS) return `Экран у директора не отвечает с ${tvTime(sent)}`;
  return "Отправлено, экран ещё не показал";
}

/**
 * Одна кнопка карточки: отменить, пока не решено (сообщение — пока не прочитано, и со стены
 * оно уходит тоже); «Готово», когда вошёл; «Понятно» — иначе.
 */
export function closeLabel(visit: VisitLike): string {
  if (visit.status === "waiting" || visit.status === "wait") return "Отменить";
  if (visit.status === "invited") return "Готово";
  return "Понятно";
}

/**
 * Недавние слова секретаря — чипами в шторке: тот же поставщик приходит не раз, то же
 * «Звонил Ахметов» пишется не раз. Посетители и сообщения — каждый своим списком.
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
