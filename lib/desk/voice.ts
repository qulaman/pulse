import type { Entity } from "@/lib/ai/schema";
import { quoteTitle } from "@/lib/pulse/briefing";
import type { IngestErrorCode, IngestStage } from "@/lib/store/ingest";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The voice of the desk's order line (D-164): which key starts the microphone, what the panel
 * says while a phrase is in flight, what the toast says once it is away, and which lines of an
 * answer are tasks to open. Pure — the line, the panel and the confirm editor read it.
 */

/** «V» outside a field (on the Russian layout the same key is «М» — «микрофон»). */
export const VOICE_KEY = "V";
const VOICE_CODE = "KeyV";

type KeyLike = { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean };

/** The voice key itself, plain: the caller checks the target is not a field. */
export function isVoiceKey(event: KeyLike): boolean {
  return event.code === VOICE_CODE && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !event.repeat;
}

/** Stages in which a phrase is on its way and the panel shows it travelling. */
export const IN_FLIGHT: ReadonlySet<IngestStage> = new Set(["recording", "uploading", "transcribing", "parsing"]);

/** Stages from which a new phrase may begin (the store's own `startVoice` guard). */
export const CAN_START: ReadonlySet<IngestStage> = new Set(["idle", "error", "question", "kept"]);

export type FlightStep = { key: "record" | "save" | "hear" | "parse"; label: string; state: "done" | "now" | "next" };

const STEPS: { key: FlightStep["key"]; stage: IngestStage; now: string; done: string }[] = [
  { key: "record", stage: "recording", now: "Слушаю", done: "Записал" },
  { key: "save", stage: "uploading", now: "Сохраняю", done: "Сохранил" },
  { key: "hear", stage: "transcribing", now: "Распознаю", done: "Распознал" },
  { key: "parse", stage: "parsing", now: "Разбираю", done: "Разобрал" },
];

/**
 * The road of a spoken phrase, step by step: what is done, what is going on, what is next. A typed
 * phrase has one step only — the panel shows no list for it.
 */
export function flightSteps(stage: IngestStage): FlightStep[] {
  const at = STEPS.findIndex((step) => step.stage === stage);
  return STEPS.map((step, index) => ({
    key: step.key,
    state: at < 0 || index > at ? "next" : index < at ? "done" : "now",
    label: index < at ? step.done : index === at ? `${step.now}…` : step.now,
  }));
}

/**
 * The microphone's own failures, in words that say what to do. `denied` — the browser has the
 * microphone blocked for this site (Permissions API); false/null — it was not refused, so there
 * is most likely no microphone at all (getUserMedia says NotFound, the store calls it «denied» too).
 */
export function micLine(code: IngestErrorCode, denied: boolean | null): string | null {
  switch (code) {
    case "mic_denied":
      return denied === false
        ? "Не нашёл микрофон. Подключите его и нажмите ещё раз — или напишите поручение строкой."
        : "Браузер не дал микрофон. Нажмите на значок слева от адреса сайта, разрешите «Микрофон» и нажмите ещё раз.";
    case "mic_unavailable":
      return "Здесь браузер не даёт микрофон — откройте сайт по https или напишите поручение строкой.";
    case "record_too_short":
      return "Запись короче секунды. Нажмите микрофон, скажите поручение и нажмите ещё раз.";
    case "empty_transcript":
      return "В записи нет слов. Запись сохранил — скажите ещё раз, ближе к микрофону.";
    default:
      return null;
  }
}

/** The head of the panel when a phrase fails: the microphone's own troubles by name. */
export function failureTitle(code: IngestErrorCode): string {
  if (code === "mic_denied" || code === "mic_unavailable") return "Нет микрофона";
  if (code === "record_too_short") return "Слишком коротко";
  if (code === "empty_transcript" || code === "stt_failed") return "Не расслышал";
  return "Не получилось";
}

/** Failures after which speaking again is the way out (nothing left to retry on the server). */
export const SPEAK_AGAIN: ReadonlySet<IngestErrorCode> = new Set(["mic_denied", "mic_unavailable", "record_too_short", "empty_transcript", "stt_failed"]);

/* ------------------------------------------------------------------ the toast after the send */

/** What went, as the toast needs it: the kind, the words, whom (already as the name to show). */
export type SentItem = { kind: Entity["kind"]; title: string; who: string | null };

export type SentNotice = { text: string; href: string | null };

const TASK_FORMS: [string, string, string] = ["задача", "задачи", "задач"];
const TASK_FORMS_ACC: [string, string, string] = ["задачу", "задачи", "задач"];

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= 3) return `${list.slice(0, -1).join(", ")} и ${list[list.length - 1]}`;
  return `${list.slice(0, 2).join(", ")} и ещё ${list.length - 2}`;
}

