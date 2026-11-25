import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import type { Health } from "@/lib/push/health";

import { WORKING } from "./lifecycle";
import { REASON_ORDER, reasonOf, type DeskReason } from "./reasons";
import { pluralRu, type TaskStatus } from "./status-text";

/**
 * «Всё в порядке» — one definition for every screen of the director: Пульс, «Задачи» on the phone,
 * the task's own screen, «Сегодня» and «Задачи» on the desk. A screen that is about to say «всё идёт
 * по плану», light a green dot or write «решений не ждут» asks `attentionOf` first; while anything
 * needs the director it names the cause in words and offers the move instead.
 *
 * A task needs the director when its deadline has passed or is upon it, when it waits for his
 * decision (приёмка, вопрос, просьба о сроке, отказ), when it has been lying unaccepted for half an
 * hour, or when nobody can tell its holder about it — their pushes do not reach them. Pure: the
 * rows, the clock and whose pushes do not reach come in, so the verdict is tested, not eyeballed.
 */

/** Half an hour without «Принял» is no longer «he just has not seen it» (the owner, 2026-09-17). */
export const ACCEPT_GRACE_MS = 30 * 60 * 1000;
/** «Срок подходит» — an hour before the deadline; a passed one is `overdue`. */
export const DEADLINE_SOON_MS = 60 * 60 * 1000;

/** Why a task needs the director, loudest first. */
export type AttentionReason = "overdue" | "decision" | "soon" | "no_push" | "unaccepted";

export const ATTENTION_ORDER: readonly AttentionReason[] = ["overdue", "decision", "soon", "no_push", "unaccepted"];

/** The fields the verdict reads; a TaskWithPeople or a BoardTask fits as it is. */
export type AttentionTask = {
  id: string;
  title?: string;
  status: TaskStatus;
  deadline: string | null;
  created_at: string;
  scheduled_send_at?: string | null;
  assignee_id: string;
  assignee?: { full_name: string } | null;
  /** the board's newest unanswered question */
  question?: string | null;
  /** the board's open request for another deadline (D-128) */
  time_request?: unknown;
};

export type AttentionInput = {
  now?: Date;
  /** «Ждут вас» reasons by task id when the screen has them already (the question lives on the board row) */
  reasons?: ReadonlyMap<string, DeskReason>;
  /** people whose pushes do not reach them — `noPushIds(usePushHealth().data)` */
  noPush?: ReadonlySet<string>;
};

/** When the order actually went out: a scheduled one starts its clock at the send. */
export function sentAtOf(task: { created_at: string; scheduled_send_at?: string | null }): number {
  return new Date(task.scheduled_send_at ?? task.created_at).getTime();
}

/** Handed out, not accepted, longer than ACCEPT_GRACE_MS — the card's «не принята» turns amber. */
export function isStaleUnaccepted(task: { status: TaskStatus; created_at: string; scheduled_send_at?: string | null }, now: Date = new Date()): boolean {
  return task.status === "sent" && now.getTime() - sentAtOf(task) >= ACCEPT_GRACE_MS;
}

/** The deadline is within the hour and has not passed yet — a passed one is overdue. */
export function isDeadlineSoon(task: { status: TaskStatus; deadline: string | null }, now: Date = new Date()): boolean {
  if (!task.deadline || !WORKING.includes(task.status)) return false;
  const left = new Date(task.deadline).getTime() - now.getTime();
  return left >= 0 && left <= DEADLINE_SOON_MS;
}

/** The loudest reason of one task; null — the task is fine. Closed and held-for-later ones always are. */
export function taskAttention(task: AttentionTask, input: AttentionInput = {}): AttentionReason | null {
  const now = input.now ?? new Date();
  if (task.status === "done" || task.status === "revoked" || task.status === "scheduled") return null;
  const desk = input.reasons
    ? (input.reasons.get(task.id) ?? null)
    : reasonOf({ status: task.status, deadline: task.deadline, question: task.question ?? null, request: Boolean(task.time_request) }, now);
  if (desk === "overdue") return "overdue";
  if (desk) return "decision";
  if (isDeadlineSoon(task, now)) return "soon";
  if (task.status !== "sent") return null;
  // nobody can tell them: waiting half an hour for «Принял» would only lose the half hour
  if (input.noPush?.has(task.assignee_id)) return "no_push";
  if (isStaleUnaccepted(task, now)) return "unaccepted";
  return null;
}

export type AttentionItem = { id: string; reason: AttentionReason };

export type AttentionVerdict = {
  /** true — and only then — a screen may say «всё по плану», show a green dot, write «решений не ждут» */
  ok: boolean;
  /** danger while something is overdue; warn for any other attention */
  tone: "ok" | "warn" | "danger";
  /** one per task, loudest first, the nearest deadline first inside a reason */
  items: AttentionItem[];
  counts: Record<AttentionReason, number>;
  /** the cause in words, one line; null when ok */
  words: string | null;
  /** the move for the loudest item: «Напомнить», «Позвонить» (a push will not reach), open the task */
  action: "nudge" | "call" | "open" | null;
};

const ACTION: Record<AttentionReason, AttentionVerdict["action"]> = {
  overdue: "open",
  decision: "open",
  soon: "nudge",
  no_push: "call",
  unaccepted: "nudge",
};

const DECISION_WORD: Record<DeskReason, string> = {
  review: "на проверке",
  time: "просит срок",
  question: "вопрос",
  declined: "отказ",
  overdue: "просрочена",
};

