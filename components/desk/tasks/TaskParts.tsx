"use client";

import { Ban, CalendarClock, Check, ChevronDown, CircleCheck, CircleX, Clock, Ellipsis, FileText, Flame, Hourglass, MessageCircleQuestion, Pencil, Repeat, RotateCcw, Send, Undo2, UserRound, X } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { Morph } from "@/components/desk/ui/Morph";
import { useAvatars } from "@/components/desk/ui/Face";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Menu } from "@/components/desk/ui/Menu";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { ruleLine } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { useTaskDelivery } from "@/components/tasks/DeliveryStatus";
import { ACTION_LABEL, allActionsFor, isPrimaryKey, wideLabelOf } from "@/components/tasks/list/DirectorTaskCard";
import { PhotoMessage } from "@/components/tasks/PhotoMessage";
import { humanAqtobe } from "@/lib/ai/time";
import { useGoneIds } from "@/lib/people/queries";
import { useReactionPrices, useReactToTask, useTaskReactions } from "@/lib/points/game";
import { isReactable, priceLabel, REACTION_CODES, REACTION_GLYPH, REACTION_LABEL, showsReactionBar } from "@/lib/points/reactions";
import { answersFor, wantsWords } from "@/lib/tasks/answers";
import { canEdit } from "@/lib/tasks/edit";
import { BLIND_NUDGE_HINT, firstMoveOf, keysBesideCall } from "@/lib/tasks/reasons";
import { heldLine } from "@/lib/tasks/held";
import { isWorking, passedWord, untilWords } from "@/lib/tasks/lifecycle";
import { closedAtOf, stepsOf, timeLeft, type Step } from "@/lib/tasks/overview";
import type { DeliveryRow } from "@/lib/tasks/receipts";
import type { Me, TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, TEXT } from "@/lib/tasks/status-text";

import { deliveryLine, handInVerdict, keyOfAction, stageOf, type Line } from "@/lib/desk/tasks";
import { focusComposer } from "./DeskThread";
import { FaceName } from "./Face";
import { CallButton, MiniButton, useCallFirst } from "./RowMoves";
import type { DeskTask } from "./useDeskTask";