function joined(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

function ids(result: Record<string, unknown>, key: string): string[] {
  const value = result[key];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The toast once the batch is away (D-164): whom and what — «Отправил: Жасулан — «Проверить
 * склад»», «Отправил 3 задачи: Жасулан и Гульмира» — and where «Открыть» leads: the one task in
 * the panel of «Задачи», the list for several, the section of a batch without tasks. Names stay in
 * the nominative (DESIGN §4): the gender of a Kazakh name is not known, «Айгерим» does not decline.
 */
export function sentNotice(items: readonly SentItem[], result: Record<string, unknown>): SentNotice {
  const scheduled = result.scheduled === true;
  const verb = scheduled ? "Отправлю утром" : "Отправил";
  const tasks = items.filter((item) => item.kind === "task" || item.kind === "delegation");
  const parts: string[] = [];
  // the head names a person: «Отправил: Жасулан — …»; otherwise «Отправил 3 задачи: …»
  let named = false;

  if (tasks.length === 1) {
    const task = tasks[0]!;
    parts.push(`${task.who ?? "без исполнителя"} — ${quoteTitle(task.title)}`);
    named = Boolean(task.who);
  } else if (tasks.length > 1) {
    const people = [...new Set(tasks.map((task) => task.who).filter((who): who is string => Boolean(who)))];
    if (people.length === 1) {
      parts.push(`${people[0]} — ${tasks.length} ${pluralRu(tasks.length, TASK_FORMS)}`);
      named = true;
    } else {
      parts.push(`${tasks.length} ${pluralRu(tasks.length, TASK_FORMS_ACC)}${people.length > 0 ? `: ${names(people)}` : ""}`);
    }
  }

  const count = (kind: Entity["kind"]) => items.filter((item) => item.kind === kind).length;
  const repeats = items.filter((item) => item.kind === "recurrence");
  if (repeats.length === 1) parts.push(`повтор ${quoteTitle(repeats[0]!.title)}${repeats[0]!.who ? ` — ${repeats[0]!.who}` : ""}`);
  else if (repeats.length > 1) parts.push(`${repeats.length} ${pluralRu(repeats.length, ["повтор", "повтора", "повторов"])}`);
  const events = count("event");
  if (events > 0) parts.push(events === 1 ? "встречу в Календарь" : `${events} ${pluralRu(events, ["встречу", "встречи", "встреч"])} в Календарь`);
  const announcements = count("announcement");
  if (announcements > 0) parts.push(announcements === 1 ? "объявление в Эфир" : `${announcements} ${pluralRu(announcements, ["объявление", "объявления", "объявлений"])} в Эфир`);
  if (count("reminder") > 0) parts.push("напоминание в Заметки");
  if (count("note") > 0) parts.push("заметку в Заметки");
  const points = items.filter((item) => item.kind === "points");
  if (points.length > 0) parts.push(`очки${points[0]!.who ? `: ${names([...new Set(points.map((p) => p.who).filter((w): w is string => Boolean(w)))])}` : ""}`);

  const text = parts.length === 0 ? verb : named ? `${verb}: ${joined(parts)}` : `${verb} ${joined(parts)}`;

  const taskIds = ids(result, "task_ids");
  let href: string | null = null;
  if (tasks.length === 1) href = taskIds[0] ? `/desk/tasks?id=${taskIds[0]}` : "/desk/tasks";
  else if (tasks.length > 1 || repeats.length > 0) href = "/desk/tasks";
  else if (events > 0) href = "/desk/calendar";
  else if (announcements > 0) href = "/desk/ether";
  else if (count("reminder") > 0 || count("note") > 0) href = "/desk/notes";
  return { text, href };
}

/* ------------------------------------------------------------- the answer's lines as links */

/** A task the answer may speak of: its id, its title, its assignee as the answer names them. */
export type AnswerCandidate = { id: string; title: string; assignee: string | null; createdAt?: string | null };

/**
 * Which task each line of an answer is about (lib/pulse/answers.ts writes `«title»` into the line,
 * and «Имя, » in front when it names the person). Several tasks of one title: the one of the person
 * the line names, else the newest. A line about no task (a head, the general picture) — null.
 */
export function linkAnswerLines(lines: readonly string[], candidates: readonly AnswerCandidate[]): (string | null)[] {
  const byId = new Map<string, AnswerCandidate>();
  for (const candidate of candidates) if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  const tasks = [...byId.values()];
  const used = new Set<string>();
  const newest = (a: AnswerCandidate, b: AnswerCandidate) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  // «Гульмира: 2 задачи в работе:» — the head names whose tasks the lines below are
  const about = /^([^:«»,]+):/.exec(lines[0] ?? "")?.[1]?.trim() ?? null;
  return lines.map((line) => {
    const hits = tasks.filter((task) => !used.has(task.id) && task.title.trim() && line.includes(quoteTitle(task.title)));
    if (hits.length === 0) return null;
    const named = hits.filter((task) => task.assignee && line.startsWith(`${task.assignee}, `));
    const theirs = named.length > 0 ? named : hits.filter((task) => about !== null && task.assignee === about);
    const best = [...(theirs.length > 0 ? theirs : hits)].sort(newest)[0]!;
    used.add(best.id);
    return best.id;
  });
}
