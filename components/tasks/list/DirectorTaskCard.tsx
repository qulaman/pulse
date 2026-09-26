"use client";

import { DeliveryStatus } from "@/components/tasks/DeliveryStatus";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { humanAqtobe } from "@/lib/ai/time";
import { hasUnread, type BoardTask } from "@/lib/pulse/board";
import { isWaiting, keysFor, QUICK_ANSWERS, type DeskAction, type DeskReason } from "@/lib/tasks/desk";
import { isWorking, passedWord, untilWords, type Suggestion, type TimeRequest } from "@/lib/tasks/lifecycle";
import { REASON_TONE, REASON_WORD, statusWord, stepsOf } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, TEXT } from "@/lib/tasks/status-text";

import { Icon, type IconName } from "../desk/icons";
import { CardFoot, CardHead, CardShell, LastWord, Note, Stepper } from "./TaskList";

/** On a card the verbs are short: «Передать» fits a third of a phone, «Переназначить» does not. */
const LABEL: Record<DeskAction, string> = {
  approve: "Принять",
  rework: "Доработать",
  answer: "Ответить",
  insist: "Настоять",
  reassign: "Передать",
  cancel: "Отменить",
  extend: "Срок",
  revoke: "Отозвать",
  sendNow: "Отправить",
  open: "Открыть",
  remove: "Удалить",
  grant: "Согласовать",
  retime: "Другой срок",
  keep: "Оставить прежний",
  handoff: "Передать",
  nudge: "Напомнить",
};

const ICON: Partial<Record<DeskAction, IconName>> = {
  approve: "check",
  rework: "rotate",
  insist: "send",
  reassign: "swap",
  extend: "clock",
  revoke: "undo",
  sendNow: "send",
  cancel: "x",
  remove: "x",
  grant: "check",
  retime: "clock",
  keep: "undo",
  handoff: "swap",
  nudge: "bell",
};

/** What the keys need from the board row besides the status (D-128). */
export type CardFlags = { question?: boolean; request?: boolean; suggestion?: boolean };

/**
 * Everything the thread card lets the director do with this task (`DirectorActions` in
 * TaskCard.tsx) — the keys on the card are the first three of it, «Ещё» holds the rest.
 */
export function allActionsFor(task: { status: TaskWithPeople["status"] }, { request = false, suggestion = false }: CardFlags = {}): DeskAction[] {
  switch (task.status) {
    case "pending_review":
      return ["approve", "rework", "revoke", "remove"];
    case "declined":
      return suggestion ? ["handoff", "insist", "reassign", "cancel", "remove"] : ["insist", "reassign", "cancel", "remove"];
    case "sent":
    case "accepted":
    case "in_progress":
    case "rework":
      // a request for time is answered, not reminded about (D-128)
      return request ? ["grant", "retime", "keep", "reassign", "revoke", "remove"] : ["extend", "nudge", "reassign", "revoke", "remove"];
    case "scheduled":
      return ["sendNow", "extend", "revoke", "remove"];
    default:
      return ["remove"];
  }
}

/**
 * The buttons of the open card: the keys of D-80 without «Открыть» (the thread has its own
 * link) and «Ответить» (a question has its own chips); a card left with one button takes
 * the next allowed action, so «Передать» stands next to «Продлить» on a question too.
 */
export function cardKeysFor(task: TaskWithPeople, flags: CardFlags, now: Date): DeskAction[] {
  const keys: DeskAction[] = keysFor(task, {
    question: flags.question,
    request: flags.request,
    suggestion: flags.suggestion,
    overdue: isOverdue(task, now),
    waiting: isWaiting(task, now),
  }).filter((key) => key !== "open" && key !== "answer");
  for (const action of allActionsFor(task, flags)) {
    if (keys.length >= 2 || action === "remove") break;
    if (!keys.includes(action)) keys.push(action);
  }
  return keys;
}

/**
 * The loud button: only a move that closes the director's turn — accept, insist, grant, hand
 * over, send a held task now (D-129), or a late task's new date.
 */
export function isPrimaryKey(key: DeskAction, reason: DeskReason | null): boolean {
  return (
    key === "approve" ||
    key === "insist" ||
    key === "grant" ||
    key === "handoff" ||
    key === "sendNow" ||
    (key === "extend" && reason === "overdue")
  );
}

/**
 * The first key that carries its own words (D-128) — «Согласовать · до завтра 10:00»,
 * «Передать · Ерлан» — takes a row of its own; the rest share the row below.
 */
