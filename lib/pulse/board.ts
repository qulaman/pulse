import { humanAqtobe } from "@/lib/ai/time";
import type { Json } from "@/lib/supabase/types";
import type { TaskMessageRow, TaskRow, TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, pluralRu, verdict, type TaskStatus } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { greeting, quietLine, quoteTitle, type BriefTask } from "./briefing";

/**
 * The live board of Пульс: every task that is in work or waits for the director,
 * as one row per task, sorted into lanes by what it needs. Pure — no fetching, no
 * clock of its own — so lanes, event patches and the assistant's phrases are all
 * unit-tested. The state lives on the board; the assistant only says what changed.
 */

export type BoardTask = TaskWithPeople & {
  /** The employee's newest unanswered question — null when there is none. */
  question: string | null;
  /** The message that holds the question, so its «answered» update can close it. */
  question_id: string | null;
  question_at: string | null;
  /** The reason behind «Не могу», when the employee gave one. */
  decline_reason: string | null;
  /** The newest message of the thread that is not a status line — who wrote it and what. */
  last_message: BoardMessage | null;
  /** The reader's own read cursor on the thread (D-61): messages above it are unread. */
  seen_seq: number;
};

/** One row of the embedded message list the board query fetches next to each task. */
export type BoardNote = { id: string; content: string | null; meta: Json; created_at: string };

/** The last real message of a thread, as the board keeps it. */
export type BoardMessage = { id: string; content: string | null; type: string; sender_id: string; seq: number; created_at: string };

/** Messages that are part of the conversation — the status lines and system notes are not. */
export const CHAT_TYPES: readonly string[] = ["text", "voice", "photo"];

export type Lane = "overdue" | "declined" | "question" | "review" | "work";

/** D-05 order: the director reads the lanes top to bottom. */
export const LANE_ORDER: readonly Lane[] = ["overdue", "declined", "question", "review", "work"];

/** Lanes that need the director; «work» is the calm rest of the board. */
export const ATTENTION_LANES: ReadonlySet<Lane> = new Set<Lane>(["overdue", "declined", "question", "review"]);

/** Statuses that keep a task on the board. Closed ones (done / revoked) leave it. */
export const BOARD_STATUSES: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework", "pending_review", "declined"];

/** Still being worked on — the quiet line and the answers count these. */
export const WORK_STATUSES: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

export type Lanes = Record<Lane, BoardTask[]>;

export type LaneCounts = Record<Lane, number> & { attention: number };

export function isOnBoard(status: TaskStatus): boolean {
  return BOARD_STATUSES.includes(status);
}

function metaOf(meta: Json): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

function isOpenQuestion(meta: Json): boolean {
  const record = metaOf(meta);
  return record.is_question === true && !record.answered_at;
}

function isQuestionNote(meta: Json): boolean {
  return metaOf(meta).is_question === true;
}

function isDeclineNote(meta: Json): boolean {
  return metaOf(meta).decline_reason === true;
}

/**
 * The fetched shape (task + its question/decline notes, newest first) becomes a board
 * row: the newest open question, the newest reason. Called once per row per fetch.
 */