/** A line of words — «не открывал с 9:14». A receipt is nobody's move: only a failure takes a colour (D-158). */
export function ToneLine({ line, testId, className = "", children }: { line: Line; testId?: string; className?: string; children?: ReactNode }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`} style={{ color: line.tone === "danger" ? "var(--danger)" : "var(--text-muted)" }} data-testid={testId}>
      <span className="truncate" title={line.text}>
        {line.text}
      </span>
      {children}
    </span>
  );
}

/**
 * «Доставка» of a table row (principle 8): the push receipt of a task not yet taken comes from the
 * table's one query for all such rows (`useTaskReceipts`). Neutral words: a row carries two
 * colours at most — its stage ring and a missed deadline (D-158).
 */
export function DeliveryCell({ task, receipt, now }: { task: TaskWithPeople; receipt: DeliveryRow | undefined; now: Date }) {
  const line = task.status === "sent" || task.status === "scheduled" ? deliveryLine(task, receipt ?? null, now) : null;
  if (!line) return <span className="text-muted/60">—</span>;
  return (
    <span className="block truncate text-[13px] text-text/80" title={line.text} data-testid="desk-delivery">
      {line.text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The head: who, what, and the fields a click changes                          */
/* -------------------------------------------------------------------------- */

/** A field's value that a click changes — quiet until hovered, its key in the hint. */
function FieldButton({
  label,
  keys,
  taskId,
  act,
  onPress,
  children,
  testId,
}: {
  label: string;
  keys?: string[];
  taskId: string;
  act: string;
  onPress: (target: HTMLElement) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    // the box may shrink: a long name ends in «…» instead of running under the next thing (D-203)
    <Tooltip label={label} keys={keys} side="bottom" className="flex min-w-0">
      <button
        type="button"
        data-act-for={taskId}
        data-act={act}
        data-testid={testId}
        onClick={(event) => onPress(event.currentTarget)}
        className="tasks-field-button -ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-[2px] px-1.5 transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="flex min-w-0 items-center">{children}</span>
        <ChevronDown aria-hidden size={14} className="desk-chevron" />
      </button>
    </Tooltip>
  );
}

function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="tasks-field-label flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted">
        {icon ? (
          <span aria-hidden className="tasks-ico tasks-field-icon shrink-0">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] leading-5">{children}</dd>
    </>
  );
}

/**
 * «Доставка» (principle 8): what waits for the morning with «отправить сейчас» (D-129), else the push
 * receipt of a task not yet taken. Once it is taken the path under the fields says when.
 */
function Receipt({ task, now, onSendNow }: { task: TaskWithPeople; now: Date; onSendNow: () => void }) {
  const asks = task.status !== "scheduled" && task.status !== "revoked";
  const delivery = useTaskDelivery(asks ? task.id : null, task.assignee_id);
  const held = delivery.data ? heldLine(delivery.data.held, now) : null;
  if (held) {
    return (
      <Field label="Доставка" icon={<Send size={14} />}>
        <span className="flex items-center gap-1.5 text-muted" data-testid="desk-receipt">
          {held} ·
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={onSendNow} data-testid="send-now">
            отправить сейчас
          </button>
        </span>
      </Field>
    );
  }
  const line = task.status === "sent" ? deliveryLine(task, delivery.data?.receipt, now) : null;
  return line ? (
    <Field label="Доставка" icon={<Send size={14} />}>
      <ToneLine line={line} testId="desk-receipt" />
    </Field>
  ) : null;
}

/**
 * A step's ink (the one map of state colours, lib/tasks/tone.ts): amber where the move is the
 * director's — work handed in waits «На проверке» — or where the step has stood too long (an order
 * untaken for half an hour, a return for rework); never green or the brand's for work not yet taken.
 */
function stepInk(step: Step): string {
  if (step.state === "bad") return "var(--danger)";
  if (step.state === "todo") return "var(--border)";
  if (step.state === "warn") return "var(--warn)";
  return step.state === "current" && step.key === "review" ? "var(--warn)" : "var(--text)";
}

/**
 * The four steps of a task (Поручено → В работе → На проверке → Готово), each with its time, as a
 * stepper — a node a step, done ones ticked, the one the task stands on ringed in its ink, the line
 * between them drawing itself in.
 */
function Path({ desk, now }: { desk: DeskTask; now: Date }) {
  const task = desk.task as TaskWithPeople;
  const steps = stepsOf(task, now, { declinedAt: desk.signals.declinedAt });
  return (
    <ol className="tasks-steps grid grid-cols-4 gap-1" data-testid="task-steps">
      {steps.map((step, index) => {
        const pending = step.state === "current" || step.state === "warn" || step.state === "bad";
        const due = pending && !step.at && task.deadline && step.key !== "closed" ? task.deadline : null;
        const time = step.at ? humanAqtobe(new Date(step.at), now).replace(/^сегодня /, "") : due ? `до ${humanAqtobe(new Date(due), now).replace(/^сегодня /, "")}` : "";
        const next = steps[index + 1];
        return (
          <li
            key={step.key}
            className="tasks-step min-w-0"
            data-state={step.state}
            data-next={next?.state}
            style={{ "--own": stepInk(step), "--bar": next ? stepInk(next) : "transparent", "--i": index } as CSSProperties}
          >
            <span aria-hidden className="tasks-step-bar block h-[2px]" />
            <span aria-hidden className="tasks-step-dot">
              {step.state === "done" ? <Check size={11} /> : step.state === "bad" ? <X size={11} /> : null}
            </span>
            <span className={`tasks-step-label mt-1 block truncate text-[12px] leading-4 ${pending ? "font-semibold" : step.state === "todo" ? "text-muted" : ""}`} style={pending ? { color: stepInk(step) } : undefined}>
              {step.label}
            </span>
            <span className="nums block h-4 truncate text-[11px] leading-4 text-muted">{time}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** «Изменить» (E): the task's panel or card turns into its form (D-203); none on a closed task. */
export function EditTaskButton({ desk, className = "ml-auto" }: { desk: DeskTask; className?: string }) {
  const task = desk.task as TaskWithPeople;
  if (!canEdit(task.status)) return null;
  return (
    <Tooltip label="Изменить задачу" keys={["E"]} side="left" className={`${className} inline-flex shrink-0`}>
      <button type="button" onClick={() => desk.acts.press("edit", task)} data-testid="desk-task-edit" className="tasks-edit-open">
        <Pencil aria-hidden size={14} className="tasks-ico" />
        Изменить
      </button>
    </Tooltip>
  );
}

/**
 * The head of a task at the desk (D-203): a quiet line on top — the stage in words with its dot,
 * «Изменить» (E) at the other end, the panel's «×» beyond it; the title (a double click edits it);
 * then the task's properties one per row, each where a click changes it — «Кому» passes it on (T),
 * «Срок» opens the date (D); the receipt (principle 8), the repeat; and the path in four steps.
 * `large` — the stack of «Разобрать», whose headline says the stage; `fly` — the panel, where the
 * title arrives from its row (D-184); `form` — the task is in its form: only the top line stays,
 * saying so, and the form below holds the rest (D-203).
 */
export function TaskHead({
  desk,
  now,
  large = false,
  scope,
  fly = false,
  form = false,
}: {
  desk: DeskTask;
  now: Date;
  large?: boolean;
  scope?: () => Element | null;
  fly?: boolean;
  form?: boolean;
}) {
  const task = desk.task as TaskWithPeople;
  const stage = stageOf(task, desk.reason, now);
  const closed = task.status === "done" || task.status === "revoked";
  const gone = useGoneIds().has(task.assignee_id) && !closed;
  const flags = { request: Boolean(desk.signals.request), suggestion: Boolean(task.status === "declined" && desk.signals.suggestion) };
  const all = allActionsFor(task, flags);
  const canPass = all.includes("reassign");
  const canDate = all.includes("extend") || all.includes("retime");
  const due = deadlineLabel(task, now);
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const left = timeLeft(task, now);
  const handedIn = (task.status === "pending_review" || task.status === "done") && Boolean(task.completed_at);
  const verdict = handInVerdict(task);
  const from = (target: HTMLElement) => ({ at: target, scope: scope?.() ?? null });
  // the pen and the pencil are for what waits on the director; a stage on its way stays in print
  const stageInk = stage.tone === "danger" ? "var(--danger)" : desk.reason ? TONE_VAR[stage.tone] : "var(--text-muted)";
  // the person's face before the name, as the table has it (D-174)
  const avatars = useAvatars();
  const who = <FaceName id={task.assignee_id} name={task.assignee?.full_name} avatar={avatars.get(task.assignee_id)} size={22} gone={gone} full />;
  const editable = canEdit(task.status);
  const edit = () => desk.acts.press("edit", task);
  const title = (
    <h2
      className={`desk-task-title tasks-title [overflow-wrap:anywhere] ${large ? "text-[28px] leading-8" : "text-[20px] leading-[26px]"}`}
      onDoubleClick={editable ? edit : undefined}
      data-testid="desk-task-title"
    >
      {task.title}
    </h2>
  );
  return (
    <header className="tasks-head" data-large={large ? "" : undefined}>
      {/* the panel's «×» stands in the corner, on this line's middle: the line leaves it room */}
      {large && !form ? null : (
        <div className={`tasks-topbar flex min-h-8 items-center gap-3 ${large ? "" : "pr-11"}`}>
          {large ? null : (
            <span className="tasks-stage desk-label min-w-0 truncate uppercase" style={{ color: stageInk }} data-testid="desk-task-stage">
              {stage.text}
            </span>
          )}
          {form ? (
            <span className="tasks-edit-badge ml-auto shrink-0" data-testid="desk-task-editing">
              <Pencil aria-hidden size={14} className="tasks-ico" />
              Правка
            </span>
          ) : editable ? (
            <EditTaskButton desk={desk} />
          ) : null}
        </div>
      )}
      {form ? null : (
        <>
          {/* `fly` — the panel: the title comes from the task's row and goes back to it (D-184) */}
          {fly ? (
            <Morph part="task" id={task.id}>
              {title}
            </Morph>
          ) : (
            title
          )}

          <dl className="tasks-fields grid gap-x-3" data-testid="desk-task-fields">
            <Field label="Кому" icon={<UserRound size={14} />}>
              {canPass ? (
                <FieldButton label="Передать другому" keys={["T"]} taskId={task.id} act="reassign handoff" onPress={(target) => desk.acts.press("reassign", task, from(target))} testId="desk-field-assignee">
                  {who}
                </FieldButton>
              ) : (
                who
              )}
            </Field>
            <Field
              label={closed ? (task.status === "done" ? "Принята" : "Закрыта") : "Срок"}
              icon={closed ? task.status === "done" ? <CircleCheck size={14} /> : <CircleX size={14} /> : <CalendarClock size={14} />}
            >
              {closed ? (
                <span className="nums">{humanAqtobe(new Date(closedAtOf(task)), now)}</span>
              ) : canDate ? (
                <FieldButton label="Срок" keys={["D"]} taskId={task.id} act="extend retime" onPress={(target) => desk.acts.press("extend", task, from(target))} testId="desk-field-deadline">
                  <When overdue={due.overdue}>{urgentNow ? TEXT.urgent : due.text}</When>
                </FieldButton>
              ) : (
                <When overdue={due.overdue}>{due.text}</When>
              )}
              {task.priority === "high" && task.deadline && !closed ? (
                <span className="tasks-urgent-mark" data-testid="desk-task-urgent">
                  <Flame aria-hidden size={12} />
                  {TEXT.urgent}
                </span>
              ) : null}
              {!closed && !large && !handedIn && task.status !== "declined" && left.text !== TEXT.noDeadline ? <span className="text-muted">{left.text}</span> : null}
              {handedIn && verdict && !large ? (
                <span
                  className={verdict.late ? "text-danger" : "text-muted"}
                  title={task.deadline ? `Срок: ${humanAqtobe(new Date(task.deadline), now)}` : undefined}
                  data-testid="desk-task-handin"
                >
                  · сдана {verdict.text}
                </span>
              ) : null}
            </Field>
            {task.status === "scheduled" && task.scheduled_send_at ? (
              <Field label="Уйдёт" icon={<Clock size={14} />}>
                <span className="nums">{humanAqtobe(new Date(task.scheduled_send_at), now)}</span>
              </Field>
            ) : null}
            {task.status !== "revoked" && task.status !== "scheduled" ? <Receipt task={task} now={now} onSendNow={() => desk.acts.press("sendNow", task)} /> : null}
            {desk.rule ? (
              <Field label="Повтор" icon={<Repeat size={14} />}>
                <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="desk-task-repeat">
                  <span className="truncate">{ruleLine(desk.rule)}</span>
                  {desk.rule.is_active ? null : <span className="text-muted">· остановлен</span>}
                </span>
              </Field>
            ) : null}
          </dl>

          <div className="tasks-path">
            <Path desk={desk} now={now} />
          </div>
        </>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* What was said and what waits                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One note of what waits on a task: a tinted card with the icon of what it is (D-174).
 */
export function Callout({ tone, icon, children, testId }: { tone: Tone; icon?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div
      className="tasks-callout -ml-3 mt-3 border-l-2 pl-2.5 text-[13px] leading-5"
      style={{ borderColor: TONE_VAR[tone], "--tone": TONE_VAR[tone] } as CSSProperties}
      data-tone={tone}
      data-testid={testId}
    >
      {icon ? (
        <span aria-hidden className="tasks-ico tasks-callout-icon">
          {icon}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The director's one-click answers to the employee's question (D-142), each under a digit — the
 * same answers as the phone's chips (`answersFor`); «Ответить словами» puts the caret in the field.
 */
function QuickReplies({ desk, now, onWords }: { desk: DeskTask; now: Date; onWords: () => void }) {
  const task = desk.task as TaskWithPeople;
  const question = desk.signals.question as string;
  const answers = answersFor(question, task.deadline, now);
  const words = wantsWords(question);
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-[2px] border px-2 text-[13px] font-medium leading-4 transition-colors duration-[140ms]";
  return (
    <div className="tasks-quick mt-2 flex flex-wrap items-center gap-1" data-testid="quick-answers">
      {answers.map((answer, index) => (
        <button
          key={answer.label}
          type="button"
          onClick={() => desk.acts.answer(task, answer.text, answer.deadlineIso)}
          title={`Ответить «${answer.text}» (${index + 1})`}
          className={`${chip} border-border text-text hover:bg-surface-2`}
          data-quick-answer={index + 1}
        >
          <span aria-hidden className="nums text-[11px] leading-4 text-muted">
            {index + 1}
          </span>
          {answer.label}
        </button>
      ))}
      <button type="button" onClick={onWords} className={`${chip} ${words ? "desk-move" : "border-transparent text-muted hover:text-text"}`}>
        Ответить словами <Kbd>O</Kbd>
      </button>
    </div>
  );
}

/** The newest words of the current handover: a report at or after `completed_at` (D-64 §3). */
function reportOf(task: TaskWithPeople, messages: readonly TaskMessage[] | undefined): TaskMessage | undefined {
  if (!task.completed_at) return undefined;
  const since = new Date(task.completed_at).getTime() - 1000;
  return [...(messages ?? [])]
    .reverse()
    .find((message) => (message.meta as Record<string, unknown> | null)?.report === true && Boolean(message.content?.trim()) && new Date(message.created_at).getTime() >= since);
}

/**
 * What waits on the director, right above his buttons (D-203): the employee's question with the
 * one-click answers, a refusal, a request for time, a return, a recall, and of handed-in work the
 * words and the photo of the report — «Принять» is never pressed blind.
 */
export function TaskWaits({ desk, now, onWords }: { desk: DeskTask; now: Date; onWords: () => void }) {
  const task = desk.task as TaskWithPeople;
  const { question, request, suggestion, declineReason, partial, nudgedAt } = desk.signals;
  const handed = task.status === "pending_review" || task.status === "done";
  const report = handed ? reportOf(task, desk.messages) : undefined;
  // the photo of this hand-in, not of one before a rework (the report's own window)
  const since = task.completed_at ? new Date(task.completed_at).getTime() - 1000 : 0;
  const photo = handed
    ? [...(desk.messages ?? [])].reverse().find((message) => message.type === "photo" && message.sender_id === task.assignee_id && new Date(message.created_at).getTime() >= since)
    : undefined;
  const showReport = task.status === "pending_review" ? Boolean(report || partial) : Boolean(report);
  return (
    <div className="tasks-waits" data-testid="desk-task-facts">
      {question ? (
        <Callout tone="warn" icon={<MessageCircleQuestion size={16} />} testId="desk-question">
          <p className="text-text">«{question}»</p>
          <QuickReplies desk={desk} now={now} onWords={onWords} />
        </Callout>
      ) : null}
      {task.status === "declined" ? (
        <Callout tone="danger" icon={<Ban size={16} />}>
          <span className="text-text">Отказ{declineReason ? `: ${declineReason}` : " без причины"}</span>
          {suggestion ? <span className="block text-muted">Предлагает передать: {suggestion.name}</span> : null}
        </Callout>
      ) : null}
      {request && isWorking(task.status) ? (
        <Callout tone="warn" icon={<Hourglass size={16} />}>
          <span className="text-text">
            Просит срок {untilWords(request.proposed, now)}
            {request.words ? ` · «${request.words}»` : ""}
          </span>
          <span className="block text-muted">{task.deadline ? `сейчас ${humanAqtobe(new Date(task.deadline), now)}` : "сейчас без срока"}</span>
        </Callout>
      ) : null}
      {task.status === "rework" ? (
        <Callout tone="muted" icon={<RotateCcw size={16} />}>
          <span className="text-text">На доработке — ждём новый отчёт</span>
        </Callout>
      ) : null}
      {showReport ? (
        <Callout tone={partial && task.status === "pending_review" ? "warn" : "muted"} icon={<FileText size={16} />} testId="desk-task-report">
          <span className="block whitespace-pre-line text-text [overflow-wrap:anywhere]">{report?.content ? `Отчёт: «${report.content.trim()}»` : "Отчёт без слов"}</span>
          {partial && task.status === "pending_review" ? <span className="block text-muted">Сдано не всё — что осталось, в отчёте</span> : null}
        </Callout>
      ) : null}
      {task.status === "revoked" ? (
        <Callout tone="muted" icon={<Undo2 size={16} />}>
          <span className="text-text">{task.passed_to ? passedWord(task.passed?.full_name) : TEXT.revoked}</span>
        </Callout>
      ) : null}
      {/* the panel's «Напомнить» does not say it was pressed: this line does, so it is not pressed twice */}
      {nudgedAt && isWorking(task.status) ? (
        <p className="tasks-nudged mt-3 flex items-center gap-1.5 text-[13px] leading-5 text-muted" data-testid="nudged">
          <Clock aria-hidden size={14} className="tasks-ico" />
          Напомнили <span className="nums">{humanAqtobe(new Date(nudgedAt), now)}</span>
        </p>
      ) : null}

      {photo ? (
        <div className="tasks-photo mt-3 max-w-[360px]" data-testid="desk-task-photo">
          <p className="text-[12px] leading-4 text-muted">Фото к отчёту</p>
          <PhotoMessage messageId={photo.id} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the task is about, under the buttons (D-203): the details, the director's own recording
 * and the words it was heard as — «Ваши слова»: on the desk the director reads his own panel.
 */
export function TaskAbout({ desk }: { desk: DeskTask }) {
  const task = desk.task as TaskWithPeople;
  const heard = task.source_transcript && task.source_transcript.trim() !== task.title.trim() ? task.source_transcript : null;
  if (!task.body && !task.source_audio_path && !heard) return null;
  return (
    <div className="tasks-about" data-testid="desk-task-about">
      {task.body ? <p className="tasks-body max-w-[76ch] whitespace-pre-line text-[14px] leading-5 [overflow-wrap:anywhere]">{task.body}</p> : null}
      {task.source_audio_path ? (
        <div className="tasks-audio mt-3 max-w-[360px]">
          <AudioOriginal path={task.source_audio_path} />
        </div>
      ) : null}
      {heard ? (
        <details className="tasks-transcript group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] leading-5 text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            Ваши слова
            <ChevronDown aria-hidden size={14} className="desk-chevron" />
          </summary>
          <blockquote className="-ml-3 mt-1 border-l-2 border-border pl-2.5 text-[13px] leading-5 text-muted">«{heard}»</blockquote>
        </details>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The director's buttons                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The reaction of D-133 at the desk's size: seven small faces in a row, the price in the hint —
 * the same `react_to_task` as the phone's row; a click on the lit one takes it off.
 */
export function DeskReactions({ taskId, pointsEnabled }: { taskId: string; pointsEnabled: boolean }) {
  const reactions = useTaskReactions();
  const prices = useReactionPrices();
  const react = useReactToTask();
  const current = reactions.data?.[taskId] ?? null;
  return (
    <div role="group" aria-label="Реакция на задачу" className="flex items-center gap-1" data-testid="reaction-bar">
      <span className="mr-1 text-[12px] leading-4 text-muted">Реакция</span>
      {REACTION_CODES.map((code) => {
        const lit = current === code;
        const price = pointsEnabled ? priceLabel(prices[code]) : null;
        return (
          <Tooltip key={code} label={`${REACTION_LABEL[code]}${price ? ` · ${price}` : ""}`}>
            <button
              type="button"
              aria-pressed={lit}
              aria-label={`${REACTION_LABEL[code]}${price ? `, ${price}` : ""}`}
              data-reaction={code}
              onClick={() => react.mutate({ taskId, code: lit ? null : code })}
              className="flex h-7 w-8 items-center justify-center rounded-[8px] border text-[14px] transition-colors duration-[140ms] hover:bg-surface-2"
              style={{ borderColor: lit ? "var(--gold)" : "transparent", background: lit ? "color-mix(in srgb, var(--gold) 14%, transparent)" : undefined }}
            >
              <span aria-hidden>{REACTION_GLYPH[code]}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** «Ещё» of a task: a word like the row's other words, at the end of its line. */
export const MORE_WORD =
  "ml-auto inline-flex h-9 items-center gap-1.5 rounded-[2px] px-3 text-[14px] font-medium leading-4 text-text transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/**
 * The director's buttons of this task — the task screen's own (`screenKeysFor`, D-187, D-203), each with the letter
 * that does it, the closing move filled — and «Ещё» (or «.») with everything the task allows as
 * a menu; the reaction row of D-133 under them on handed-in and accepted work.
 */
export function TaskKeys({ desk, me, now, pointsEnabled, scope }: { desk: DeskTask; me: Me; now: Date; pointsEnabled: boolean; scope?: () => Element | null }) {
  const task = desk.task as TaskWithPeople;
  const reactions = useTaskReactions();
  const reacted = Boolean(reactions.data?.[task.id]);
  const canReact = isReactable(task, me.userId) && showsReactionBar(task.status, reacted);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  // a holder whose pushes do not reach: «Позвонить» first, the number copied (owner, 2026-11-25)
  const reach = useCallFirst();
  const first = firstMoveOf(task, desk.keys, { noPush: reach.noPush, phone: reach.phoneOf(task.assignee_id) });
  const keys = first?.kind === "call" ? keysBesideCall(desk.keys) : desk.keys;
  const wide = keys[0] && first?.kind !== "call" ? wideLabelOf(keys[0], desk.signals.request, desk.signals.suggestion, now) : null;
  return (
    <div data-testid="desk-task-keys">
      <div className="flex flex-wrap items-center gap-2">
        {first?.kind === "call" ? <CallButton tel={first.tel} size="md" testId="task-action-call" /> : null}
        {keys.map((key, index) => {
          const cap = keyOfAction(key, desk.letters);
          const label = index === 0 && wide ? wide : ACTION_LABEL[key];
          const filled = index === 0 && first?.kind !== "call" && isPrimaryKey(key, desk.reason);
          return (
            // a word at the head of the line stands on the sheet's vertical, not its padding
            <span key={key} data-act-for={task.id} data-act={key === "reassign" || key === "handoff" ? "reassign handoff" : key === "extend" || key === "retime" ? "extend retime" : key} className={`inline-flex ${index === 0 && !filled && first?.kind !== "call" ? "-ml-2" : ""}`}>
              <MiniButton
                label={label}
                size="md"
                main={filled}
                filled={filled}
                keyCap={cap}
                title={cap ? `${label} · ${cap}` : label}
                onPress={() => desk.acts.press(key, task, { scope: scope?.() ?? null })}
                testId={`task-action-${key}`}
              />
            </span>
          );
        })}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAt)}
          title="Все действия · ."
          data-testid="desk-task-more"
          data-desk-more={task.id}
          // three moves fill the panel's line: the dots stay, the word would push «Ещё» onto a line of its own
          data-compact={keys.length + (first?.kind === "call" ? 1 : 0) >= 3 ? "" : undefined}
          onClick={(event) => setMenuAt(menuAt ? null : event.currentTarget)}
          className={MORE_WORD}
        >
          <Ellipsis aria-hidden size={16} className="tasks-ico tasks-more-dots" />
          <span className="tasks-more-word">Ещё</span>
        </button>
        <Menu open={Boolean(menuAt)} onClose={() => setMenuAt(null)} anchor={menuAt} items={desk.acts.menu(task)} align="end" width={280} label="Все действия" />
      </div>
      {first?.kind === "blind" ? (
        <p className="mt-1.5 text-[12px] leading-4 text-muted" data-testid="task-blind-hint">
          {BLIND_NUDGE_HINT}
        </p>
      ) : null}
      {canReact ? (
        <div className="mt-2.5">
          <DeskReactions taskId={task.id} pointsEnabled={pointsEnabled} />
        </div>
      ) : null}
    </div>
  );
}

/** The caret into the answer field of a task under `root` (O, «Ответить словами»). */
export function focusReply(root: Element | null) {
  focusComposer(root);
}
