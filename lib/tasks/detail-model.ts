import { handedInPartly, isWorking, lastNudgeAt, latestSuggestion, latestTimeRequest, WORKING, type Suggestion, type TimeRequest } from "./lifecycle";
import { REASON_TONE, REASON_WORD, reasonFor, statusWord } from "./overview";
import type { TaskMessage, TaskWithPeople } from "./query-core";
import type { DeskReason } from "./reasons";
import { isOverdue, reworkCommentOf, spokenOf, unreadWordOf, type TaskStatus } from "./status-text";
import { latestDeclineReason, latestOpenQuestion, messageFlags } from "./thread";
import { deadlineToneOf, toneOf, type Tone } from "./tone";

/** Work the assignee still holds: a word from the director on it waits for them (D-173). */
const IN_HAND: readonly TaskStatus[] = [...WORKING, "pending_review"];

/** A task whose deadline the director may still move: not handed in, not closed (D-187). */
const MOVABLE: readonly TaskStatus[] = ["scheduled", ...WORKING];

/** The newest deadline change the reader has not seen yet: the capsule rolls from `from` (D-187). */
function deadlineNewsOf(messages: readonly TaskMessage[] | undefined, readerId: string, seenSeq: number | null): { from: string | null } | null {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index]!;
    if (seenSeq !== null && message.seq <= seenSeq) return null;
    const meta = message.meta && typeof message.meta === "object" && !Array.isArray(message.meta) ? (message.meta as Record<string, unknown>) : {};
    if (message.type !== "system" || meta.deadline_changed !== true || message.sender_id === readerId) continue;
    return { from: typeof meta.old_deadline === "string" ? meta.old_deadline : null };
  }
  return null;
}

/** A question the employee asked and nobody has answered — their own words, waiting. */
function openQuestionOf(messages: readonly TaskMessage[] | undefined, senderId: string): string | null {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index]!;
    const flags = messageFlags(message);
    if (flags.isQuestion && !flags.answered && message.sender_id === senderId && message.content) return message.content;
  }
  return null;
}

export type TaskDetailModel = {
  isDirector: boolean;
  /** The assignee reading their own order: who and when are said once, at the top (D-173). */
  mine: boolean;
  /** The employee's open question — the director answers it on the screen. */
  question: string | null;
  declineReason: string | null;
  /** The reader's own question, still unanswered (not the director). */
  myQuestion: string | null;
  overdue: boolean;
  /** D-128: a request for time, a suggested colleague, «не всё», the last reminder — from the thread. */
  request: TimeRequest | null;
  suggestion: Suggestion | null;
  partial: boolean;
  nudgedAt: string | null;
  /** A recalled task that had been refused first keeps the refusal on its way (D-142). */
  declinedAt: string | null;
  /** The director's move on this task, if it waits for one. */
  reason: DeskReason | null;
  /** What to fix, in the director's words — the assignee's screen of a returned task. */
  reworkComment: string | null;
  /** The other side's word the reader has not seen yet (D-173); null while the cursor is asked for. */
  waiting: { message: TaskMessage; unread: boolean } | null;
  /** The stage as this reader needs it: the director's move by its name, else the state. */
  tone: Tone;
  word: string;
  /** History for this reader: «when» is the closing time, the alarm goes. */
  closed: boolean;
  /** Urgent and nobody named a time — the flag is all the «when» this task has. */
  urgentNow: boolean;
  deadlineTone: Tone;
  /**
   * What a tap on the deadline capsule does (D-187): the director moves it (`extend`, or `retime`
   * while the employee asks for time — the same sheet answers the request), the assignee asks for
   * more time on work in hand; null — the capsule only says.
   */
  deadlineMove: "extend" | "retime" | "ask" | null;
  /** The deadline moved since the assignee last read the task: the capsule rolls from the old one. */
  deadlineNews: { from: string | null } | null;
  /**
   * The people under the title, with no word for either (D-187): who gave the order when it was
   * not the reader, who does it when the reader is not the one doing it.
   */
  from: string | null;
  to: string | null;
  /** The director's words were spoken, not typed. */
  spoken: boolean;
  /** How many words, photos and recordings the conversation holds (not its status lines). */
  talk: number;
};

/**
 * Everything the task's own screen (D-87) derives from the task, its thread and the reader, in
 * one pure step, so the screen only draws it. `seenAtOpen` — the reader's read cursor as it stood
 * when the screen opened (`useSeenAtOpen`): `undefined` while it is still asked for.
 */
export function taskDetailModel(
  task: TaskWithPeople,
  messages: readonly TaskMessage[] | undefined,
  reader: { role: string; userId: string },
  now: Date,
  seenAtOpen: number | null | undefined,
): TaskDetailModel {
  const isDirector = reader.role === "director";
  // a manager opening a subordinate's task and the director keep «О задаче» whole
  const mine = !isDirector && task.assignee_id === reader.userId;
  const question = latestOpenQuestion(messages);
  const overdue = isOverdue(task, now);
  const request = isWorking(task.status) ? latestTimeRequest(messages) : null;
  const reason = isDirector ? reasonFor(task, question, now, Boolean(request)) : null;
  const closed = task.status === "done" || task.status === "revoked" || (!isDirector && task.status === "declined");
  const stage = reason && reason !== "question" ? reason : null;

  return {
    isDirector,
    mine,
    question,
    declineReason: latestDeclineReason(messages),
    myQuestion: isDirector ? null : openQuestionOf(messages, reader.userId),
    overdue,
    request,
    suggestion: task.status === "declined" ? latestSuggestion(messages) : null,
    partial: handedInPartly(task, messages),
    nudgedAt: lastNudgeAt(messages),
    declinedAt:
      task.status === "revoked"
        ? ([...(messages ?? [])].reverse().find((message) => messageFlags(message).declineReason)?.created_at ?? null)
        : null,
    reason,
    // D-173: what the reader has to read stands at the top, where the eye lands — the return's
    // reason in the director's words, and the other side's word they have not seen yet
    reworkComment: !isDirector && task.status === "rework" ? reworkCommentOf(messages) : null,
    // `undefined` — the cursor is still being asked for (a cold open): the word waits for it
    waiting: mine && IN_HAND.includes(task.status) && seenAtOpen !== undefined ? unreadWordOf(messages, reader.userId, seenAtOpen) : null,
    tone: stage ? REASON_TONE[stage] : toneOf(task.status, overdue),
    word: stage ? REASON_WORD[stage] : statusWord(task, isDirector ? "director" : "employee", now),
    closed,
    urgentNow: !task.deadline && task.priority === "high" && !closed,
    deadlineTone: deadlineToneOf(task, now),
    deadlineMove: isDirector
      ? MOVABLE.includes(task.status)
        ? request
          ? "retime"
          : "extend"
        : null
      : mine && task.deadline && isWorking(task.status) && !request
        ? "ask"
        : null,
    // `undefined` — the cursor is still asked for: no news until it is known
    deadlineNews: mine && seenAtOpen !== undefined && task.deadline && isWorking(task.status) ? deadlineNewsOf(messages, reader.userId, seenAtOpen) : null,
    from: task.author_id === reader.userId ? null : (task.author?.full_name ?? null),
    to: mine ? null : (task.assignee?.full_name ?? null),
    spoken: spokenOf(task),
    talk: (messages ?? []).filter((message) => message.type !== "status_change" && message.type !== "system").length,
  };
}