export function wideLabelOf(key: DeskAction, request: TimeRequest | null, suggestion: Suggestion | null, now: Date): string | null {
  if (key === "grant" && request) return `Согласовать · ${untilWords(request.proposed, now)}`;
  if (key === "handoff" && suggestion) return `Передать · ${suggestion.name.trim().split(/\s+/)[0]}`;
  return null;
}

/** The buttons of a task — the same row on the card and on the task's own screen. */
export function DirectorKeys({
  keys,
  reason,
  request,
  suggestion,
  now,
  onPress,
}: {
  keys: DeskAction[];
  reason: DeskReason | null;
  request: TimeRequest | null;
  suggestion: Suggestion | null;
  now: Date;
  onPress: (key: DeskAction) => void;
}) {
  if (keys.length === 0) return null;
  const wide = wideLabelOf(keys[0]!, request, suggestion, now);
  const rest = wide ? keys.slice(1) : keys;
  const button = (key: DeskAction, index: number, label: string, cols: number) => {
    const primary = index === 0 && isPrimaryKey(key, reason);
    const danger = key === "remove" || key === "cancel";
    return (
      <Button
        key={key}
        data-testid={`task-action-${key}`}
        variant={primary ? "primary" : danger ? "ghost" : "secondary"}
        className={`!px-2 whitespace-nowrap !text-[14px] ${danger ? "!text-danger/85" : ""}`}
        icon={cols < 3 && (cols === 1 || label.length <= 12) && ICON[key] ? <Icon name={ICON[key] as IconName} size={16} /> : undefined}
        onClick={() => onPress(key)}
      >
        {label}
      </Button>
    );
  };
  const grid = (list: DeskAction[], offset: number) => (
    <div className={`grid gap-2 ${list.length === 3 ? "grid-cols-3" : list.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {list.map((key, index) => button(key, index + offset, key === "remove" ? "Удалить" : LABEL[key], list.length))}
    </div>
  );
  return (
    <div className="mt-4 flex flex-col gap-2">
      {wide ? <div className="grid">{button(keys[0]!, 0, wide, 1)}</div> : null}
      {rest.length > 0 ? grid(rest, wide ? 1 : 0) : null}
    </div>
  );
}

/** The director's notes of D-128 on a task: a request for time, «не всё», who took over, a reminder. */
export function LifecycleNotes({
  task,
  request,
  suggestion,
  partial,
  nudgedAt,
  now,
}: {
  task: TaskWithPeople;
  request: TimeRequest | null;
  suggestion: Suggestion | null;
  partial: boolean;
  nudgedAt: string | null;
  now: Date;
}) {
  return (
    <>
      {request ? (
        <Note tone="warn" icon={<Icon name="clock" size={15} />}>
          Просит срок {untilWords(request.proposed, now)}
          {request.words ? ` · «${request.words}»` : ""}
          <span className="text-muted">{task.deadline ? ` · сейчас ${humanAqtobe(new Date(task.deadline), now)}` : " · сейчас без срока"}</span>
        </Note>
      ) : null}
      {suggestion && task.status === "declined" ? (
        <Note tone="muted" icon={<Icon name="swap" size={15} />}>
          Предлагает передать: {suggestion.name}
        </Note>
      ) : null}
      {partial && task.status === "pending_review" ? (
        <Note tone="warn" icon={<Icon name="hand" size={15} />}>
          Сдано не всё — что осталось, в отчёте
        </Note>
      ) : null}
      {nudgedAt && isWorking(task.status) ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] leading-4 text-muted" data-testid="nudged">
          <Icon name="bell" size={13} />
          Напомнили<span className="nums">{humanAqtobe(new Date(nudgedAt), now)}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * A card of the director's list. Closed: the state mark, the title, «when», who and the
 * state. Open: the description, the employee's question with one-tap answers, a refusal
 * or the last word of the thread, the four steps of the task, and up to three buttons —
 * the director moves the task without opening the thread (D-80 §3 kept).
 */
export function DirectorTaskCard({
  task,
  row,
  reason,
  meId,
  open,
  now,
  onToggle,
  onAction,
  onAnswer,
  onMore,
  showPerson = true,
}: {
  task: TaskWithPeople;
  /** The board row: question, refusal reason, last word, read cursor. Closed tasks have none. */
  row: BoardTask | undefined;
  reason: DeskReason | null;
  meId: string;
  open: boolean;
  now: Date;
  onToggle: () => void;
  onAction: (action: DeskAction, task: TaskWithPeople) => void;
  onAnswer: (task: TaskWithPeople, text: string | null) => void;
  onMore: (task: TaskWithPeople) => void;
  showPerson?: boolean;
}) {
  const question = row?.question ?? null;
  const request = row?.time_request && isWorking(task.status) ? row.time_request : null;
  const suggestion = task.status === "declined" ? (row?.suggestion ?? null) : null;
  const flags: CardFlags = { question: Boolean(question), request: Boolean(request), suggestion: Boolean(suggestion) };
  const unread = row ? hasUnread(row, meId) : false;
  const keys = cardKeysFor(task, flags, now);
  const more = allActionsFor(task, flags).filter((action) => !keys.includes(action));
  const closed = task.status === "done" || task.status === "revoked";
  const last = row?.last_message ?? null;
  const lastText = last
    ? last.type === "photo"
      ? `фото${last.content ? ` · ${last.content}` : ""}`
      : last.type === "voice"
        ? `голосовое${last.content ? ` · ${last.content}` : ""}`
        : (last.content ?? "")
    : "";
  const lastName = last ? (last.sender_id === meId ? "Вы" : (task.assignee?.full_name ?? "Сотрудник")) : "";
  // the queue's own word leads the row: «на приёмке», «отказ», «просрочена» say what to do;
  // a question keeps the stage and adds its own flag
  const word = reason && reason !== "question" ? REASON_WORD[reason] : statusWord(task, "director", now);
  const wordTone = reason && reason !== "question" ? REASON_TONE[reason] : task.status === "sent" && !isOverdue(task, now) ? "accent" : undefined;

  return (
    <CardShell
      id={task.id}
      open={open}
      closed={closed}
      onToggle={onToggle}
      testId="sent-task"
      status={task.status}
      head={
        <CardHead
          task={task}
          now={now}
          open={open}
          person={showPerson ? (task.assignee?.full_name ?? "без исполнителя") : null}
          word={word}
          wordTone={wordTone}
          question={Boolean(question)}
          unread={unread && !question}
          closed={closed}
        />
      }
    >
      <div className="pl-[34px]">
        {task.body ? <p className="whitespace-pre-line text-[15px] leading-[21px] text-text/85">{task.body}</p> : null}

        {question ? (
          <div className={task.body ? "mt-3" : ""}>
            <Note tone="warn" icon={<Icon name="question" size={15} />}>
              «{question}»
            </Note>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_ANSWERS.map((text) => (
                <Chip key={text} onClick={() => onAnswer(task, text)}>
                  {text}
                </Chip>
              ))}
              <Chip tone="muted" onClick={() => onAnswer(task, null)}>
                Ответить словами…
              </Chip>
            </div>
          </div>
        ) : null}

        {task.status === "declined" ? (
          <Note tone="danger" icon={<Icon name="hand" size={15} />}>
            Отказ{row?.decline_reason ? `: ${row.decline_reason}` : ""}
          </Note>
        ) : null}
        {task.status === "rework" ? (
          <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
            На доработке — ждём новый отчёт
          </Note>
        ) : null}
        {task.status === "revoked" ? (
          task.passed_to ? (
            <Note tone="muted" icon={<Icon name="swap" size={15} />}>
              {passedWord(task.passed?.full_name)}
            </Note>
          ) : (
            <Note tone="muted" icon={<Icon name="undo" size={15} />}>
              {TEXT.revoked}
            </Note>
          )
        ) : null}
        <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={Boolean(row?.partial)} nudgedAt={row?.nudged_at ?? null} now={now} />

        {last && lastText && !question && !request ? <LastWord name={lastName} text={lastText} at={last.created_at} now={now} unread={unread} /> : null}
      </div>

      <div className="mt-4">
        <Stepper steps={stepsOf(task, now)} now={now} deadline={task.deadline} />
      </div>

      {/* D-32: until it is accepted, the push receipt in words — «не открывал с 9:14» */}
      {task.status === "sent" ? (
        <div className="-mt-0.5 flex justify-center">
          <DeliveryStatus taskId={task.id} status={task.status} assigneeId={task.assignee_id} onSendNow={() => onAction("sendNow", task)} />
        </div>
      ) : null}

      <DirectorKeys keys={keys} reason={reason} request={request} suggestion={suggestion} now={now} onPress={(key) => onAction(key, task)} />

      <CardFoot
        href={`/tasks/${task.id}`}
        extra={
          more.length > 0 ? (
            <button
              type="button"
              onClick={() => onMore(task)}
              data-testid="task-more"
              className="flex min-h-[40px] items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.05]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="5.5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="18.5" cy="12" r="1.7" />
              </svg>
              Ещё
            </button>
          ) : null
        }
      />
    </CardShell>
  );
}

export { LABEL as ACTION_LABEL, ICON as ACTION_ICON };