const byDeadline = (a: AttentionTask, b: AttentionTask) =>
  (a.deadline ?? "9999") < (b.deadline ?? "9999") ? -1 : (a.deadline ?? "9999") > (b.deadline ?? "9999") ? 1 : sentAtOf(a) - sentAtOf(b);

/** «Тест» — a title in the verdict line, cut at a word so the line stays one thought. */
function titled(task: AttentionTask): string {
  const title = (task.title ?? "").trim();
  if (!title) return "Задача";
  if (title.length <= 32) return title;
  const head = title.slice(0, 31);
  const cut = head.lastIndexOf(" ");
  return `${(cut > 16 ? head.slice(0, cut) : head).replace(/[\s,;:—-]+$/, "")}…`;
}

const count = (n: number, forms: [string, string, string]) => `${n} ${pluralRu(n, forms)}`;

/** The words of one reason: the task by name when it is the only one, else the count. */
function reasonWords(reason: AttentionReason, tasks: readonly AttentionTask[], input: AttentionInput, now: Date): string {
  const first = tasks[0];
  const one = tasks.length === 1;
  switch (reason) {
    case "overdue":
      return one ? `${titled(first)} · просрочена` : count(tasks.length, ["просрочена", "просрочены", "просрочено"]);
    case "decision": {
      if (!one) return `${tasks.length} ${pluralRu(tasks.length, ["ждёт решения", "ждут решения", "ждут решения"])}`;
      const desk = input.reasons?.get(first.id) ?? reasonOf({ status: first.status, deadline: first.deadline, question: first.question ?? null, request: Boolean(first.time_request) }, now);
      return `${titled(first)} · ${desk ? DECISION_WORD[desk] : "ждёт решения"}`;
    }
    case "soon": {
      if (!one) return `${count(tasks.length, ["задача", "задачи", "задач"])} — срок меньше чем через час`;
      // the time itself is the foot's «Ближайший срок»: the words say how much is left
      const left = Math.max(1, Math.round((new Date(first.deadline as string).getTime() - now.getTime()) / 60_000));
      return `${titled(first)} · осталось ${left} мин`;
    }
    case "no_push": {
      // names stay in the nominative (DESIGN §5): «Марат · уведомления не доходят»
      const names = [...new Set(tasks.map((task) => shortName(task.assignee?.full_name)).filter(Boolean))];
      if (names.length > 1) return `уведомления не доходят: ${names.join(", ")}`;
      // one order: how long it has waited too — inside the half hour the name says enough
      const since = one && isStaleUnaccepted(first, now) ? ` · не принята с ${humanAqtobe(new Date(sentAtOf(first)), now).replace(/^сегодня /, "")}` : "";
      // a row without its assignee's name (a missing join) names the task instead, never «undefined»
      const who = names[0] ?? titled(first);
      return `${who} · уведомления не доходят${since}`;
    }
    case "unaccepted":
      return one
        ? `${titled(first)} · не принята с ${humanAqtobe(new Date(sentAtOf(first)), now).replace(/^сегодня /, "")}`
        : `${tasks.length} ${pluralRu(tasks.length, ["не принята", "не приняты", "не приняты"])} дольше 30 мин`;
  }
}

/** The verdict over a set of tasks — the director's own, a person's, the company's. */
export function attentionOf(tasks: readonly AttentionTask[], input: AttentionInput = {}): AttentionVerdict {
  const now = input.now ?? new Date();
  const groups: Record<AttentionReason, AttentionTask[]> = { overdue: [], decision: [], soon: [], no_push: [], unaccepted: [] };
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    const reason = taskAttention(task, { ...input, now });
    if (reason) groups[reason].push(task);
  }
  const counts = { overdue: 0, decision: 0, soon: 0, no_push: 0, unaccepted: 0 } as Record<AttentionReason, number>;
  const items: AttentionItem[] = [];
  for (const reason of ATTENTION_ORDER) {
    const group = groups[reason];
    if (reason === "decision") {
      // the queue's own order inside «ждёт решения»: what only the director can move first
      const rank = (task: AttentionTask) => {
        const desk = input.reasons?.get(task.id) ?? reasonOf({ ...task, question: task.question ?? null, request: Boolean(task.time_request) }, now);
        return desk ? REASON_ORDER.indexOf(desk) : REASON_ORDER.length;
      };
      group.sort((a, b) => rank(a) - rank(b) || byDeadline(a, b));
    } else {
      group.sort(byDeadline);
    }
    counts[reason] = group.length;
    for (const task of group) items.push({ id: task.id, reason });
  }
  if (items.length === 0) return { ok: true, tone: "ok", items, counts, words: null, action: null };
  const loudest = items[0].reason;
  const rest = items.length - counts[loudest];
  const head = reasonWords(loudest, groups[loudest], input, now);
  const words = rest > 0 ? `${head} · ещё ${rest} ${pluralRu(rest, ["требует внимания", "требуют внимания", "требуют внимания"])}` : head;
  return { ok: false, tone: counts.overdue > 0 ? "danger" : "warn", items, counts, words, action: ACTION[loudest] };
}

/** The people whose channel is off or broken (`channelHealth`, D-114): a push to them reaches nobody. */
export function noPushIds(health: ReadonlyMap<string, Health> | undefined): Set<string> {
  const out = new Set<string>();
  if (!health) return out;
  for (const [id, verdict] of health) if (verdict.state === "off" || verdict.state === "broken") out.add(id);
  return out;
}