export function toBoardTask(task: TaskWithPeople, notes: BoardNote[], last: BoardMessage | null = null, seenSeq = 0): BoardTask {
  const sorted = [...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const question = sorted.find((note) => isOpenQuestion(note.meta) && note.content);
  const reason = sorted.find((note) => isDeclineNote(note.meta) && note.content);
  return {
    ...task,
    question: question?.content ?? null,
    question_id: question?.id ?? null,
    question_at: question?.created_at ?? null,
    decline_reason: reason?.content ?? null,
    last_message: last,
    seen_seq: seenSeq,
  };
}

/**
 * A word of the thread the reader has not seen: the last real message is somebody
 * else's and sits above their cursor. Whoever reads the board asks for themselves —
 * the director, the manager who also writes in the thread, the employee on Лента.
 * One's own last word is never unread, and a status line is not a word at all.
 */
export function hasUnread(task: Pick<BoardTask, "last_message" | "seen_seq">, meId: string): boolean {
  const last = task.last_message;
  return Boolean(last && CHAT_TYPES.includes(last.type) && last.sender_id !== meId && last.seq > task.seen_seq);
}

/** The task carries a message for the reader: an open question, or an unread one. */
export function hasMessage(task: BoardTask, meId: string): boolean {
  return Boolean(task.question) || hasUnread(task, meId);
}

/** What the card shows as the message: the open question first, else the unread words. */
export function messageOf(task: BoardTask, meId: string): string | null {
  if (task.question) return task.question;
  if (!hasUnread(task, meId)) return null;
  const last = task.last_message!;
  if (last.type === "photo") return last.content ? `фото: ${last.content}` : "фото";
  if (last.type === "voice") return last.content ? `голосовое: ${last.content}` : "голосовое";
  return last.content ?? "";
}

/** Where a task sits; null once it has left the board. First match wins, in D-05 order. */
export function laneOf(task: BoardTask, now: Date, meId: string): Lane | null {
  if (!isOnBoard(task.status)) return null;
  if (isOverdue(task, now)) return "overdue";
  if (task.status === "declined") return "declined";
  if (hasMessage(task, meId)) return "question";
  if (task.status === "pending_review") return "review";
  return "work";
}

function urgency(task: BoardTask, now: Date): number {
  if (isOverdue(task, now)) return 0;
  return task.deadline ? 1 : 2;
}

/** Within a lane: overdue first, then the nearest deadline, undated last, newest first. */
export function compareUrgency(a: BoardTask, b: BoardTask, now: Date): number {
  const rank = urgency(a, now) - urgency(b, now);
  if (rank !== 0) return rank;
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

export function emptyLanes(): Lanes {
  return { overdue: [], declined: [], question: [], review: [], work: [] };
}

export function lanesOf(rows: readonly BoardTask[], now: Date, meId: string): Lanes {
  const lanes = emptyLanes();
  for (const task of rows) {
    const lane = laneOf(task, now, meId);
    if (lane) lanes[lane].push(task);
  }
  for (const lane of LANE_ORDER) lanes[lane].sort((a, b) => compareUrgency(a, b, now));
  return lanes;
}

export function countsOf(lanes: Lanes): LaneCounts {
  const counts = {
    overdue: lanes.overdue.length,
    declined: lanes.declined.length,
    question: lanes.question.length,
    review: lanes.review.length,
    work: lanes.work.length,
  };
  return { ...counts, attention: counts.overdue + counts.declined + counts.question + counts.review };
}

/* -------------------------------------------------------------------------- */
/* Patching the board from Realtime payloads — no refetch on the hot path      */
/* -------------------------------------------------------------------------- */

/** Columns a task event may change on a row that is already on the board. */
const PATCHABLE = [
  "status",
  "deadline",
  "title",
  "body",
  "priority",
  "accepted_at",
  "completed_at",
  "closed_at",
  "updated_at",
] as const satisfies readonly (keyof TaskRow)[];

/**
 * A `tasks` row arrived over the socket. Known row: patch it in place (a closed task
 * keeps its row with the closed status so the tile can say goodbye — the caller prunes
 * it). Unknown row, or a new assignee: the joined names are not in the payload, so the
 * answer is «refetch». Unknown and already closed: nothing to do.
 */
export function applyTaskChange(board: readonly BoardTask[], row: Partial<TaskRow> & { id: string }): BoardTask[] | "refetch" | null {
  const index = board.findIndex((task) => task.id === row.id);
  if (index === -1) {
    if (row.status && !isOnBoard(row.status)) return null;
    return "refetch";
  }
  const current = board[index]!;
  if (row.assignee_id && row.assignee_id !== current.assignee_id) return "refetch";
  let changed = false;
  const next: BoardTask = { ...current };
  for (const key of PATCHABLE) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value === undefined || value === current[key]) continue;
    (next as Record<string, unknown>)[key] = value;
    changed = true;
  }
  // a declined task that is sent again («Настоять») starts clean
  if (changed && next.status !== "declined" && current.status === "declined") next.decline_reason = null;
  if (!changed) return null;
  const copy = [...board];
  copy[index] = next;
  return copy;
}

