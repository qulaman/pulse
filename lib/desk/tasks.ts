import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { ARCHIVE_STATUSES, type ArchiveStatus } from "@/lib/desk/archive";
import { formatNum } from "@/lib/desk/format";
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
import { isOverdue, pluralRu, type TaskStatus } from "@/lib/tasks/status-text";
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
/* What a screen knows about its data                                          */
/* -------------------------------------------------------------------------- */

/** The part of a query the screens read. Pure on purpose: the states are tested here. */
export type QueryView = {
  data: unknown;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  dataUpdatedAt: number;
  errorUpdatedAt: number;
};

/**
 * A screen's honest position towards its data. `failed` — nothing to show: an error, or no
 * network with no copy (TanStack pauses such a query, and it would stay a skeleton forever).
 * `stale` — a refresh of the copy on screen failed. Never an empty list standing for either. A
 * copy merely waiting for the network is `ready`: the app's own line says «Нет связи · данные на
 * 14:32» (OfflineBanner), the screen need not say it again.
 */
export type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "failed"; offline: boolean }
  | { kind: "stale"; failedAt: number; dataAt: number };

export function loadStateOf(query: QueryView): LoadState {
  if (query.data === undefined) {
    if (query.fetchStatus === "paused") return { kind: "failed", offline: true };
    return query.status === "error" ? { kind: "failed", offline: false } : { kind: "loading" };
  }
  return query.status === "error" ? { kind: "stale", failedAt: query.errorUpdatedAt, dataAt: query.dataUpdatedAt } : { kind: "ready" };
}

/** What several queries of one screen add up to: a failure first, then waiting, then a stale copy — the oldest. */
export function worstLoad(states: readonly LoadState[]): LoadState {
  const failed = states.find((state) => state.kind === "failed");
  if (failed) return failed;
  if (states.some((state) => state.kind === "loading")) return { kind: "loading" };
  const stale = states.filter((state) => state.kind === "stale");
  if (stale.length === 0) return { kind: "ready" };
  return stale.reduce((oldest, state) => (state.dataAt < oldest.dataAt ? state : oldest));
}

/** The time of a stale note: «в 14:32» today, «вчера 23:50» across midnight. */
function atWords(ms: number, now: Date): string {
  const words = humanAqtobe(new Date(ms), now);
  return words.startsWith("сегодня ") ? `в ${words.slice("сегодня ".length)}` : words;
}

