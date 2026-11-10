/**
 * The desk's home (D-164): the phone's balls on «Сегодня» — «Сообщения», «Эфир», «Рейтинг» and
 * the secretary's desk — read as rows of the sheet. Pure: the same board, feed, rating and
 * requests the phone reads, sorted and worded here, so the blocks only draw.
 */
import { humanAqtobe } from "@/lib/ai/time";
import { atLine, untilLine } from "@/lib/errands/scene";
import { hasMessage, isOnBoard, messageOf, type BoardTask } from "@/lib/pulse/board";

/* -------------------------------------------------------------------------- */
/* Time in the margin                                                          */
/* -------------------------------------------------------------------------- */

/** When a row happened, in one short word: «09:14» today, «вчера», «21.10» further back. */
export function shortWhen(at: Date, now: Date): string {
  const words = humanAqtobe(at, now);
  if (words.startsWith("сегодня ")) return words.slice("сегодня ".length);
  if (words.startsWith("вчера ")) return "вчера";
  return words.split(" ")[0] ?? words;
}

/* -------------------------------------------------------------------------- */
/* «Сообщения»                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What a task carries for the director, as the phone's «Сообщения» ball counts it (`hasMessage`):
 * an open question, a request for time, an unread word.
 */
export type MessageKind = "question" | "request" | "word";

export type HomeMessage = {
  task: BoardTask;
  kind: MessageKind;
  /** the words themselves — the question, «просит срок до …», the last message */
  text: string;
  /** when it was said, ISO */
  at: string;
  /** who said it, the full name as the roster has it; "" when the board does not know */
  who: string;
};

/** The word over a row: what kind of message it is. */
export const MESSAGE_KIND_WORD: Record<MessageKind, string> = {
  question: "вопрос",
  request: "срок",
  word: "сообщение",
};

/** Questions first — they wait for an answer; then requests for time; then plain words. */
const KIND_RANK: Record<MessageKind, number> = { question: 0, request: 1, word: 2 };

/** The name behind an id of the thread: the one who does the task, or the one who gave it. */
function nameIn(task: BoardTask, id: string | null | undefined): string {
  if (id && id === task.author_id) return task.author?.full_name ?? "";
  return task.assignee?.full_name ?? "";
}

/**
 * The phone's «Сообщения»: every task on the board with a word for the reader, questions first,
 * the newest first inside each kind. The reader's own words never count (`hasMessage`).
 */
export function messagesOf(board: readonly BoardTask[], meId: string, now: Date): HomeMessage[] {
  const list: HomeMessage[] = [];
  for (const task of board) {
    if (!isOnBoard(task.status) || !hasMessage(task, meId)) continue;
    const request = task.time_request && task.time_request.senderId !== meId ? task.time_request : null;
    if (task.question) {
      list.push({ task, kind: "question", text: task.question, at: task.question_at ?? task.updated_at, who: nameIn(task, task.assignee_id) });
    } else if (request) {
      list.push({ task, kind: "request", text: messageOf(task, meId, now) ?? "", at: request.at, who: nameIn(task, request.senderId) });
    } else {
      const last = task.last_message;
      list.push({ task, kind: "word", text: messageOf(task, meId, now) ?? "", at: last?.created_at ?? task.updated_at, who: nameIn(task, last?.sender_id) });
    }
  }
  return list.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.at.localeCompare(a.at));
}

/** «Прочитал все» (D-142) takes only plain words: a question or a request for time is the director's move. */
export function plainWords(messages: readonly HomeMessage[]): HomeMessage[] {
  return messages.filter((message) => message.kind === "word");
}

/* -------------------------------------------------------------------------- */
/* «Эфир»                                                                      */
/* -------------------------------------------------------------------------- */

type Dated = { id: string; created_at: string };

export type EtherLine<A extends Dated, E extends Dated> =
  | { kind: "announcement"; item: A; at: string; /** the moment its pushes go, while it waits for the window */ until: string | null }
  | { kind: "news"; item: E; at: string };

/**
 * The phone's Эфир in a few rows: what still waits for the delivery window first (the soonest
 * to go first), then announcements and good news together, the newest first — the feed mixes
 * the two by time (D-133).
 */
export function etherLinesOf<A extends Dated, E extends Dated>(
  announcements: readonly A[],
  news: readonly E[],
  held: Readonly<Record<string, string>> | undefined,
  now: Date,
  limit: number,
): EtherLine<A, E>[] {
  const waiting: { item: A; until: string }[] = [];
  const rest: EtherLine<A, E>[] = [];
  for (const item of announcements) {
    const until = held?.[item.id];
    if (until && new Date(until) > now) waiting.push({ item, until });
    else rest.push({ kind: "announcement", item, at: item.created_at, until: null });
  }
  for (const item of news) rest.push({ kind: "news", item, at: item.created_at });
  waiting.sort((a, b) => a.until.localeCompare(b.until));
  rest.sort((a, b) => b.at.localeCompare(a.at));
  const first: EtherLine<A, E>[] = waiting.map(({ item, until }) => ({ kind: "announcement", item, at: item.created_at, until }));
  return [...first, ...rest].slice(0, Math.max(0, limit));
}