/** The director has seen the thread up to `seq` (a reply, «Прочитал», the thread opened). */
export function applyRead(board: readonly BoardTask[], taskId: string, seq: number): BoardTask[] | null {
  const index = board.findIndex((task) => task.id === taskId);
  if (index === -1 || board[index]!.seen_seq >= seq) return null;
  const copy = [...board];
  copy[index] = { ...board[index]!, seen_seq: seq };
  return copy;
}

/** A closed row was announced and its goodbye is over: drop it. */
export function withoutTask(board: readonly BoardTask[], taskId: string): BoardTask[] {
  return board.filter((task) => task.id !== taskId);
}

/**
 * A `task_messages` row arrived: a question opens (insert), closes (its answered_at
 * update) or a decline reason lands. Rows of tasks not on the board are ignored.
 */
export function applyMessage(
  board: readonly BoardTask[],
  message: Pick<TaskMessageRow, "id" | "task_id" | "content" | "meta" | "created_at"> & Partial<Pick<TaskMessageRow, "type" | "sender_id" | "seq">>,
  meId: string,
): BoardTask[] | null {
  const index = board.findIndex((task) => task.id === message.task_id);
  if (index === -1) return null;
  const current = board[index]!;
  let next: BoardTask | null = null;

  // any real message becomes the thread's last word; my own word also moves my cursor
  if (message.type && CHAT_TYPES.includes(message.type) && message.sender_id && typeof message.seq === "number") {
    if (!current.last_message || message.seq > current.last_message.seq) {
      const last: BoardMessage = { id: message.id, content: message.content, type: message.type, sender_id: message.sender_id, seq: message.seq, created_at: message.created_at };
      next = { ...current, last_message: last, seen_seq: message.sender_id === meId ? Math.max(current.seen_seq, message.seq) : current.seen_seq };
    }
  }
  const base = next ?? current;

  if (isQuestionNote(message.meta)) {
    if (isOpenQuestion(message.meta) && message.content) {
      // the newest open question wins; the same one again is not a change
      if (current.question_id === message.id) return next ? withRow(board, index, next) : null;
      if (current.question_at && current.question_at > message.created_at) return next ? withRow(board, index, next) : null;
      next = { ...base, question: message.content, question_id: message.id, question_at: message.created_at };
    } else if (current.question_id === message.id) {
      next = { ...base, question: null, question_id: null, question_at: null };
    }
  } else if (isDeclineNote(message.meta) && message.content && message.content !== current.decline_reason) {
    next = { ...base, decline_reason: message.content };
  }

  if (!next) return null;
  return withRow(board, index, next);
}

function withRow(board: readonly BoardTask[], index: number, row: BoardTask): BoardTask[] {
  const copy = [...board];
  copy[index] = row;
  return copy;
}

/* -------------------------------------------------------------------------- */
/* What the assistant says                                                     */
/* -------------------------------------------------------------------------- */

export type SpeechTone = "danger" | "warn" | "ok" | "muted";

/** `source` marks a phrase that is not about a task — a tap on it opens no thread. */
export type Phrase = { text: string; tone: SpeechTone; source?: "ether" | "calendar" };

/** The assignee as the director calls them — first name, nominative, never declined. */
export function whoOf(task: Pick<BoardTask, "assignee">): string {
  return firstNameOf(task.assignee?.full_name) || "Без исполнителя";
}

const QUESTION_MAX = 80;

function shortQuestion(words: string): string {
  const clean = words.trim();
  return clean.length > QUESTION_MAX ? `${clean.slice(0, QUESTION_MAX - 1).trimEnd()}…` : clean;
}

/** «занят срочным» reads better than «Занят срочным» mid-sentence. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * One phrase for one change of one task — the assistant comments on what just
 * happened, the tile shows the state. Every verb agrees with «задача», never with
 * the person («задача сдана», not «Марат сдал»): names give no gender.
 */