/** The quiet note over a copy that could not be refreshed: when the refresh failed, how old the copy is in the hint. */
export function staleNote(state: Extract<LoadState, { kind: "stale" }>, now: Date = new Date()): { text: string; title?: string } {
  const when = state.failedAt || now.getTime();
  return { text: `Не обновилось ${atWords(when, now)}`, title: state.dataAt ? `На экране данные ${atWords(state.dataAt, now).replace(/^в /, "на ")}` : undefined };
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

/**
 * One word per status on the desk, the director's: the phone's `STATUS_LABEL` speaks to the
 * employee too («На проверке у директора»), and three words for one status read as three states.
 */
export const DESK_STATUS_LABEL: Record<TaskStatus, string> = {
  scheduled: "Отложена",
  sent: "Не принята",
  accepted: "В работе",
  in_progress: "В работе",
  pending_review: "На приёмке",
  done: "Готово",
  rework: "На доработке",
  declined: "Отказ",
  revoked: "Отозвана",
};

export function statusFilterLabel(status: StatusFilter): string {
  return DESK_STATUS_LABEL[status];
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

/** The status filter as «Закрытые» reads it: a status that never lives there narrows nothing. */
export function archiveStatusOf(status: StatusFilter | null): ArchiveStatus | null {
  return ARCHIVE_STATUSES.find((one) => one === status) ?? null;
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

/** «в срок» / «позже на 3 ч» — one verdict on a handed-in task. */
export type HandIn = { late: boolean; text: string };

/**
 * Handed in by the deadline or after it, and by how much — what the points of D-133 will read
 * (`tasks_points`), so the director sees it before pressing «Принять»: the same instants, the same
 * rule, `completed_at <= deadline` is in time, to the very second.
 *
 * - No deadline, or no hand-in on record: nothing to say — null, never a guess.
 * - The deadline that counts is the task's present one: a date moved before the hand-in moves the
 *   verdict too, as it moves the points.
 * - A hand-in is the latest one: `completed_at` is stamped anew on every `→ pending_review`, so
 *   work returned for rework and handed in again is judged by the second time. A task on rework
 *   has no verdict at all: the earlier hand-in no longer stands.
 * - Instants, not wall clocks: a span means the same in Aqtobe and anywhere else, whatever offset
 *   each timestamp was written with.
 */
export function handInVerdict(task: { status: TaskStatus; deadline: string | null; completed_at: string | null }): HandIn | null {
  if (task.status !== "pending_review" && task.status !== "done") return null;
  if (!task.deadline || !task.completed_at) return null;
  const over = new Date(task.completed_at).getTime() - new Date(task.deadline).getTime();
  if (Number.isNaN(over)) return null;
  return over <= 0 ? { late: false, text: "в срок" } : { late: true, text: `позже на ${spanRu(over)}` };
}

/** «В срок» as a column sorts: late work on one end, the rows with nothing to say on the other. */
export function verdictRank(verdict: HandIn | null): number {
  return !verdict ? 0 : verdict.late ? 2 : 1;
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
  task: { status: TaskStatus; assignee_id: string; deadline?: string | null; completed_at?: string | null },
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
    const verdict = handInVerdict({ status: task.status, deadline: task.deadline ?? null, completed_at: task.completed_at ?? null });
    // nominal — a name gives no gender (lib/tv/feed.ts)
    return { text: `сдано${photo ? " с фото" : ""}${verdict ? ` · ${verdict.text}` : ""}${row.partial ? " · не всё" : ""}${words}`, tone: verdict?.late ? "warn" : undefined };
  }
  return null;
}

/**
 * «Что»'s grey line: the newest word of the thread when «Последнее» does not already say it —
 * the director's own as «Вы: …», the employee's as it is (whose it is stands in «Кто»).
 */
export function underTitle(
  task: { status: TaskStatus; assignee_id: string; deadline?: string | null; completed_at?: string | null },
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
  { key: "stage-scheduled", title: "Отложены", statuses: ["scheduled"], tone: "muted" },
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
  if (tab === "closed") {
    // those are the last seven days, whichever week they fall in: the phone's own word stays the phone's
    return closedSections(tasks, now).map((section) => (section.key === "closed-week" ? { ...section, title: "За 7 дней" } : section));
  }
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
    case "review": {
      const verdict = handInVerdict({ status: "pending_review", deadline: task.deadline, completed_at: task.completed_at });
      return task.completed_at ? `Сдана ${since(task.completed_at, now)} назад${verdict ? ` · ${verdict.text}` : ""} — ждёт приёмки` : "Сдана — ждёт приёмки";
    }
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
 * The grey line of a decision on «Сегодня», part by part: what exactly waits — «сдано 40 мин назад
 * · позже на 3 ч · фото · «всё во вложении»», ««какой адрес?» · 14 мин без ответа», «не может:
 * «нет доступа»». Nominal, so it never guesses the person's gender. A part with a tone is the one
 * thing of the line worth a colour: a hand-in after the deadline.
 */
export function decisionParts(reason: DeskReason, task: Waiting, now: Date = new Date()): Line[] {
  const words = (parts: (string | Line | null | false | undefined)[]): Line[] =>
    parts.flatMap((part) => (!part ? [] : typeof part === "string" ? [{ text: part }] : [part]));
  switch (reason) {
    case "review": {
      const last = task.last_message && task.last_message.sender_id === task.assignee_id ? task.last_message : null;
      const verdict = handInVerdict({ status: "pending_review", deadline: task.deadline, completed_at: task.completed_at });
      return words([
        task.completed_at ? `сдано ${since(task.completed_at, now)} назад` : "сдано",
        verdict && (verdict.late ? { text: verdict.text, tone: "warn" } : verdict.text),
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

/** The same line as plain words. */
export function decisionLine(reason: DeskReason, task: Waiting, now: Date = new Date()): string {
  return decisionParts(reason, task, now)
    .map((part) => part.text)
    .join(" · ");
}

/* -------------------------------------------------------------------------- */
/* «Ждут вашего решения» beyond tasks: points disputes and shop orders (D-133)   */
/* -------------------------------------------------------------------------- */

type DisputeWords = { text: string; created_at: string; tx: { amount: number; reason: string } | null };

/** A dispute in a row: the minus and what it was for, then the person's own words. */
export function disputeLines(dispute: DisputeWords, now: Date = new Date()): { title: string; line: string; refund: number } {
  const amount = dispute.tx?.amount ?? 0;
  const reason = dispute.tx?.reason?.trim();
  const minus = amount ? formatNum(amount, { signed: true }) : "";
  return {
    title: ["Оспаривает", minus, reason ? `· ${reason}` : ""].filter(Boolean).join(" "),
    line: `«${dispute.text}» · ${since(dispute.created_at, now)} назад`,
    refund: Math.abs(amount),
  };
}

type OrderWords = { price: number; created_at: string; item: { title: string } | null };

/** An order to hand out in a row: the reward, what it cost, how long it has waited. */
export function orderLines(order: OrderWords, now: Date = new Date()): { title: string; line: string } {
  const points = `${formatNum(order.price)} ${pluralRu(order.price, ["очко", "очка", "очков"])}`;
  return { title: order.item?.title ?? "Награда", line: `заказ · ${points} · ${since(order.created_at, now)} назад` };
}

/** The moment's quiet line when no task waits but people do: «1 спор · 2 заказа ждут вас». */
export function extrasWord(disputes: number, orders: number): string | null {
  const total = disputes + orders;
  if (total === 0) return null;
  const parts = [
    disputes > 0 && `${disputes} ${pluralRu(disputes, ["спор", "спора", "споров"])}`,
    orders > 0 && `${orders} ${pluralRu(orders, ["заказ", "заказа", "заказов"])}`,
  ].filter(Boolean);
  return `${parts.join(" · ")} ${total === 1 ? "ждёт" : "ждут"} вас`;
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

/* -------------------------------------------------------------------------- */
/* The desk's own hand on a task: menus, many rows at once, the pickers (wave 3) */
/* -------------------------------------------------------------------------- */

/**
 * A move's name in a desk menu — a little longer than a button's, «…» when it asks something
 * first (a date, a person, a word, a confirmation). The phone's «Действия» say the same.
 */
export const ACT_LABEL: Record<DeskAction, string> = {
  approve: "Принять",
  rework: "На доработку…",
  answer: "Ответить",
  insist: "Настоять",
  reassign: "Передать…",
  cancel: "Отменить задачу…",
  extend: "Изменить срок…",
  revoke: "Отозвать…",
  sendNow: "Отправить сейчас",
  open: "Открыть",
  remove: "Удалить насовсем…",
  grant: "Согласовать срок",
  retime: "Назначить другой срок…",
  keep: "Оставить прежний срок",
  handoff: "Передать предложенному",
  nudge: "Напомнить",
  reissue: "Выдать снова…",
};

/** The letter a move answers to in the table, the panel and the stack — shown in a menu only when it works on that row. */
export function keyOfAction(action: DeskAction | "reply", keys: readonly RowKey[]): string | undefined {
  const wanted = action === "answer" ? "reply" : action;
  const key = keys.find((one) => one.action === wanted);
  return key ? KEY_CAP[key.code] : undefined;
}

/** Moves that take a task back or away: red in a menu, asked twice. */
export function isDangerAction(action: DeskAction): boolean {
  return action === "revoke" || action === "cancel" || action === "remove";
}

type Bulky = { id: string; status: TaskStatus; nudged_at?: string | null; time_request?: unknown };

/** What the bar over many marked rows can do to each of them (принцип 3: «Принять» is never in bulk). */
export type BulkPlan<T> = { nudge: T[]; extend: T[]; revoke: T[] };

/**
 * The marked rows each bulk move applies to — the same rule as one row's «⋯»: a reminder to work
 * in hand whose last one is older than half an hour and whose holder does not ask for time (a
 * request is answered, not reminded about — D-128), a new date to work in hand or held for the
 * morning, «Отозвать» to anything not closed yet (a refusal's «Отменить» is the same revoke).
 */
export function bulkPlan<T extends Bulky>(tasks: readonly T[], now: Date = new Date()): BulkPlan<T> {
  return {
    nudge: tasks.filter((task) => IN_HAND.includes(task.status) && !task.time_request && canNudgeAgain(task.nudged_at ?? null, now)),
    extend: tasks.filter((task) => IN_HAND.includes(task.status) || task.status === "scheduled"),
    revoke: tasks.filter((task) => task.status !== "done" && task.status !== "revoked"),
  };
}

/** The rows between two of them in the table's order, both ends in — a Shift-click. */
export function pickRange(ids: readonly string[], from: string | null, to: string): string[] {
  const end = ids.indexOf(to);
  if (end < 0) return [];
  const start = from ? ids.indexOf(from) : -1;
  if (start < 0) return [to];
  const [a, b] = start <= end ? [start, end] : [end, start];
  return ids.slice(a, b + 1);
}

/** One row in or out of the marked set — a Ctrl-click or X. */
export function togglePick(picked: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(picked);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** The marked rows still on screen, in the table's order — a row that left the table leaves the mark too. */
export function pickedInOrder(ids: readonly string[], picked: ReadonlySet<string>): string[] {
  return ids.filter((id) => picked.has(id));
}

/**
 * A column as wide as its longest word (D-154 wave 3): every row of the desk's grid is a grid of
 * its own, so `auto` would size each row apart and break the columns — the width is reckoned
 * from the words instead. 14 px Inter averages about 7.4 px a letter.
 */
export function fitColumn(texts: readonly string[], { min, max, extra = 24, perChar = 7.4 }: { min: number; max: number; extra?: number; perChar?: number }): string {
  const longest = texts.reduce((most, text) => Math.max(most, text.length), 0);
  return `${Math.round(Math.min(max, Math.max(min, longest * perChar + extra)))}px`;
}

/**
 * The table's columns by the width the list really has — the panel takes it from the window, a
 * person can drag it wider still. The title never gives way: below each floor a column that only
 * repeats something leaves first — the waiting words (the panel and the stage say them), the
 * receipt (the panel's), the stage (the ring at the title says it), the tick (X and Ctrl-click
 * still mark), the person and, on the very narrowest list, the deadline.
 */
export const COLUMN_FLOOR = { last: 960, delivery: 760, stage: 640, pick: 500, who: 440, due: 340 } as const;

export type TableColumn = keyof typeof COLUMN_FLOOR;

/** The width buckets the table is redrawn at: dragging the panel between two of them costs no render. */
export const COLUMN_FLOORS: readonly number[] = Object.values(COLUMN_FLOOR).sort((a, b) => b - a);

/** The bucket a width falls in — the highest floor it reaches, 0 under all of them. */
export function widthBucket(width: number): number {
  return COLUMN_FLOORS.find((floor) => width >= floor) ?? 0;
}

export function columnFits(column: TableColumn, bucket: number): boolean {
  return bucket >= COLUMN_FLOOR[column];
}

/** The next row under the cursor of a list (J/K): stays at the ends, the first one when none is held. */
export function cursorStep(ids: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = current ? ids.indexOf(current) : -1;
  if (at < 0) return delta > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}

/* ---- dates of the deadline picker (Aqtobe wall clock, +05:00) ---- */

const AQTOBE_MS = 5 * 3_600_000;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** «2026-11-03» moved by whole days. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return `${moved.getUTCFullYear()}-${pad2(moved.getUTCMonth() + 1)}-${pad2(moved.getUTCDate())}`;
}

/** Today on the Aqtobe wall clock. */
export function wallYmd(now: Date = new Date()): string {
  const wall = new Date(now.getTime() + AQTOBE_MS);
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
}

/** Monday 0 … Sunday 6 of a day. */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The instant a wall day and time name, with the offset written out — what the deadline routes take. */
export function wallIso(ymd: string, hm: string): string {
  return `${ymd}T${hm}:00+05:00`;
}

export type DeadlinePreset = { label: string; iso: string | null };

/**
 * The deadline picker's quick choices (digits 1…6): the phone's three (D-51) — today 18:00 while
 * the working day still has an hour left, tomorrow 9:00 and 13:00 — the week's end (Friday 18:00,
 * or Monday 9:00 from Friday on), a week ahead, and «без срока».
 */
export function deadlinePresets(now: Date = new Date(), { none = true }: { none?: boolean } = {}): DeadlinePreset[] {
  const today = wallYmd(now);
  const presets: DeadlinePreset[] = [];
  const evening = wallIso(today, "18:00");
  if (new Date(evening).getTime() - now.getTime() > 60 * 60_000) presets.push({ label: "Сегодня 18:00", iso: evening });
  presets.push({ label: "Завтра 9:00", iso: wallIso(shiftYmd(today, 1), "09:00") });
  presets.push({ label: "Завтра 13:00", iso: wallIso(shiftYmd(today, 1), "13:00") });
  const weekday = weekdayOf(today);
  if (weekday <= 3) presets.push({ label: "В пятницу 18:00", iso: wallIso(shiftYmd(today, 4 - weekday), "18:00") });
  else presets.push({ label: "В понедельник 9:00", iso: wallIso(shiftYmd(today, 7 - weekday), "09:00") });
  presets.push({ label: "Через неделю", iso: wallIso(shiftYmd(today, 7), "18:00") });
  if (none) presets.push({ label: "Без срока", iso: null });
  return presets;
}

/**
 * What a person types into the time box, as «HH:MM»: «9» → 09:00, «930» → 09:30, «18.30» → 18:30,
 * «18 30» → 18:30. Null — not a time.
 */
export function parseTimeInput(text: string): string | null {
  const typed = text.trim().replace(/[.\s,-]+/g, ":");
  let hours: number;
  let minutes: number;
  const parts = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(typed);
  if (parts) {
    hours = Number(parts[1]);
    minutes = parts[2] === undefined ? 0 : Number(parts[2].padEnd(2, "0"));
  } else if (/^\d{3,4}$/.test(typed)) {
    hours = Number(typed.slice(0, typed.length - 2));
    minutes = Number(typed.slice(-2));
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** The time box's ↑/↓: a quarter of an hour, around the clock. */
export function stepHm(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/* ---- the thread at the desk's density ---- */

type Spoken = { sender_id: string; created_at: string; type: string };

/** A word of the same person within this long of the last one hangs under it, without its own name. */
export const THREAD_RUN_MS = 5 * 60_000;

/**
 * Whether a message of the thread opens with its sender's name and time (the desk's dense feed,
 * as a messenger on a computer does): a new person, a pause of five minutes, a new Aqtobe day or
 * a line of history between them — yes; the same person's next word — no.
 */
export function opensRun(previous: Spoken | undefined, current: Spoken): boolean {
  if (!previous) return true;
  const said = (message: Spoken) => message.type !== "status_change" && message.type !== "system";
  if (!said(previous) || !said(current)) return true;
  if (previous.sender_id !== current.sender_id) return true;
  if (aqtobeDay(new Date(previous.created_at)) !== aqtobeDay(new Date(current.created_at))) return true;
  return new Date(current.created_at).getTime() - new Date(previous.created_at).getTime() > THREAD_RUN_MS;
}
