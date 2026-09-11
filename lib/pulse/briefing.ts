import { humanAqtobe } from "@/lib/ai/time";
import { pluralRu, verdict } from "@/lib/tasks/status-text";

/**
 * The assistant's briefing on Пульс: facts of the company turned into the lines
 * «Капля» says when the director opens the app. Pure: no fetching, no clock of its
 * own, so every wording is unit-tested. Tone of voice — docs/DESIGN.md §4: first
 * person, facts with exact times, no exclamation marks, no judgement of people.
 */

export type BriefTask = {
  id: string;
  title: string;
  deadline: string | null;
  /** First name of the assignee as the director calls them; null when unassigned. */
  assignee: string | null;
};

export type DeclinedBriefTask = BriefTask & { reason: string | null };
export type QuestionBriefTask = BriefTask & { question?: string | null };

export type BriefingInput = {
  now: Date;
  /** Director's first name for the greeting. */
  directorName: string;
  overdue: BriefTask[];
  /** «Не могу» with the reason — the director decides, so it comes right after the overdue. */
  declined?: DeclinedBriefTask[];
  questions: QuestionBriefTask[];
  review: BriefTask[];
  /** Tasks accepted since the previous visit — good news, told last. */
  accepted: { task: BriefTask; at: string }[];
  /** Everything still in work, for the quiet line. */
  open: BriefTask[];
};

export type BriefTone = "danger" | "warn" | "ok" | "muted";

export type BriefLine = {
  id: string;
  kind: "greeting" | "verdict" | "fact" | "more" | "quiet" | "director" | "answer";
  text: string;
  tone?: BriefTone;
  /** Shown at once, not typed — the director's own words. */
  instant?: boolean;
  /** Tasks behind the line — the bubble expands into their cards. */
  taskIds?: string[];
};

/** Facts the briefing reads out before it folds the rest into «и ещё N». */
export const MAX_FACTS = 5;
const TITLE_MAX = 36;

export function greeting(now: Date, name: string): string {
  const hour = (now.getUTCHours() + 5) % 24; // Asia/Aqtobe, UTC+5, no DST
  const word = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : "Добрый вечер";
  return name ? `${word}, ${name}.` : `${word}.`;
}

export function quoteTitle(title: string): string {
  const clean = title.trim();
  const short = clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
  return `«${short}»`;
}

function groupByPerson<T extends BriefTask>(tasks: T[]): { person: string; tasks: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = task.assignee ?? "";
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  return [...groups.entries()].map(([person, list]) => ({ person, tasks: list }));
}

const TASKS: [string, string, string] = ["задачу", "задачи", "задач"];

function overdueLine(person: string, tasks: BriefTask[], now: Date): string {
  const who = person || "Без исполнителя";
  if (tasks.length === 1) {
    const task = tasks[0]!;
    const when = task.deadline ? `, срок был ${humanAqtobe(new Date(task.deadline), now)}` : "";
    return `${who} просрочил ${quoteTitle(task.title)}${when}`;
  }
  return `${who} просрочил ${tasks.length} ${pluralRu(tasks.length, TASKS)}`;
}