export function describeChange(prev: BoardTask | undefined, next: BoardTask | undefined, now: Date, meId: string): Phrase | null {
  if (!prev && !next) return null;
  if (!prev && next) {
    if (!isOnBoard(next.status)) return null;
    return { text: `${whoOf(next)}: новая задача ${quoteTitle(next.title)}`, tone: "muted" };
  }
  if (prev && !next) return null; // pruned after its goodbye — the goodbye was said on the status change
  const before = prev!;
  const after = next!;
  const who = whoOf(after);
  const title = quoteTitle(after.title);

  if (after.status !== before.status) {
    switch (after.status) {
      case "accepted":
      case "in_progress":
        return { text: `${who}: задача ${title} принята в работу`, tone: "muted" };
      case "pending_review":
        return { text: `${who}: задача ${title} сдана, ждёт приёмки`, tone: "ok" };
      case "declined": {
        const reason = after.decline_reason ? `: ${lowerFirst(after.decline_reason.trim())}` : "";
        return { text: `${who} не может ${title}${reason}`, tone: "warn" };
      }
      case "done":
        return { text: `Принято: ${title}`, tone: "ok" };
      case "rework":
        return { text: `${who}: задача ${title} на доработке`, tone: "warn" };
      case "revoked":
        return { text: `Задача ${title} отозвана`, tone: "muted" };
      case "sent":
        return before.status === "declined"
          ? { text: `${who}: задача ${title} отправлена снова`, tone: "muted" }
          : { text: `${who}: новая задача ${title}`, tone: "muted" };
      default:
        return null;
    }
  }
  if (after.status === "declined" && after.decline_reason && after.decline_reason !== before.decline_reason) {
    return { text: `${who} не может ${title}: ${lowerFirst(after.decline_reason.trim())}`, tone: "warn" };
  }
  if (after.question && after.question_id !== before.question_id) {
    return { text: `${who} спрашивает по ${title}: «${shortQuestion(after.question)}»`, tone: "warn" };
  }
  if (!after.question && before.question) {
    return { text: `${who}: вопрос по ${title} закрыт`, tone: "muted" };
  }
  if (hasUnread(after, meId) && after.last_message!.id !== before.last_message?.id && after.last_message!.id !== after.question_id) {
    const words = messageOf(after, meId) ?? "";
    return { text: `${who} пишет по ${title}: «${shortQuestion(words)}»`, tone: "warn" };
  }
  if (after.deadline !== before.deadline) {
    const when = after.deadline ? `до ${humanAqtobe(new Date(after.deadline), now)}` : "без срока";
    return { text: `${who}: задача ${title} ${when}`, tone: "muted" };
  }
  if (after.assignee_id !== before.assignee_id) {
    return { text: `Задача ${title} передана: ${who}`, tone: "muted" };
  }
  return null;
}

/** Every change between two boards, in board order — the last one is what the assistant says. */
export function describeChanges(prev: readonly BoardTask[], next: readonly BoardTask[], now: Date, meId: string): Phrase[] {
  const before = new Map(prev.map((task) => [task.id, task]));
  const phrases: Phrase[] = [];
  for (const task of next) {
    const phrase = describeChange(before.get(task.id), task, now, meId);
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

export function toBriefTask(task: BoardTask): BriefTask {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline,
    assignee: task.assignee?.full_name ? firstNameOf(task.assignee.full_name) : null,
    assigneeId: task.assignee_id,
  };
}

/**
 * What the assistant says on opening (and on a tap on its face): the greeting and
 * where things stand — the verdict when something needs the director, the quiet line
 * with what is in work otherwise.
 */
export function openingLine(lanes: Lanes, now: Date, directorName: string): Phrase {
  const counts = countsOf(lanes);
  const hello = greeting(now, directorName);
  if (counts.attention === 0) {
    const open = [...lanes.work].map(toBriefTask);
    return { text: `${hello} ${quietLine(open, now)}`, tone: "ok" };
  }
  const line = verdict({ overdue: counts.overdue, declined: counts.declined, questions: counts.question, review: counts.review });
  return { text: `${hello} ${line.text}.`, tone: line.tone };
}

/** A title quoted the assistant's way — for sheets and toasts of the deck. */
export const quoteTitleOf = quoteTitle;

/** The short lane word on a tile, lower case, in the SHORT_STATUS voice. */
export const LANE_WORD: Record<Lane, string> = {
  overdue: "просрочена",
  declined: "отказ",
  question: "сообщение",
  review: "на приёмке",
  work: "в работе",
};

/** «В работе · 6 задач» — the collapsed row of the calm lane. */
export function workRowLabel(count: number): string {
  return `В работе · ${count} ${pluralRu(count, ["задача", "задачи", "задач"])}`;
}
