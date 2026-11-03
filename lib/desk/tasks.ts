import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import type { BoardTask } from "@/lib/pulse/board";
import { isWaiting, receiptText, type DeskAction, type DeskReason } from "@/lib/tasks/desk";
import { compareTasks, groupTasks } from "@/lib/tasks/grouping";
import { canNudgeAgain, isWorking, untilWords } from "@/lib/tasks/lifecycle";
import {
  closedAtOf,
  closedSections,
  REASON_TONE,
  REASON_WORD,
  spanRu,
  statusWord,
  workingSections,
  yoursSections,
  type DirectorTab,
  type ListTask,
  type Section,
} from "@/lib/tasks/overview";
import { receiptLine, type DeliveryRow } from "@/lib/tasks/receipts";
import { isOverdue, pluralRu, STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf, type Tone } from "@/lib/tasks/tone";

/**
 * What the desk's task table says about a row (D-153, tasks/022 A; moved to lib/desk so the suite runs its test): the filters of its tool
 * bar, the stage in a word, «доставка» and «последнее». Pure — the clock comes in — so the
 * words are tested here and the screen only renders them; every word itself comes from
 * lib/tasks (принцип 8 included: «не открывал с 9:14», never «не получил»).
 */

export const TABS: readonly DirectorTab[] = ["yours", "working", "closed"];