/** «занят срочным» reads better than «Занят срочным» mid-sentence; free text keeps its case beyond the first letter. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function declinedLine(person: string, tasks: DeclinedBriefTask[]): string {
  const who = person || "Кто-то";
  if (tasks.length === 1) {
    const task = tasks[0]!;
    const reason = task.reason ? `: ${lowerFirst(task.reason.trim())}` : "";
    return `${who} не может ${quoteTitle(task.title)}${reason}`;
  }
  return `${who} не может ${tasks.length} ${pluralRu(tasks.length, TASKS)}`;
}

const QUESTION_MAX = 80;

function questionLine(person: string, tasks: QuestionBriefTask[]): string {
  const who = person || "Кто-то";
  if (tasks.length === 1) {
    const task = tasks[0]!;
    const words = task.question?.trim();
    const quoted = words ? `: «${words.length > QUESTION_MAX ? `${words.slice(0, QUESTION_MAX - 1).trimEnd()}…` : words}»` : "";
    return `${who} спрашивает по ${quoteTitle(task.title)}${quoted}`;
  }
  return `${who} задал ${tasks.length} ${pluralRu(tasks.length, ["вопрос", "вопроса", "вопросов"])}`;
}

function reviewLine(person: string, tasks: BriefTask[]): string {
  const who = person || "Кто-то";
  if (tasks.length === 1) return `${who} сдал ${quoteTitle(tasks[0]!.title)}, ждёт приёмки`;
  return `${who} сдал ${tasks.length} ${pluralRu(tasks.length, TASKS)}, ждут приёмки`;
}

function acceptedLine(person: string, items: { task: BriefTask; at: string }[], now: Date): string {
  const who = person || "Кто-то";
  if (items.length === 1) {
    const { task, at } = items[0]!;
    return `${who} принял ${quoteTitle(task.title)} ${humanAqtobe(new Date(at), now)}`;
  }
  return `${who} принял ${items.length} ${pluralRu(items.length, TASKS)}`;
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

/** The whole briefing, top to bottom, in the D-05 order: overdue → questions → review, then news. */
export function buildBriefing(input: BriefingInput): BriefLine[] {
  const { now } = input;
  const lines: BriefLine[] = [{ id: "greeting", kind: "greeting", text: greeting(now, input.directorName) }];

  const facts: BriefLine[] = [];
  for (const group of groupByPerson(input.overdue)) {
    facts.push({
      id: `overdue:${group.person}`,
      kind: "fact",
      tone: "danger",
      text: overdueLine(group.person, group.tasks, now),
      taskIds: group.tasks.map((t) => t.id),
    });
  }
  for (const group of groupByPerson(input.declined ?? [])) {
    facts.push({
      id: `declined:${group.person}`,
      kind: "fact",
      tone: "warn",
      text: declinedLine(group.person, group.tasks),
      taskIds: group.tasks.map((t) => t.id),
    });
  }
  for (const group of groupByPerson(input.questions)) {
    facts.push({
      id: `question:${group.person}`,
      kind: "fact",
      tone: "warn",
      text: questionLine(group.person, group.tasks),
      taskIds: group.tasks.map((t) => t.id),
    });
  }
  for (const group of groupByPerson(input.review)) {
    facts.push({
      id: `review:${group.person}`,
      kind: "fact",
      tone: "ok",
      text: reviewLine(group.person, group.tasks),
      taskIds: group.tasks.map((t) => t.id),
    });
  }

  const news: BriefLine[] = [];
  const byPerson = new Map<string, { task: BriefTask; at: string }[]>();
  for (const item of input.accepted) {
    const key = item.task.assignee ?? "";
    const list = byPerson.get(key);
    if (list) list.push(item);
    else byPerson.set(key, [item]);
  }
  for (const [person, items] of byPerson) {
    news.push({
      id: `accepted:${person}`,
      kind: "fact",
      tone: "muted",
      text: acceptedLine(person, items, now),
      taskIds: items.map((i) => i.task.id),
    });
  }

  const counts = {
    overdue: input.overdue.length,
    declined: input.declined?.length ?? 0,
    questions: input.questions.length,
    review: input.review.length,
  };
  if (facts.length > 0) {
    const line = verdict(counts);
    lines.push({ id: "verdict", kind: "verdict", tone: line.tone, text: `${line.text}. По порядку:` });
  } else {
    lines.push({ id: "quiet", kind: "quiet", tone: "ok", text: quietLine(input.open, now) });
  }

  const all = [...facts, ...news];
  const shown = all.slice(0, MAX_FACTS);
  lines.push(...shown);
  const hidden = all.length - shown.length;
  if (hidden > 0) {
    lines.push({
      id: "more",
      kind: "more",
      tone: "muted",
      text: `И ещё ${hidden} — в «Задачах»`,
      taskIds: all.slice(MAX_FACTS).flatMap((line) => line.taskIds ?? []),
    });
  }
  return lines;
}
