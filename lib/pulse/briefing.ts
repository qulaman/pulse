import { humanAqtobe } from "@/lib/ai/time";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The assistant's wording on Пульс: the greeting, the quiet line, the way a title is
 * quoted. Pure: no fetching, no clock of its own, so every wording is unit-tested.
 * Tone of voice — docs/DESIGN.md §4: first person, facts with exact times, no
 * exclamation marks, no judgement of people. The live board (./board.ts) says what
 * changed with these same pieces.
 */

export type BriefTask = {
  id: string;
  title: string;
  deadline: string | null;
  /** First name of the assignee as the director calls them; null when unassigned. */
  assignee: string | null;
  /** The assignee's id — two people with the same first name are still two people. */
  assigneeId?: string | null;
};

const TITLE_MAX = 36;

export function greeting(now: Date, name: string): string {
  const hour = (now.getUTCHours() + 5) % 24; // Asia/Aqtobe, UTC+5, no DST
  const word = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : "Добрый вечер";
  return name ? `${word}, ${name}.` : `${word}.`;
}

/** Long titles are cut at a word, not mid-word («…в магазин…», never «…в магази…»). */
export function quoteTitle(title: string): string {
  const clean = title.trim();
  if (clean.length <= TITLE_MAX) return `«${clean}»`;
  const head = clean.slice(0, TITLE_MAX - 1).trimEnd();
  // a head that ends on punctuation already ends on a whole item («…, договориться,»);
  // otherwise step back to the last space — even a whole short word there reads as cut off
  const atWord = /[,;:.!?—-]$/.test(head) ? -1 : head.lastIndexOf(" ");
  const cut = atWord >= Math.floor(TITLE_MAX / 2) ? head.slice(0, atWord) : head;
  return `«${cut.replace(/[\s,;:—-]+$/, "")}…»`;
}

function nearestOf(open: BriefTask[]): BriefTask | null {
  let best: BriefTask | null = null;
  for (const task of open) {
    if (!task.deadline) continue;
    if (!best || task.deadline < (best.deadline as string)) best = task;
  }
  return best;
}

export function quietLine(open: BriefTask[], now: Date): string {
  if (open.length === 0) return "Пока тихо. Задач в работе нет.";
  const count = `${open.length} ${pluralRu(open.length, ["задача", "задачи", "задач"])} в работе`;
  const nearest = nearestOf(open);
  if (!nearest) return `Пока тихо. ${count}, все без срока.`;
  // names stay in the nominative: the assistant never declines a person's name
  const who = nearest.assignee ? `${nearest.assignee}, ` : "";
  const when = humanAqtobe(new Date(nearest.deadline as string), now);
  return `Пока тихо. ${count}, ближайший срок ${when} (${who}${quoteTitle(nearest.title)}).`;
}
