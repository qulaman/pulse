import { humanAqtobe } from "@/lib/ai/time";
import { nowHm } from "@/lib/datetime/calendar";
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
  /** false — handed out and not accepted yet: it is not «в работе» (absent — taken). */
  taken?: boolean;
};

const TITLE_MAX = 36;

export function greeting(now: Date, name: string): string {
  // the hour on the Aqtobe wall clock
  const hour = Number(nowHm(now).slice(0, 2));
  const word = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : "Добрый вечер";
  return name ? `${word}, ${name}.` : `${word}.`;
}

/** Long titles are cut at a word, not mid-word («…в магазин…», never «…в магази…»). */
export function quoteTitle(title: string): string {
  // quotes inside quotes are „лапки“: «Планёрка по объекту „Береке“», not «…«Береке»»
  const clean = title.trim().replace(/«/g, "„").replace(/»/g, "“");
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

/**
 * «Пока тихо…» — said only when nothing needs the director (`attentionOf` is ok). An order nobody has
 * taken yet is not «в работе»: it is counted as «ещё не принята», so the line never calls untaken
 * work taken.
 */
export function quietLine(open: BriefTask[], now: Date): string {
  if (open.length === 0) return "Пока тихо. Задач в работе нет.";
  const untaken = open.filter((task) => task.taken === false).length;
  const taken = open.length - untaken;
  const parts: string[] = [];
  if (taken > 0) parts.push(`${taken} ${pluralRu(taken, ["задача", "задачи", "задач"])} в работе`);
  if (untaken > 0) {
    parts.push(
      taken > 0
        ? `${untaken} ещё ${pluralRu(untaken, ["не принята", "не приняты", "не приняты"])}`
        : `${untaken} ${pluralRu(untaken, ["задача", "задачи", "задач"])} ещё ${pluralRu(untaken, ["не принята", "не приняты", "не приняты"])}`,
    );
  }
  const count = parts.join(", ");
  const nearest = nearestOf(open);
  if (!nearest) return `Пока тихо. ${count}, все без срока.`;
  // names stay in the nominative: the assistant never declines a person's name
  const who = nearest.assignee ? `${nearest.assignee}, ` : "";
  const when = humanAqtobe(new Date(nearest.deadline as string), now);
  return `Пока тихо. ${count}, ближайший срок ${when} (${who}${quoteTitle(nearest.title)}).`;
}