/** A line of good news in words: a reward from the shop, or the director's praise with its points. */
export function newsWords(event: { kind: "merch" | "praise"; title: string; amount: number | null }): { what: string; points: number | null } {
  if (event.kind === "merch") return { what: `награда из магазина «${event.title}»`, points: null };
  return { what: event.title, points: event.amount && event.amount > 0 ? event.amount : null };
}

/* -------------------------------------------------------------------------- */
/* «Рейтинг»                                                                   */
/* -------------------------------------------------------------------------- */

/** The week's five, as the phone's ball shows them: nobody with nothing earned. */
export function topOf<R extends { points: number; rank: number }>(rows: readonly R[], count = 5): R[] {
  return rows
    .filter((row) => row.points > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count);
}

/* -------------------------------------------------------------------------- */
/* The secretary's desk                                                        */
/* -------------------------------------------------------------------------- */

type ErrandLike = {
  id: string;
  author_id: string;
  status: string;
  created_at: string;
  question: string | null;
  answer: string | null;
};

/** The secretary asked and waits for the director's word (D-99). */
export function asksDirector(errand: Pick<ErrandLike, "status" | "question" | "answer">): boolean {
  return Boolean(errand.question && !errand.answer) && (errand.status === "sent" || errand.status === "accepted");
}

/**
 * The director's own requests still alive: what the secretary asks about first, then what nobody
 * has taken, then what is in hand — the oldest first inside each.
 */
export function myErrandsOf<T extends ErrandLike>(rows: readonly T[], meId: string): T[] {
  const rank = (errand: T) => (asksDirector(errand) ? 0 : errand.status === "sent" ? 1 : 2);
  return rows
    .filter((errand) => errand.author_id === meId && (errand.status === "sent" || errand.status === "accepted"))
    .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
}

/** How long «Отменить» holds a request on the desk before it goes (D-158: a request is taken back within 5 s). */
export const GRACE_MS = 5_000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The toast of a request held for its five seconds: «Кофе · без сахара · отправлю через 5 с».
 * A request in the director's own words is its words alone; who is away comes after (D-106).
 */
export function graceLine(label: string, note: string | null, absence: string | null = null, dueAt: string | null = null, now: Date = new Date()): string {
  const words = note?.trim() ?? "";
  const head = !words ? label : words.toLowerCase().startsWith(label.toLowerCase()) ? clip(words, 48) : `${label} · ${clip(words, 32)}`;
  return `${head}${dueAt ? ` · ${atLine(dueAt, now)}` : ""} · отправлю через ${Math.round(GRACE_MS / 1000)} с${absence ? ` · ${absence}` : ""}`;
}

/** A request in the director's own words (D-99): the label is its first words, the words go whole. */
export function freeAction(words: string): { code: "free"; label: string; icon: string } {
  return { code: "free", label: words.trim().split(/\s+/).slice(0, 5).join(" ").slice(0, 40), icon: "" };
}

/** The spans of «Не беспокоить» (D-99), the phone's three. */
export const DND_SPANS = [
  { label: "На 30 минут", min: 30 },
  { label: "На час", min: 60 },
  { label: "На 2 часа", min: 120 },
] as const;

export type DndChoice = { key: string; label: string; untilMin: number; note: string | null };

/** What «Не беспокоить» offers: the three spans and, while a meeting is on, its end (at least five minutes ahead). */
export function dndChoices(meetingEndsAt: string | null, now: Date): DndChoice[] {
  const choices: DndChoice[] = DND_SPANS.map((span) => ({ key: String(span.min), label: span.label, untilMin: span.min, note: null }));
  if (meetingEndsAt) {
    const left = Math.ceil((new Date(meetingEndsAt).getTime() - now.getTime()) / 60_000);
    if (left >= 5) choices.push({ key: "meeting", label: `До конца встречи, ${untilLine(meetingEndsAt)}`, untilMin: left, note: "на встречу" });
  }
  return choices;
}

/** The meeting going on now, as the phone finds it for «не беспокоить до конца встречи»: its end, ISO; a meeting with no end lasts an hour. */
export function meetingEndOf(events: readonly { starts_at: string; ends_at: string | null; cancelled_at: string | null }[], now: Date): string | null {
  const at = now.getTime();
  for (const event of events) {
    if (event.cancelled_at) continue;
    const start = new Date(event.starts_at).getTime();
    const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 60 * 60_000;
    if (start <= at && at < end) return new Date(end).toISOString();
  }
  return null;
}
