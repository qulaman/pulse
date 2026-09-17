import { greeting, quoteTitle } from "./briefing";
import { hasUnread, whoOf, type BoardTask, type Lanes, type Phrase } from "./board";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The employee's side of the same board (D-62): what the face on Лента says and counts.
 * Pure, like the director's wording — the person is the assignee, the other voice in
 * the thread is the director's.
 */

/** What the person has to act on first — new orders to accept, orders sent back. */
export function isTodo(task: Pick<BoardTask, "status">): boolean {
  return task.status === "sent" || task.status === "rework";
}

/** «Дела»: everything the person has on their hands — to accept, to redo, in work. */
export function isOpenFor(task: Pick<BoardTask, "status">): boolean {
  return task.status === "sent" || task.status === "rework" || task.status === "accepted" || task.status === "in_progress";
}

const WORDS_MAX = 80;
function short(words: string): string {
  const clean = words.trim();
  return clean.length > WORDS_MAX ? `${clean.slice(0, WORDS_MAX - 1).trimEnd()}…` : clean;
}

/** The greeting and where things stand for the person: new orders, rework, the rest in work. */
export function employeeOpening(lanes: Lanes, now: Date, name: string): Phrase {
  const all = [...lanes.overdue, ...lanes.declined, ...lanes.question, ...lanes.review, ...lanes.work];
  const fresh = all.filter((task) => task.status === "sent").length;
  const rework = all.filter((task) => task.status === "rework").length;
  const inWork = all.filter((task) => task.status === "accepted" || task.status === "in_progress").length;
  const overdue = lanes.overdue.length;
  const hello = greeting(now, name);
  const parts: string[] = [];
  if (fresh > 0) parts.push(`${fresh} ${pluralRu(fresh, ["новая задача", "новые задачи", "новых задач"])}`);
  if (rework > 0) parts.push(`${rework} на доработке`);
  if (overdue > 0) parts.push(`${overdue} ${pluralRu(overdue, ["просрочена", "просрочены", "просрочено"])}`);
  if (parts.length === 0) {
    if (inWork === 0) return { text: `${hello} Дел нет, всё сделано.`, tone: "ok" };
    return { text: `${hello} ${inWork} ${pluralRu(inWork, ["задача", "задачи", "задач"])} в работе, нового нет.`, tone: "ok" };
  }
  return { text: `${hello} ${parts.join(", ")}.`, tone: overdue > 0 ? "danger" : "warn" };
}

/**
 * One phrase for one change, from the person's side: the director gave, took back,
 * accepted, sent back or wrote something. The person's own steps are not news to them.
 */
export function describeForEmployee(prev: BoardTask | undefined, next: BoardTask | undefined, meId: string): Phrase | null {
  if (!next) return null;
  const title = quoteTitle(next.title);
  if (!prev) {
    if (next.status === "sent") return { text: `Новая задача: ${title}`, tone: "warn" };
    return null;
  }
  if (next.status !== prev.status) {
    switch (next.status) {
      case "sent":
        return prev.status === "declined" ? { text: `Директор настаивает: ${title}`, tone: "warn" } : null;
      case "rework":
        return { text: `Директор вернул ${title} на доработку`, tone: "warn" };
      case "done":
        return { text: `Директор принял ${title}`, tone: "ok" };
      case "revoked":
        return { text: `Директор отозвал ${title}`, tone: "muted" };
      default:
        return null;
    }
  }
  if (next.deadline !== prev.deadline && next.deadline) return { text: `Срок ${title} перенесён`, tone: "muted" };
  if (hasUnread(next, meId) && next.last_message!.id !== prev.last_message?.id) {
    const last = next.last_message!;
    const words = last.type === "photo" ? "фото" : last.type === "voice" ? "голосовое" : (last.content ?? "");
    return { text: `Директор пишет по ${title}: «${short(words)}»`, tone: "warn" };
  }
  return null;
}

export function describeForEmployeeAll(prev: readonly BoardTask[], next: readonly BoardTask[], meId: string): Phrase[] {
  const before = new Map(prev.map((task) => [task.id, task]));
  const phrases: Phrase[] = [];
  for (const task of next) {
    const phrase = describeForEmployee(before.get(task.id), task, meId);
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

/** The director as the person sees them in a thread — for the messages card. */
export function otherSideOf(task: Pick<BoardTask, "author">): string {
  return whoOf({ assignee: task.author }) === "Без исполнителя" ? "Директор" : whoOf({ assignee: task.author });
}
