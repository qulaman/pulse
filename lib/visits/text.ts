/**
 * Что говорят о визите телефоны директора и секретаря (D-96) — чистыми функциями, с
 * тестами: формулировки — часть продукта. Род не угадываем (docs/DESIGN.md): «Директор
 * просит подождать», а не «попросил»; «Посетитель ждёт» согласуется со словом, а не с
 * человеком.
 */

export type VisitLike = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
  answered_at: string | null;
  shown_at: string | null;
  closed_at: string | null;
};

const newestFirst = (a: VisitLike, b: VisitLike) => b.created_at.localeCompare(a.created_at);
const oldestFirst = (a: VisitLike, b: VisitLike) => a.created_at.localeCompare(b.created_at);

/** Кого директору ещё предстоит принять или отпустить: сначала без ответа, раньше пришедшие первыми. */
export function awaitingDirector<T extends VisitLike>(visits: readonly T[]): T[] {
  const open = visits.filter((v) => !v.closed_at && (v.status === "waiting" || v.status === "wait"));
  return [
    ...open.filter((v) => v.status === "waiting").sort(oldestFirst),
    ...open.filter((v) => v.status === "wait").sort(oldestFirst),
  ];
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

export function statusLine(visit: VisitLike): string {
  return STATUS_LINE[visit.status] ?? STATUS_LINE.waiting;
}

export type VisitTone = "accent" | "warn" | "ok" | "muted";

export function statusTone(visit: VisitLike): VisitTone {
  if (visit.status === "invited") return "ok";
  if (visit.status === "wait") return "warn";
  if (visit.status === "waiting") return "accent";
  return "muted";
}

/** Квитанция стены (принцип 8): надпись появилась на экране в кабинете — или ещё нет. */
export function wallLine(visit: VisitLike): string | null {
  if (visit.status !== "waiting" && visit.status !== "wait") return null;
  return visit.shown_at ? "На экране у директора" : "Отправлено, экран ещё не показал";
}

/** Одна кнопка карточки: отменить, пока не решено; «Готово», когда вошёл; «Понятно» — иначе. */
export function closeLabel(visit: VisitLike): string {
  if (visit.status === "waiting" || visit.status === "wait") return "Отменить";
  if (visit.status === "invited") return "Готово";
  return "Понятно";
}

/** Недавние слова секретаря — чипами в шторке: тот же поставщик приходит не раз. */
export function recentNotes(visits: readonly VisitLike[], limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const visit of [...visits].sort(newestFirst)) {
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
