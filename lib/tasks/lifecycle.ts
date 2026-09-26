import { humanAqtobe, toAqtobeIso } from "@/lib/ai/time";
import type { Json } from "@/lib/supabase/types";

import type { TaskStatus } from "./status-text";

/**
 * The life of a task between the director and the employee (D-129): the employee proposes in
 * one tap, the director decides in one tap, and no new status is born for it. A proposal is a
 * message with a flag, as «Уточнить» is (D-03): `time_request` asks for another deadline, a
 * refusal may carry `suggest_assignee_id`, a reminder is a `nudge` line, a report may be
 * `partial`, and a reassigned task knows `passed_to`. Pure rules — the cards, the task's
 * screen and the board read the same words from here.
 */

/** Work still in the employee's hands — the only states where a request for time makes sense. */
export const WORKING: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

export function isWorking(status: TaskStatus): boolean {
  return WORKING.includes(status);
}

export function metaOf(meta: Json | null | undefined): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/* -------------------------------------------------------------------------- */
/* «Нужно больше времени»                                                      */
/* -------------------------------------------------------------------------- */

/** An open request of the employee: the date asked for, their words, when they asked. */
export type TimeRequest = { id: string; proposed: string; words: string | null; at: string; senderId: string | null };

type MessageLike = { id: string; meta: Json; created_at: string; sender_id?: string | null; content?: string | null };

/** This message asks for time and nobody has answered it yet. */
export function isOpenTimeRequest(meta: Json): boolean {
  const record = metaOf(meta);
  return record.time_request === true && !record.answered_at && typeof record.proposed_deadline === "string";
}

export function timeRequestOf(message: MessageLike): TimeRequest | null {
  if (!isOpenTimeRequest(message.meta)) return null;
  const record = metaOf(message.meta);
  return {
    id: message.id,
    proposed: record.proposed_deadline as string,
    words: text(record.words),
    at: message.created_at,
    senderId: message.sender_id ?? null,
  };
}

/** The newest request still waiting, from any list of messages (a thread, the board's notes). */
export function latestTimeRequest(messages: readonly MessageLike[] | undefined): TimeRequest | null {
  let best: TimeRequest | null = null;
  for (const message of messages ?? []) {
    const request = timeRequestOf(message);
    if (request && (!best || request.at > best.at)) best = request;
  }
  return best;
}

/** How a request was answered — the thread labels its row with it. */
export type TimeAnswer = "approved" | "kept" | "changed" | "replaced" | "closed";

export function timeAnswerOf(meta: Json): TimeAnswer | null {
  const answer = metaOf(meta).answer;
  return answer === "approved" || answer === "kept" || answer === "changed" || answer === "replaced" || answer === "closed" ? answer : null;
}