export function parseTab(value: string | null | undefined): DirectorTab | null {
  return TABS.includes(value as DirectorTab) ? (value as DirectorTab) : null;
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export type DueFilter = "today" | "tomorrow" | "week" | "overdue" | "none";

export const DUE_LABEL: Record<DueFilter, string> = {
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "На неделе",
  overdue: "Просрочено",
  none: "Без срока",
};

export const DUE_FILTERS: readonly DueFilter[] = ["today", "tomorrow", "week", "overdue", "none"];

type Dated = { status: TaskStatus; deadline: string | null };

/** The deadline filter: «сегодня» and the rest are what is still ahead — a late task is «просрочено» only. */
export function matchesDue(task: Dated, due: DueFilter | null, now: Date = new Date()): boolean {
  if (!due) return true;
  if (due === "none") return !task.deadline;
  if (!task.deadline) return false;
  if (due === "overdue") return isOverdue(task, now);
  if (isOverdue(task, now)) return false;
  // a handed-in or closed task is never late: its past days are not «сегодня» either
  const days = aqtobeDay(new Date(task.deadline)) - aqtobeDay(now);
  if (due === "today") return days === 0;
  if (due === "tomorrow") return days === 1;
  return days >= 0 && days <= 7;
}

/** «В работе» is one word for two statuses (D-04: `in_progress` is not shown), so it is one filter. */
export type StatusFilter = Exclude<TaskStatus, "in_progress">;

export const STATUS_FILTERS: readonly StatusFilter[] = ["sent", "accepted", "rework", "pending_review", "declined", "scheduled", "done", "revoked"];

export function statusFilterLabel(status: StatusFilter): string {
  return STATUS_LABEL[status];
}

export function parseStatus(value: string | null | undefined): StatusFilter | null {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : null;
}

export function parseDue(value: string | null | undefined): DueFilter | null {
  return DUE_FILTERS.includes(value as DueFilter) ? (value as DueFilter) : null;
}

export function matchesStatus(task: { status: TaskStatus }, status: StatusFilter | null): boolean {
  if (!status) return true;
  if (status === "accepted") return task.status === "accepted" || task.status === "in_progress";
  return task.status === status;
}

/* -------------------------------------------------------------------------- */
/* A row's words                                                               */
/* -------------------------------------------------------------------------- */

export type Line = { text: string; tone?: Tone };

/**
 * «Стадия» in one word and the colour of its dot: the director's move by its name (на приёмке,
 * отказ, просрочена — the card's own words), else the stage as the director reads it.
 */
export function stageOf(task: Dated & { scheduled_send_at?: string | null; passed_to?: string | null }, reason: DeskReason | null, now: Date = new Date()): Required<Line> {
  if (reason && reason !== "question") return { text: REASON_WORD[reason], tone: REASON_TONE[reason] };
  return { text: statusWord(task, "director", now), tone: toneOf(task.status, isOverdue(task, now)) };
}

/** «9:14» today, «вчера 18:02» further back — a receipt's time. */
function at(iso: string, now: Date): string {
  return humanAqtobe(new Date(iso), now).replace(/^сегодня /, "");
}

const TAKEN: readonly TaskStatus[] = ["accepted", "in_progress", "rework", "pending_review", "done"];

/**
 * «Доставка» (принцип 8): until the task is taken — the push receipt in the thread's words
 * («не открывал с 9:14», «увидел 9:20», «отправлю в 08:00»), else what the receipt cannot say
 * yet; once taken — «принял 9:22». Nothing to say honestly — null.
 */
export function deliveryLine(
  task: { status: TaskStatus; accepted_at: string | null },
  delivery: DeliveryRow | null | undefined,
  now: Date = new Date(),
): Line | null {
  if (task.status === "sent") {
    if (!delivery) return null;
    const line = receiptLine(delivery, now);
    if (line) return { text: line.text, tone: line.tone };
    const words = receiptText(delivery, task.status, now);
    return { text: words.text, tone: words.tone };
  }
  if (TAKEN.includes(task.status) && task.accepted_at) return { text: `принял ${at(task.accepted_at, now)}`, tone: "ok" };
  return null;
}

/** What the employee's newest word says, short: «фото · готово», «голосовое». */
export function lastWordText(last: BoardTask["last_message"]): string {
  if (!last) return "";
  if (last.type === "photo") return `фото${last.content ? ` · ${last.content}` : ""}`;
  if (last.type === "voice") return `голосовое${last.content ? ` · ${last.content}` : ""}`;
  return last.content ?? "";
}

/**
 * «Последнее» — what waits in the task's words: the open question, a request for time, the
 * refusal's reason, or the handed-in work («сдано с фото · не всё»). Null when none of that.
 */
export function latestLine(
  task: { status: TaskStatus; assignee_id: string },
  row: Pick<BoardTask, "question" | "time_request" | "decline_reason" | "partial" | "last_message"> | undefined,
  now: Date = new Date(),
): Line | null {
  if (!row) return null;
  if (row.question && isWorking(task.status)) return { text: `«${row.question}»`, tone: "warn" };
  if (row.time_request && isWorking(task.status)) return { text: `просит срок ${untilWords(row.time_request.proposed, now)}`, tone: "warn" };
  if (task.status === "declined") return { text: row.decline_reason ? `отказ: ${row.decline_reason}` : "отказ без причины", tone: "danger" };
  if (task.status === "pending_review") {
    const last = row.last_message && row.last_message.sender_id === task.assignee_id ? row.last_message : null;
    const photo = last?.type === "photo";
    const words = last?.content ? ` · «${last.content}»` : "";
    // nominal — a name gives no gender (lib/tv/feed.ts)
    return { text: `сдано${photo ? " с фото" : ""}${row.partial ? " · не всё" : ""}${words}` };
  }
  return null;
}

/**
 * «Что»'s grey line: the newest word of the thread when «Последнее» does not already say it —
 * the director's own as «Вы: …», the employee's as it is (whose it is stands in «Кто»).
 */
export function underTitle(
  task: { status: TaskStatus; assignee_id: string },
  row: Pick<BoardTask, "question" | "time_request" | "decline_reason" | "partial" | "last_message"> | undefined,
  meId: string,
  now: Date = new Date(),
): string | null {
  if (!row?.last_message || latestLine(task, row, now)) return null;
  const text = lastWordText(row.last_message);
  if (!text) return null;
  return row.last_message.sender_id === meId ? `Вы: ${text}` : text;
}

/* -------------------------------------------------------------------------- */
/* Keeping one's place in a list that changes under the hand                    */
/* -------------------------------------------------------------------------- */

/**
 * The row that takes the place of one that has left the list: the one now standing where it
 * stood, else the last one; null — the list is empty.
 */
export function inPlaceOf(ids: readonly string[], index: number): string | null {
  if (ids.length === 0) return null;
  return ids[Math.min(Math.max(index, 0), ids.length - 1)] ?? null;
}

/** The queue of «Разобрать» with what the director skipped this session moved to its end, in the order skipped. */
export function withSkipped<T>(items: readonly T[], idOf: (item: T) => string, skipped: readonly string[]): T[] {
  if (skipped.length === 0) return [...items];
  const rest = items.filter((item) => !skipped.includes(idOf(item)));
  const later = skipped.map((id) => items.find((item) => idOf(item) === id)).filter((item): item is T => item !== undefined);
  return [...rest, ...later];
}

/* -------------------------------------------------------------------------- */
/* A row that changed under the director's eyes (Realtime)                       */
/* -------------------------------------------------------------------------- */

const CLOSED_FOR_GLOW: readonly TaskStatus[] = ["done", "revoked", "declined"];

/** What the table shows of a row, as one string: a change of any of it is a change worth a glow. */
export function rowSignature(
  task: { status: TaskStatus; updated_at: string },
  row: Pick<BoardTask, "question" | "time_request" | "last_message"> | undefined,
): string {
  return [task.status, task.updated_at, row?.last_message?.id ?? "", row?.question ?? "", row?.time_request?.id ?? ""].join("|");
}

/**
 * The first row whose signature moved since the last look, or a new open row (a new order). A
 * new closed row is a page of history coming in («Показать ещё»), not news. Null — nothing.
 */
export function firstChanged(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  statusOf: (id: string) => TaskStatus | undefined,
): string | null {
  if (before.size === 0) return null;
  for (const [id, signature] of after) {
    const was = before.get(id);
    if (was === undefined) {
      const status = statusOf(id);
      if (status && !CLOSED_FOR_GLOW.includes(status)) return id;
      continue;
    }
    if (was !== signature) return id;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* How the table is grouped (D-154)                                             */
/* -------------------------------------------------------------------------- */

/** `?group=`: by the reason (a stage in «В работе»), by the person, by the deadline (a day in «Закрытые»). */
export type GroupMode = "reason" | "person" | "due";

export type GroupChoice = { value: GroupMode; label: string };

/** The groupings a tab offers; the first is the tab's own and the default. */
export function groupChoices(tab: DirectorTab): GroupChoice[] {
  if (tab === "yours") {
    return [
      { value: "reason", label: "По причине" },
      { value: "person", label: "По человеку" },
      { value: "due", label: "По сроку" },
    ];
  }
  if (tab === "working") {
    return [
      { value: "due", label: "По сроку" },
      { value: "reason", label: "По стадии" },
      { value: "person", label: "По человеку" },
    ];
  }
  return [
    { value: "due", label: "По дню" },
    { value: "person", label: "По человеку" },
  ];
}

/** The address's grouping when the tab offers it, else the tab's own. */
export function groupOf(tab: DirectorTab, value: string | null | undefined): GroupMode {
  const choices = groupChoices(tab);
  return choices.find((choice) => choice.value === value)?.value ?? choices[0].value;
}

type Grouped = ListTask & { closed_at: string | null; updated_at: string };

const STAGES: { key: string; title: string; statuses: readonly TaskStatus[]; tone: Tone }[] = [
  { key: "stage-sent", title: "Не приняты", statuses: ["sent"], tone: "accent" },
  { key: "stage-work", title: "В работе", statuses: ["accepted", "in_progress"], tone: "ok" },
  { key: "stage-rework", title: "На доработке", statuses: ["rework"], tone: "warn" },
  { key: "stage-review", title: "На приёмке", statuses: ["pending_review"], tone: "warn" },
  { key: "stage-scheduled", title: "Отправлю позже", statuses: ["scheduled"], tone: "muted" },
];

/** «В работе» by the stage the work is at — who has not taken it yet, who is on it, who redoes it. */
function stageSections<T extends Grouped>(tasks: readonly T[]): Section<T>[] {
  const known = new Set<TaskStatus>(STAGES.flatMap((stage) => stage.statuses));
  const sections: Section<T>[] = STAGES.map((stage) => ({
    key: stage.key,
    title: stage.title,
    tone: stage.tone,
    tasks: tasks.filter((task) => stage.statuses.includes(task.status)).sort(compareTasks),
  }));
  const rest = tasks.filter((task) => !known.has(task.status));
  if (rest.length > 0) sections.push({ key: "stage-other", title: "Прочие", tone: "muted", tasks: [...rest].sort(compareTasks) });
  return sections.filter((section) => section.tasks.length > 0);
}

const LOUD: Record<Tone, number> = { danger: 0, warn: 1, accent: 2, ok: 3, gold: 4, muted: 5 };

const closedFirst = (a: Grouped, b: Grouped) => (closedAtOf(a) > closedAtOf(b) ? -1 : closedAtOf(a) < closedAtOf(b) ? 1 : 0);

/** A pile per person: the loudest reason among their tasks gives the tone, and the loudest people come first. */
function personSections<T extends Grouped>(tasks: readonly T[], reasons: ReadonlyMap<string, DeskReason>, closed: boolean): Section<T>[] {
  const piles = new Map<string, T[]>();
  for (const task of tasks) {
    const pile = piles.get(task.assignee_id);
    if (pile) pile.push(task);
    else piles.set(task.assignee_id, [task]);
  }
  const sections = [...piles].map(([id, pile]) => {
    const tone = pile.reduce<Tone>((loudest, task) => {
      const reason = reasons.get(task.id);
      const own: Tone = reason ? REASON_TONE[reason] : "muted";
      return LOUD[own] < LOUD[loudest] ? own : loudest;
    }, "muted");
    return {
      key: `person:${id}`,
      title: pile[0].assignee?.full_name ?? "Без исполнителя",
      tone,
      tasks: [...pile].sort(closed ? closedFirst : compareTasks),
    };
  });
  return sections.sort((a, b) => LOUD[a.tone] - LOUD[b.tone] || b.tasks.length - a.tasks.length || a.title.localeCompare(b.title, "ru"));
}

const DUE_TONE: Record<string, Tone> = { overdue: "danger", urgent: "warn", review: "warn", today: "accent", closed: "danger" };

/**
 * The table's groups for a tab and a grouping. «Ждут вас» by the reason is the queue's own order
 * (`yoursSections`); by the deadline — the phone's piles with приёмка near the top, the refusals
 * last (they are the only «closed» status this tab holds). «В работе» by the deadline is the
 * phone's `workingSections`, by the stage — not taken, in work, redone, held. History — by the day.
 */
export function tableSections<T extends Grouped>(
  tab: DirectorTab,
  mode: GroupMode,
  tasks: readonly T[],
  reasons: ReadonlyMap<string, DeskReason>,
  now: Date = new Date(),
): Section<T>[] {
  if (mode === "person") return personSections(tasks, reasons, tab === "closed");
  if (tab === "closed") return closedSections(tasks, now);
  if (tab === "yours") {
    if (mode === "reason") {
      return yoursSections(
        tasks.flatMap((task) => {
          const reason = reasons.get(task.id);
          return reason ? [{ task, reason }] : [];
        }),
      );
    }
    return groupTasks([...tasks], "deadline", now, { reviewFirst: true }).map((group) => ({
      key: `due-${group.key}`,
      title: group.key === "closed" ? "Отказы" : group.title,
      tone: DUE_TONE[group.key] ?? "muted",
      tasks: group.tasks,
    }));
  }
  if (mode === "reason") return stageSections(tasks);
  return workingSections(tasks, now, { reviewTitle: "На приёмке" });
}

/* -------------------------------------------------------------------------- */
/* A row's moves under the hand and its letters (D-154)                         */
/* -------------------------------------------------------------------------- */

/** The table's letters, by the physical key — a Russian layout presses the same «A». */
export type MoveKey = "KeyA" | "KeyR" | "KeyO" | "KeyN" | "KeyD" | "KeyT";

export const KEY_CAP: Record<MoveKey, string> = { KeyA: "A", KeyR: "R", KeyO: "O", KeyN: "N", KeyD: "D", KeyT: "T" };

/**
 * One button of a row: the phone's action, a short word, the letter that does the same. `main` —
 * the director's own move (the accent); `held` — a reminder went out less than half an hour ago,
 * the button says when instead of asking again.
 */
export type Move = { action: DeskAction; label: string; main: boolean; key?: MoveKey; title?: string; held?: boolean };

export type MoveFlags = {
  /** the employee asks for another deadline (D-128) */
  request?: { proposed: string } | null;
  /** the colleague the refusal suggests (D-128) */
  suggestion?: { name: string } | null;
  /** the director's last reminder (D-128) */
  nudgedAt?: string | null;
};

const IN_HAND: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

function nudgeMove(nudgedAt: string | null | undefined, main: boolean, now: Date): Move {
  if (nudgedAt && !canNudgeAgain(nudgedAt, now)) {
    return { action: "nudge", label: `Напомнили ${at(nudgedAt, now)}`, main: false, held: true, title: "Снова напомнить можно через полчаса после прошлого раза" };
  }
  return { action: "nudge", label: "Напомнить", main, key: "KeyN" };
}

const EXTEND: Move = { action: "extend", label: "Срок", main: false, key: "KeyD" };

/**
 * The two buttons a row offers under the hand (hovered or chosen), the reason's own move first —
 * приёмка «Принять · Доработать», просрочка «Напомнить · Срок», отказ «Передать · Настоять»,
 * вопрос «Ответить», просьба о сроке «Да · Нет». The actions are the phone card's (`cardKeysFor`):
 * the same transitions, the same sheets. A row with no reason offers the card's quiet keys; a
 * closed one — none, its «⋯» holds the rest.
 */
export function rowMoves(
  task: { status: TaskStatus; created_at: string; scheduled_send_at?: string | null },
  reason: DeskReason | null,
  flags: MoveFlags = {},
  now: Date = new Date(),
): Move[] {
  switch (reason) {
    case "review":
      return [
        { action: "approve", label: "Принять", main: true, key: "KeyA" },
        { action: "rework", label: "Доработать", main: false, key: "KeyR" },
      ];
    case "time": {
      const until = flags.request ? untilWords(flags.request.proposed, now) : null;
      return [
        { action: "grant", label: "Да", main: true, title: until ? `Согласовать срок ${until}` : "Согласовать срок" },
        { action: "keep", label: "Нет", main: false, title: "Оставить прежний срок" },
      ];
    }
    case "question":
      return [{ action: "answer", label: "Ответить", main: true, key: "KeyO" }];
    case "declined":
      return flags.suggestion
        ? [
            { action: "handoff", label: `Передать · ${flags.suggestion.name.trim().split(/\s+/)[0]}`, main: true, title: `Передать: ${flags.suggestion.name}` },
            { action: "insist", label: "Настоять", main: false },
          ]
        : [
            { action: "insist", label: "Настоять", main: true },
            { action: "reassign", label: "Передать", main: false, key: "KeyT" },
          ];
    case "overdue":
      return [nudgeMove(flags.nudgedAt, true, now), EXTEND];
  }
  if (task.status === "scheduled") return [{ action: "sendNow", label: "Отправить сейчас", main: false }, EXTEND];
  if (!IN_HAND.includes(task.status)) return [];
  if (isWaiting(task, now)) return [nudgeMove(flags.nudgedAt, false, now), EXTEND];
  return [EXTEND, { action: "reassign", label: "Передать", main: false, key: "KeyT" }];
}

/**
 * The buttons of a task on the stack of «Разобрать» (D-154): the row's moves and the phone card's
 * third — «Передать» on a late task, «Отменить» on a refusal, «Оставить прежний» on a request for
 * time. The first that can be pressed is the main one, and Enter presses it.
 */
export function stackMoves(
  task: { status: TaskStatus; created_at: string; scheduled_send_at?: string | null },
  reason: DeskReason,
  flags: MoveFlags = {},
  now: Date = new Date(),
): Move[] {
  switch (reason) {
    case "question":
      return [{ action: "answer", label: "Ответить", main: true, key: "KeyO" }, EXTEND];
    case "declined":
      return [
        flags.suggestion
          ? { action: "handoff", label: `Передать · ${flags.suggestion.name.trim().split(/\s+/)[0]}`, main: true, title: `Передать: ${flags.suggestion.name}` }
          : { action: "reassign", label: "Передать", main: true, key: "KeyT" },
        { action: "insist", label: "Настоять", main: false },
        { action: "cancel", label: "Отменить", main: false },
      ];
    case "time":
      return [
        { action: "grant", label: flags.request ? `Согласовать · ${untilWords(flags.request.proposed, now)}` : "Согласовать", main: true },
        { action: "retime", label: "Другой срок", main: false, key: "KeyD" },
        { action: "keep", label: "Оставить прежний", main: false },
      ];
    case "overdue": {
      const [nudge, extend] = rowMoves(task, reason, flags, now);
      // a reminder already on its way: the new date is the move
      return [nudge, nudge.held ? { ...extend, main: true } : extend, { action: "reassign", label: "Передать", main: false, key: "KeyT" }];
    }
    default:
      return rowMoves(task, reason, flags, now);
  }
}

/** The move Enter presses: the main one that can be pressed. */
export function enterMove(moves: readonly Move[]): Move | null {
  return moves.find((move) => move.main && !move.held) ?? null;
}

/** A letter of the table and what it does to the chosen row. «reply» — the panel with the caret in the answer field. */
export type RowKey = { code: MoveKey; action: DeskAction | "reply"; label: string };

/**
 * The letters that work on this row — the hint under the table names only these (D-154). The
 * moves are the ones the phone allows the task (`allActionsFor`): A and R on handed-in work, N and
 * D while the work is in hand, T while it can still change hands. «Передать» by a letter always
 * asks whom — the suggested colleague is the button's one-click way, not a key's.
 */
export function rowKeys(task: { status: TaskStatus }, flags: { request?: boolean } = {}): RowKey[] {
  const keys: RowKey[] = [];
  const inHand = IN_HAND.includes(task.status);
  if (task.status === "pending_review") {
    keys.push({ code: "KeyA", action: "approve", label: "принять" }, { code: "KeyR", action: "rework", label: "на доработку" });
  }
  if (task.status !== "revoked") keys.push({ code: "KeyO", action: "reply", label: "ответить" });
  if (inHand && !flags.request) keys.push({ code: "KeyN", action: "nudge", label: "напомнить" });
  if ((inHand && !flags.request) || task.status === "scheduled") keys.push({ code: "KeyD", action: "extend", label: "срок" });
  else if (inHand) keys.push({ code: "KeyD", action: "retime", label: "другой срок" });
  if (inHand || task.status === "declined") keys.push({ code: "KeyT", action: "reassign", label: "передать" });
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Why a task waits — in words with a number (D-154)                           */
/* -------------------------------------------------------------------------- */

const since = (iso: string, now: Date) => spanRu(now.getTime() - new Date(iso).getTime());

type Waiting = Pick<
  BoardTask,
  "deadline" | "completed_at" | "assignee_id" | "question" | "question_at" | "decline_reason" | "time_request" | "suggestion" | "partial" | "last_message" | "nudged_at"
>;

/**
 * The headline of «Разобрать»: how long the director's move has waited — «Просрочена на 7 дней»,
 * «Сдана 40 мин назад — ждёт приёмки». The words themselves (the question, the refusal, the
 * request) stand in the card under it. The task's gender, never the person's.
 */
export function reasonHeadline(reason: DeskReason, task: Waiting & { closed_at: string | null; updated_at: string }, now: Date = new Date()): string {
  switch (reason) {
    case "review":
      return task.completed_at ? `Сдана ${since(task.completed_at, now)} назад — ждёт приёмки` : "Сдана — ждёт приёмки";
    case "question":
      return task.question_at ? `Вопрос ждёт ответа ${since(task.question_at, now)}` : "Вопрос ждёт ответа";
    case "declined":
      return `Отказ ${since(closedAtOf(task), now)} назад — решение за вами`;
    case "time":
      return task.time_request ? `Просьба о сроке ждёт ответа ${since(task.time_request.at, now)}` : "Просьба о сроке ждёт ответа";
    case "overdue":
      return task.deadline ? `Просрочена на ${since(task.deadline, now)}` : "Просрочена";
  }
}

/**
 * The grey line of a decision on «Сегодня»: what exactly waits — «сдано 40 мин назад · фото ·
 * «всё во вложении»», ««какой адрес?» · 14 мин без ответа», «не может: «нет доступа»». Nominal,
 * so it never guesses the person's gender.
 */
export function decisionLine(reason: DeskReason, task: Waiting, now: Date = new Date()): string {
  const words = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");
  switch (reason) {
    case "review": {
      const last = task.last_message && task.last_message.sender_id === task.assignee_id ? task.last_message : null;
      return words([
        task.completed_at ? `сдано ${since(task.completed_at, now)} назад` : "сдано",
        last?.type === "photo" && "фото",
        task.partial && "не всё",
        last?.content && `«${last.content}»`,
      ]);
    }
    case "question":
      return words([task.question ? `«${task.question}»` : "вопрос", task.question_at && `${since(task.question_at, now)} без ответа`]);
    case "declined":
      return words([
        task.decline_reason ? `не может: «${task.decline_reason}»` : "отказ без причины",
        task.suggestion && `предлагает: ${task.suggestion.name.trim().split(/\s+/)[0]}`,
      ]);
    case "time":
      return words([
        task.time_request ? `просит срок ${untilWords(task.time_request.proposed, now)}` : "просит другой срок",
        task.time_request?.words && `«${task.time_request.words}»`,
      ]);
    case "overdue":
      return words([task.deadline ? `просрочено на ${since(task.deadline, now)}` : "просрочено", task.nudged_at && `напомнили ${at(task.nudged_at, now)}`]);
  }
}

/* -------------------------------------------------------------------------- */
/* «Команда сейчас» of «Сегодня» (D-154)                                         */
/* -------------------------------------------------------------------------- */

/** The load colours of lib/people/loads.ts (D-118), by name — this module stays free of hooks. */
export type LoadColorName = "gray" | "green" | "yellow" | "red";

export type PersonNow = {
  /** The avatar's ring: late — red, the director's move or a deadline within a day — amber; calm — none. */
  ring: Tone | null;
  /** What to read about the person in one line. */
  line: string;
  /** Where the person stands in the list: trouble first. */
  rank: number;
};

type OpenTask = { id: string; title: string; deadline: string | null; status: TaskStatus };

const byDeadline = (a: OpenTask, b: OpenTask) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9");

/**
 * One person of «Команда сейчас»: away — why, late — how many and the first title, the director's
 * move — which, a deadline within a day — when, in work — how much, nothing — «свободен».
 * `tasks` — the director's own open tasks of the person (for the titles); the counts are the
 * company's load, the same as the team's circles on the phone (D-118).
 */
export function personNow(
  person: { availability: string },
  load: { active: number; overdue: number; nearest: string | null } | undefined,
  color: LoadColorName,
  tasks: readonly OpenTask[],
  reasons: ReadonlyMap<string, DeskReason>,
  now: Date = new Date(),
): PersonNow {
  if (person.availability === "vacation") return { ring: null, line: "в отпуске", rank: 5 };
  if (person.availability === "sick") return { ring: null, line: "на больничном", rank: 5 };
  const titled = (task: OpenTask | undefined) => (task ? ` · «${task.title}»` : "");
  if (color === "red" && load) {
    const late = tasks.filter((task) => isOverdue(task, now)).sort(byDeadline);
    const count = Math.max(load.overdue, late.length);
    return { ring: "danger", line: `${count} ${pluralRu(count, ["просрочка", "просрочки", "просрочек"])}${titled(late[0])}`, rank: 0 };
  }
  const yours = tasks.filter((task) => reasons.has(task.id) && reasons.get(task.id) !== "overdue");
  if (yours.length === 1) return { ring: "warn", line: `${REASON_WORD[reasons.get(yours[0].id) as DeskReason]}${titled(yours[0])}`, rank: 1 };
  if (yours.length > 1) {
    return { ring: "warn", line: `${yours.length} ${pluralRu(yours.length, ["ждёт вас", "ждут вас", "ждут вас"])}${titled(yours[0])}`, rank: 1 };
  }
  if (color === "yellow" && load?.nearest) {
    const soon = tasks.find((task) => task.deadline === load.nearest);
    return { ring: "warn", line: `срок ${at(load.nearest, now)}${titled(soon)}`, rank: 2 };
  }
  if (color === "green" && load) {
    return { ring: null, line: `${load.active} в работе${load.nearest ? ` · срок ${at(load.nearest, now)}` : ""}`, rank: 3 };
  }
  return { ring: null, line: "свободен", rank: 4 };
}
