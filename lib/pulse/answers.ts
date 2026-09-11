import { humanAqtobe } from "@/lib/ai/time";
import { pluralRu, type TaskStatus } from "@/lib/tasks/status-text";
import { quoteTitle, type BriefTask } from "./briefing";

/**
 * Answers to the director's questions about tasks and people, straight from the
 * data — no model (the Claude assistant of stage 3 will take over the same slot).
 * Pure and unit-tested: a question, the facts, the lines the assistant says.
 * Names stay in the nominative; times are exact (docs/DESIGN.md §4).
 */

export type AnswerTask = BriefTask & { status: TaskStatus };

export type AnswerPerson = { id: string; fullName: string; aliases: string[] };

export type AnswerInput = {
  question: string;
  now: Date;
  people: AnswerPerson[];
  /** Tasks in work (sent / accepted / rework / in_progress) with their assignee. */
  open: AnswerTask[];
  overdue: BriefTask[];
  questions: BriefTask[];
  review: BriefTask[];
};

export type Answer = {
  lines: string[];
  /** false — the assistant could not read the question; the UI offers a way out. */
  understood: boolean;
};

const STATUS_WORD: Partial<Record<TaskStatus, string>> = {
  sent: "не открыта",
  accepted: "в работе",
  in_progress: "в работе",
  rework: "на доработке",
  pending_review: "на приёмке",
};

const NOT_UNDERSTOOD = "Пока отвечаю только про задачи и людей: кто чем занят, что там по делу, кто просрочил, что на приёмке. Спроси иначе или скажи задачу.";

function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** A Russian word matches its inflected form by its stem («марат» ~ «марату», «дина» ~ «дины»). */
function stem(word: string): string {
  return word.slice(0, Math.max(3, word.length - 2));
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function personOf(person: AnswerPerson): string {
  return firstName(person.fullName);
}

/** The person the question is about: a first name or an alias, inflected or not. */
export function findPerson(question: string, people: AnswerPerson[]): AnswerPerson | null {
  const words = norm(question).split(" ");
  for (const person of people) {
    const names = [firstName(person.fullName), ...person.aliases].map((n) => norm(n)).filter(Boolean);
    for (const name of names) {
      const s = stem(name);
      if (words.some((w) => w.startsWith(s) && Math.abs(w.length - name.length) <= 2)) return person;
    }
  }
  return null;
}

const STOP = new Set(["что", "там", "как", "дела", "где", "кто", "чем", "занят", "занята", "сейчас", "сегодня", "по", "с", "про", "насчет", "у", "нас", "все", "всё", "и", "а", "ли", "мне", "есть", "делает", "делают", "скажи", "покажи", "какие", "какой", "задачи", "задача", "задач", "статус", "дело", "делу"]);

/** Tasks whose title shares a meaningful word with the question («что там по Казхрому» → «КП по Казхрому»). */
export function findByTopic<T extends BriefTask>(question: string, tasks: T[]): T[] {
  const words = norm(question).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
  if (words.length === 0) return [];
  const stems = words.map(stem);
  return tasks.filter((task) => {
    const titleWords = norm(task.title).split(" ");
    return titleWords.some((tw) => stems.some((s) => tw.startsWith(s) || (tw.length >= 4 && s.startsWith(stem(tw)))));
  });
}

type LineOpts = { person?: boolean; status?: boolean; overdue?: boolean };

function taskLine(task: BriefTask & { status?: TaskStatus }, now: Date, opts: LineOpts = {}): string {
  const who = opts.person && task.assignee ? `${task.assignee}, ` : "";
  const status = opts.status && task.status ? STATUS_WORD[task.status] : undefined;
  const when = task.deadline ? humanAqtobe(new Date(task.deadline), now) : null;
  const due = !when ? "без срока" : opts.overdue ? `срок был ${when}` : `до ${when}`;
  const tail = [status, due].filter(Boolean).join(", ");
  return `${who}${quoteTitle(task.title)} — ${tail}`;
}

const TASKS_FORM: [string, string, string] = ["задача", "задачи", "задач"];

export function answer(input: AnswerInput): Answer {
  const { question, now } = input;
  const q = norm(question);

  // 1. overdue / who has not reported
  if (/просроч|не отчита|не сдал|опозда|горит|сорва/.test(q)) {
    if (input.overdue.length === 0) return { understood: true, lines: ["Просрочек нет. Все сроки пока держатся."] };
    const head = `Просрочено ${input.overdue.length}:`;
    return { understood: true, lines: [head, ...input.overdue.map((t) => taskLine(t, now, { person: true, overdue: true }))] };
  }

  // 2. review stack
  if (/приемк|проверк|сдал|сдали|готово|принять/.test(q)) {
    if (input.review.length === 0) return { understood: true, lines: ["На приёмке ничего нет."] };
    return {
      understood: true,
      lines: [`На приёмке ${input.review.length}:`, ...input.review.map((t) => taskLine(t, now, { person: true }))],
    };
  }

  // 3. open questions from employees
  if (/вопрос|спрашива/.test(q)) {
    if (input.questions.length === 0) return { understood: true, lines: ["Открытых вопросов от сотрудников нет."] };
    return {
      understood: true,
      lines: [`Ждут ответа ${input.questions.length}:`, ...input.questions.map((t) => taskLine(t, now, { person: true }))],
    };
  }

  // 4. a person
  const person = findPerson(question, input.people);
  if (person) {
    const name = personOf(person);
    const mine = input.open.filter((t) => t.assignee === name);
    const late = input.overdue.filter((t) => t.assignee === name);
    if (mine.length === 0) return { understood: true, lines: [`${name}: задач в работе нет.`] };
    const head = `${name}: ${mine.length} ${pluralRu(mine.length, TASKS_FORM)} в работе${late.length ? `, ${late.length} с просрочкой` : ""}:`;
    return { understood: true, lines: [head, ...mine.map((t) => taskLine(t, now, { status: true }))] };
  }

  // 5. a topic — a client, a document, a place
  const byTopic = findByTopic(question, input.open);
  if (byTopic.length > 0) {
    const head = byTopic.length === 1 ? "Нашёл одну задачу:" : `Нашёл ${byTopic.length}:`;
    return { understood: true, lines: [head, ...byTopic.map((t) => taskLine(t, now, { person: true, status: true }))] };
  }

  // 6. the general picture
  if (/сколько|в работе|что сегодня|что у нас|как дела|обстановк|что нового|итог|сводк|все ли|всё ли/.test(q)) {
    const parts: string[] = [];
    parts.push(`В работе ${input.open.length} ${pluralRu(input.open.length, TASKS_FORM)}.`);
    if (input.overdue.length) parts.push(`Просрочено ${input.overdue.length}.`);
    if (input.questions.length) parts.push(`Ждут ответа ${input.questions.length}.`);
    if (input.review.length) parts.push(`На приёмке ${input.review.length}.`);
    if (parts.length === 1) parts.push("Ничего не требует внимания.");
    return { understood: true, lines: [parts.join(" ")] };
  }

  return { understood: false, lines: [NOT_UNDERSTOOD] };
}
