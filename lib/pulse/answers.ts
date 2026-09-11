import { humanAqtobe } from "@/lib/ai/time";
import { pluralRu, type TaskStatus } from "@/lib/tasks/status-text";
import { quoteTitle, type BriefTask } from "./briefing";

/**
 * Answers to the director's questions about tasks and people, straight from the
 * data — no model (the Claude assistant of stage 3 will take over the same slot).
 * Pure and unit-tested: a question, the facts, the lines the assistant says.
 * Names stay in the nominative; times are exact (docs/DESIGN.md §4).
 */

export type AnswerTask = BriefTask & { status: TaskStatus; closedAt?: string | null };

export type AnswerPerson = { id: string; fullName: string; aliases: string[] };

export type AnswerInput = {
  question: string;
  now: Date;
  people: AnswerPerson[];
  /** Tasks in work (sent / accepted / rework / in_progress) with their assignee. */
  open: AnswerTask[];
  /** Closed ones (done / declined / revoked), newest first — «что там по …» about a finished job. */
  closed?: AnswerTask[];
  overdue: BriefTask[];
  /** «Не могу» with reasons, when the caller has them. */
  declined?: (BriefTask & { reason: string | null })[];
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
  done: "готово",
  declined: "отказ",
  revoked: "отозвана",
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

type LineOpts = { person?: boolean; status?: boolean; overdue?: boolean; closed?: boolean };

function taskLine(task: BriefTask & { status?: TaskStatus }, now: Date, opts: LineOpts = {}): string {
  const who = opts.person && task.assignee ? `${task.assignee}, ` : "";
  const status = opts.status && task.status ? STATUS_WORD[task.status] : undefined;
  const closedAt = (task as AnswerTask).closedAt;
  // a closed task is about when it closed, not about a deadline that no longer matters
  if (opts.closed && closedAt) {
    return `${who}${quoteTitle(task.title)} — ${status ?? "закрыта"} ${humanAqtobe(new Date(closedAt), now)}`;
  }
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

  // 1b. refusals
  if (/отказ|не может|не могут|не смог|не хочет/.test(q)) {
    const declined = input.declined ?? [];
    if (declined.length === 0) return { understood: true, lines: ["Отказов нет."] };
    return {
      understood: true,
      lines: [
        `${declined.length === 1 ? "Один отказ" : `Отказов ${declined.length}`}:`,
        ...declined.map((t) => `${t.assignee ? `${t.assignee}, ` : ""}${quoteTitle(t.title)}${t.reason ? ` — ${t.reason}` : ""}`),
      ],
    };
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

  // 5. a topic — a client, a document, a place; open tasks first, then the closed ones
  const byTopic = findByTopic(question, input.open);
  if (byTopic.length > 0) {
    const head = byTopic.length === 1 ? "Нашёл одну задачу:" : `Нашёл ${byTopic.length}:`;
    return { understood: true, lines: [head, ...byTopic.map((t) => taskLine(t, now, { person: true, status: true }))] };
  }
  const closedByTopic = findByTopic(question, input.closed ?? []).slice(0, 3);
  if (closedByTopic.length > 0) {
    const head = closedByTopic.length === 1 ? "В работе такого нет, но было:" : "В работе такого нет, но были:";
    return {
      understood: true,
      lines: [head, ...closedByTopic.map((t) => taskLine(t, now, { person: true, status: true, closed: true }))],
    };
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