export const TIME_ANSWER_WORD: Record<TimeAnswer, string> = {
  approved: "согласовано",
  kept: "срок прежний",
  changed: "директор назначил другой",
  replaced: "заменена новой",
  closed: "закрыта",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OFFSET = 5 * HOUR; // Asia/Aqtobe, +05:00 all year
const QUARTER = 15 * MINUTE;

/** An instant `shift` days after the Aqtobe day of `base`, at hh:mm on its wall clock. */
function atWall(base: number, shift: number, hours: number, minutes: number): number {
  const dayStart = Math.floor((base + OFFSET) / DAY) * DAY;
  return dayStart + shift * DAY + hours * HOUR + minutes * MINUTE - OFFSET;
}

export type TimeChoice = { iso: string; label: string };

/**
 * The deadlines an employee can ask for in one tap: an hour past the current one (or past now,
 * when it is already behind), the end of that day, the next morning, the next evening — in
 * that order, each later than the last, three at most. What is left is «Другое время».
 */
export function timeChoices(now: Date, deadline: string | null): TimeChoice[] {
  const current = deadline ? new Date(deadline).getTime() : Number.NaN;
  const base = Number.isFinite(current) ? Math.max(now.getTime(), current) : now.getTime();
  const floor = base + 30 * MINUTE;
  const candidates = [
    Math.ceil((base + HOUR) / QUARTER) * QUARTER,
    atWall(base, 0, 18, 0),
    atWall(base, 1, 10, 0),
    atWall(base, 1, 18, 0),
  ];
  const picked: number[] = [];
  for (const at of candidates) {
    if (at < floor) continue;
    if (picked.length > 0 && at <= picked[picked.length - 1]!) continue;
    picked.push(at);
    if (picked.length === 3) break;
  }
  return picked.map((at) => ({ iso: toAqtobeIso(new Date(at)), label: humanAqtobe(new Date(at), now) }));
}

/** «до 19:00» today, «до завтра 10:00», «до пт 10:00», «до 27.09 10:00» — how a person says it. */
export function untilWords(iso: string, now: Date = new Date()): string {
  const human = humanAqtobe(new Date(iso), now);
  return `до ${human.startsWith("сегодня ") ? human.slice("сегодня ".length) : human}`;
}

/** The sheet's send button: on a new task the request is «возьму, но к …», in work — a request. */
export function requestButtonLabel(status: TaskStatus, iso: string, now: Date = new Date()): string {
  return status === "sent" ? `Возьму · срок ${untilWords(iso, now)}` : `Попросить срок ${untilWords(iso, now)}`;
}

/** The receipt of the request, in the assistant's voice. */
export function requestToast(status: TaskStatus, iso: string, now: Date = new Date()): string {
  return status === "sent"
    ? `Принято · попросил срок ${untilWords(iso, now)}`
    : `Попросил срок ${untilWords(iso, now)} · директор ответит`;
}

/* -------------------------------------------------------------------------- */
/* «Это к другому», «Напомнить», «сделано не всё», «передана»                  */
/* -------------------------------------------------------------------------- */

/** The colleague an employee suggested with their refusal. */
export type Suggestion = { id: string; name: string };

export function suggestionOf(meta: Json): Suggestion | null {
  const record = metaOf(meta);
  if (record.decline_reason !== true) return null;
  const id = text(record.suggest_assignee_id);
  const name = text(record.suggest_name);
  return id && name ? { id, name } : null;
}

/** The newest refusal's suggestion, if the newest refusal has one. */
export function latestSuggestion(messages: readonly MessageLike[] | undefined): Suggestion | null {
  let newest: MessageLike | null = null;
  for (const message of messages ?? []) {
    if (metaOf(message.meta).decline_reason !== true) continue;
    if (!newest || message.created_at > newest.created_at) newest = message;
  }
  return newest ? suggestionOf(newest.meta) : null;
}

export function isNudge(meta: Json): boolean {
  return metaOf(meta).nudge === true;
}

/** When the director last reminded — for «напомнили в 11:20» and the half-hour rule. */
export function lastNudgeAt(messages: readonly MessageLike[] | undefined): string | null {
  let last: string | null = null;
  for (const message of messages ?? []) {
    if (isNudge(message.meta) && (!last || message.created_at > last)) last = message.created_at;
  }
  return last;
}

/** The server takes one reminder per half hour; the button says so before it is pressed. */
export const NUDGE_EVERY_MS = 30 * MINUTE;

export function canNudgeAgain(lastAt: string | null, now: Date = new Date()): boolean {
  return !lastAt || now.getTime() - new Date(lastAt).getTime() >= NUDGE_EVERY_MS;
}

/** A report handed in as «сделано не всё». */
export function isPartialReport(meta: Json): boolean {
  const record = metaOf(meta);
  return record.report === true && record.partial === true;
}

/**
 * The handed-in work is partial: the newest report of the current handover says so. A report
 * of an earlier round (before a rework) does not count — only one at or after `completed_at`.
 */
export function handedInPartly(
  task: { status: TaskStatus; completed_at: string | null },
  messages: readonly MessageLike[] | undefined,
): boolean {
  if (task.status !== "pending_review" || !task.completed_at) return false;
  const since = new Date(task.completed_at).getTime();
  return (messages ?? []).some((message) => isPartialReport(message.meta) && new Date(message.created_at).getTime() >= since);
}

/** «Передана · Ерлан» — the old holder's and the director's word for a reassigned task. */
export function passedWord(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Передана · ${first}` : "Передана";
}

/** A reassign keeps the deadline unless it is behind or less than an hour away — then it asks. */
export function reassignNeedsDeadline(deadline: string | null, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() - now.getTime() < HOUR;
}

/** The chips of «Не смогу сделать» — nobody types on a building site in the cold. */
export const CANT_REASONS = ["Нет материалов", "Нет доступа", "Занят срочным", "Не получается"] as const;

/** The words of «Это не ко мне» on the refusal row. */
export const NOT_MINE = "Это не ко мне";
