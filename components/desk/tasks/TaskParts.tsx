"use client";

import { useState, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Menu } from "@/components/desk/ui/Menu";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { ruleLine } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { useTaskDelivery } from "@/components/tasks/DeliveryStatus";
import { Icon, type IconName } from "@/components/tasks/desk/icons";
import { ACTION_LABEL, allActionsFor, isPrimaryKey, wideLabelOf } from "@/components/tasks/list/DirectorTaskCard";
import { PhotoMessage } from "@/components/tasks/PhotoMessage";
import { humanAqtobe } from "@/lib/ai/time";
import { useReactionPrices, useReactToTask, useTaskReactions } from "@/lib/points/game";
import { isReactable, priceLabel, REACTION_CODES, REACTION_GLYPH, REACTION_LABEL, showsReactionBar } from "@/lib/points/reactions";
import { answersFor, wantsWords } from "@/lib/tasks/answers";
import { heldLine } from "@/lib/tasks/held";
import { isWorking, passedWord, untilWords } from "@/lib/tasks/lifecycle";
import { closedAtOf, stepsOf, timeLeft, type StepState } from "@/lib/tasks/overview";
import type { DeliveryRow } from "@/lib/tasks/receipts";
import type { Me, TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, TEXT } from "@/lib/tasks/status-text";

import { deliveryLine, keyOfAction, stageOf, type Line } from "@/lib/desk/tasks";
import { focusComposer } from "./DeskThread";
import { MiniButton } from "./RowMoves";
import type { DeskTask } from "./useDeskTask";

/** A line of words with its dot, in its tone — «не открывал с 9:14». */
export function ToneLine({ line, testId, className = "", children }: { line: Line; testId?: string; className?: string; children?: ReactNode }) {
  const color = line.tone ? TONE_VAR[line.tone] : "var(--text-muted)";
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`} style={{ color }} data-testid={testId}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate" title={line.text}>
        {line.text}
      </span>
      {children}
    </span>
  );
}

/**
 * «Доставка» of a table row (принцип 8): the push receipt of a task not yet taken comes from the
 * table's one query for all such rows (`useTaskReceipts`). Neutral words: a row carries two
 * colours at most — its stage ring and a missed deadline (D-154).
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
    <Tooltip label={label} keys={keys} side="bottom">
      <button
        type="button"
        data-act-for={taskId}
        data-act={act}
        data-testid={testId}
        onClick={(event) => onPress(event.currentTarget)}
        className="-mx-1.5 inline-flex min-w-0 items-center gap-1 rounded-[7px] px-1.5 py-0.5 transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {children}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 text-muted/70">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </Tooltip>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-[3px] text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] leading-5">{children}</dd>
    </>
  );
}

/** What waits for the morning with «отправить сейчас» (D-129), else the push receipt or «принял». */
function Receipt({ task, now, onSendNow }: { task: TaskWithPeople; now: Date; onSendNow: () => void }) {
  const asks = task.status !== "scheduled" && task.status !== "revoked";
  const delivery = useTaskDelivery(asks ? task.id : null, task.assignee_id);
  const held = delivery.data ? heldLine(delivery.data.held, now) : null;
  if (held) {
    return (
      <span className="flex items-center gap-1.5 text-muted" data-testid="desk-receipt">
        {held} ·
        <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={onSendNow} data-testid="send-now">
          отправить сейчас
        </button>
      </span>
    );
  }
  const line = deliveryLine(task, delivery.data?.receipt, now);
  return line ? <ToneLine line={line} testId="desk-receipt" /> : <span className="text-muted/60">—</span>;
}

const STEP_TONE: Record<StepState, string> = {
  done: "var(--ok)",
  current: "var(--accent)",
  warn: "var(--warn)",
  bad: "var(--danger)",
  todo: "var(--border)",
};

/** The four steps of a task in one quiet line (выдана → в работе → сдана → принята), each with its time. */
function Path({ desk, now }: { desk: DeskTask; now: Date }) {
  const task = desk.task as TaskWithPeople;
  const steps = stepsOf(task, now, { declinedAt: desk.signals.declinedAt });
  return (
    <ol className="grid grid-cols-4 gap-1" data-testid="task-steps">
      {steps.map((step) => {
        const pending = step.state === "current" || step.state === "warn" || step.state === "bad";
        const due = pending && !step.at && task.deadline && step.key !== "closed" ? task.deadline : null;
        const time = step.at ? humanAqtobe(new Date(step.at), now).replace(/^сегодня /, "") : due ? `до ${humanAqtobe(new Date(due), now).replace(/^сегодня /, "")}` : "";
        return (
          <li key={step.key} className="min-w-0">
            <span aria-hidden className="block h-[3px] rounded-full" style={{ background: STEP_TONE[step.state], opacity: step.state === "todo" ? 0.8 : 1 }} />
            <span className={`mt-1 block truncate text-[12px] leading-4 ${pending ? "font-semibold" : step.state === "todo" ? "text-muted" : "text-text/85"}`} style={pending ? { color: STEP_TONE[step.state] } : undefined}>
              {step.label}
            </span>
            <span className="nums block h-4 truncate text-[11px] leading-4 text-muted">{time}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The head of a task at the desk (D-154 wave 3): who holds it — a click passes it on — and the
 * stage; the title; the fields a director changes with one click (the deadline: a popover with
 * the quick choices and a month); the receipt (принцип 8), the repeat, how much time is left, and
 * the path in four steps. `large` — the stack of «Разобрать», whose headline says the stage.
 */
export function TaskHead({ desk, now, large = false, scope }: { desk: DeskTask; now: Date; large?: boolean; scope?: () => Element | null }) {
  const task = desk.task as TaskWithPeople;
  const stage = stageOf(task, desk.reason, now);
  const closed = task.status === "done" || task.status === "revoked";
  const flags = { request: Boolean(desk.signals.request), suggestion: Boolean(task.status === "declined" && desk.signals.suggestion) };
  const all = allActionsFor(task, flags);
  const canPass = all.includes("reassign");
  const canDate = all.includes("extend") || all.includes("retime");
  const due = deadlineLabel(task, now);
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const left = timeLeft(task, now);
  const from = (target: HTMLElement) => ({ at: target, scope: scope?.() ?? null });
  return (
    <header>
      {/* the panel's «×» stands in the corner: the first line leaves it room */}
      <div className={`flex items-center gap-3 ${large ? "" : "pr-9"}`}>
        <div className="min-w-0 flex-1">
          {canPass ? (
            <FieldButton label="Передать другому" keys={["T"]} taskId={task.id} act="reassign handoff" onPress={(target) => desk.acts.press("reassign", task, from(target))} testId="desk-field-assignee">
              <PersonCell name={task.assignee?.full_name} />
            </FieldButton>
          ) : (
            <PersonCell name={task.assignee?.full_name} />
          )}
        </div>
        {large ? null : (
          <span className="shrink-0 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.08em]" style={{ color: TONE_VAR[stage.tone] }} data-testid="desk-task-stage">
            {stage.text}
          </span>
        )}
      </div>
      <h2 className={`mt-3 font-display font-bold tracking-[-0.01em] [overflow-wrap:anywhere] ${large ? "text-[24px] leading-[30px]" : "text-[18px] leading-6"}`}>{task.title}</h2>

      <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5" data-testid="desk-task-fields">
        <Field label={closed ? (task.status === "done" ? "Принята" : "Закрыта") : "Срок"}>
          {closed ? (
            <span className="nums">{humanAqtobe(new Date(closedAtOf(task)), now)}</span>
          ) : canDate ? (
            <FieldButton label="Изменить срок" keys={["D"]} taskId={task.id} act="extend retime" onPress={(target) => desk.acts.press("extend", task, from(target))} testId="desk-field-deadline">
              <span className="nums" style={{ color: due.overdue ? "var(--danger)" : urgentNow ? "var(--warn)" : undefined }}>
                {urgentNow ? TEXT.urgent : due.text}
              </span>
            </FieldButton>
          ) : (
            <span className="nums" style={{ color: due.overdue ? "var(--danger)" : undefined }}>
              {due.text}
            </span>
          )}
          {task.priority === "high" && task.deadline && !closed ? <span className="text-warn">· {TEXT.urgent}</span> : null}
          {!closed && !large && left.text !== TEXT.noDeadline ? (
            <span className="text-[12px] font-semibold" style={{ color: TONE_VAR[left.tone] }}>
              {left.text}
            </span>
          ) : null}
        </Field>
        {task.status === "scheduled" && task.scheduled_send_at ? (
          <Field label="Уйдёт">
            <span className="nums">{humanAqtobe(new Date(task.scheduled_send_at), now)}</span>
          </Field>
        ) : null}
        {task.status !== "revoked" && task.status !== "scheduled" ? (
          <Field label="Доставка">
            <Receipt task={task} now={now} onSendNow={() => desk.acts.press("sendNow", task)} />
          </Field>
        ) : null}
        {desk.rule ? (
          <Field label="Повтор">
            <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="desk-task-repeat">
              <Icon name="repeat" size={13} />
              <span className="truncate">{ruleLine(desk.rule)}</span>
              {desk.rule.is_active ? null : <span className="text-muted">· остановлен</span>}
            </span>
          </Field>
        ) : null}
      </dl>

      <div className="mt-3">
        <Path desk={desk} now={now} />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* What was said and what waits                                                 */
/* -------------------------------------------------------------------------- */

/** One note of what waits on a task, at the desk's density: an icon in its tone, the words, maybe a way on. */
export function Callout({ tone, icon, children, testId }: { tone: Tone; icon: IconName; children: ReactNode; testId?: string }) {
  const color = TONE_VAR[tone];
  return (
    <div
      className="mt-3 flex items-start gap-2.5 rounded-[10px] border-l-2 py-2 pl-3 pr-3 text-[13px] leading-5"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 7%, transparent)` }}
      data-testid={testId}
    >
      <span className="mt-[3px] shrink-0" style={{ color }}>
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
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
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-[8px] border px-2 text-[12px] font-semibold leading-4 transition-colors duration-[120ms]";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="quick-answers">
      {answers.map((answer, index) => (
        <button
          key={answer.label}
          type="button"
          onClick={() => desk.acts.answer(task, answer.text, answer.deadlineIso)}
          title={`Ответить «${answer.text}» (${index + 1})`}
          className={`${chip} border-border bg-surface-2 text-text hover:border-muted/50`}
          data-quick-answer={index + 1}
        >
          <span aria-hidden className="nums rounded-[4px] bg-bg/60 px-1 text-[10px] leading-[14px] text-muted">
            {index + 1}
          </span>
          {answer.label}
        </button>
      ))}
      <button type="button" onClick={onWords} className={`${chip} ${words ? "border-accent/35 bg-accent/12 text-accent hover:bg-accent/20" : "border-transparent text-muted hover:text-text"}`}>
        Ответить словами <Kbd>O</Kbd>
      </button>
    </div>
  );
}

/**
 * What was said and what waits: the description, the employee's question with the one-click
 * answers, a refusal, a return, a recall, the notes of D-128, the photo of the handed-in work,
 * the original voice and its transcript.
 */
export function TaskFacts({ desk, now, onWords }: { desk: DeskTask; now: Date; onWords: () => void }) {
  const task = desk.task as TaskWithPeople;
  const { question, request, suggestion, declineReason, partial, nudgedAt } = desk.signals;
  const photo =
    task.status === "pending_review" || task.status === "done"
      ? [...(desk.messages ?? [])].reverse().find((message) => message.type === "photo" && message.sender_id === task.assignee_id)
      : undefined;
  return (
    <div data-testid="desk-task-facts">
      {task.body ? <p className="mt-4 whitespace-pre-line text-[14px] leading-5 text-text/90 [overflow-wrap:anywhere]">{task.body}</p> : null}

      {question ? (
        <Callout tone="warn" icon="question" testId="desk-question">
          <p className="text-text">«{question}»</p>
          <QuickReplies desk={desk} now={now} onWords={onWords} />
        </Callout>
      ) : null}
      {task.status === "declined" ? (
        <Callout tone="danger" icon="hand">
          <span className="text-text">Отказ{declineReason ? `: ${declineReason}` : " без причины"}</span>
          {suggestion ? <span className="block text-muted">Предлагает передать: {suggestion.name}</span> : null}
        </Callout>
      ) : null}
      {request && isWorking(task.status) ? (
        <Callout tone="warn" icon="clock">
          <span className="text-text">
            Просит срок {untilWords(request.proposed, now)}
            {request.words ? ` · «${request.words}»` : ""}
          </span>
          <span className="block text-muted">{task.deadline ? `сейчас ${humanAqtobe(new Date(task.deadline), now)}` : "сейчас без срока"}</span>
        </Callout>
      ) : null}
      {task.status === "rework" ? (
        <Callout tone="warn" icon="rotate">
          <span className="text-text">На доработке — ждём новый отчёт</span>
        </Callout>
      ) : null}
      {partial && task.status === "pending_review" ? (
        <Callout tone="warn" icon="hand">
          <span className="text-text">Сдано не всё — что осталось, в отчёте</span>
        </Callout>
      ) : null}
      {task.status === "revoked" ? (
        <Callout tone="muted" icon={task.passed_to ? "swap" : "undo"}>
          <span className="text-text/85">{task.passed_to ? passedWord(task.passed?.full_name) : TEXT.revoked}</span>
        </Callout>
      ) : null}
      {nudgedAt && isWorking(task.status) ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] leading-4 text-muted" data-testid="nudged">
          <Icon name="bell" size={12} />
          Напомнили <span className="nums">{humanAqtobe(new Date(nudgedAt), now)}</span>
        </p>
      ) : null}

      {photo ? (
        <div className="mt-3 max-w-[360px]" data-testid="desk-task-photo">
          <p className="text-[12px] leading-4 text-muted">Фото к отчёту</p>
          <PhotoMessage messageId={photo.id} />
        </div>
      ) : null}

      {task.source_audio_path ? (
        <div className="mt-3 max-w-[360px]">
          <AudioOriginal path={task.source_audio_path} />
        </div>
      ) : null}
      {task.source_transcript && task.source_transcript.trim() !== task.title.trim() ? (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] leading-4 text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <Icon name="quote" size={13} />
            {TEXT.transcriptSpoiler}
            <span aria-hidden className="transition-transform duration-[120ms] group-open:rotate-180">
              ▾
            </span>
          </summary>
          <blockquote className="mt-2 border-l-2 pl-3 text-[13px] italic leading-5 text-muted" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
            «{task.source_transcript}»
          </blockquote>
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
              className="flex h-7 w-8 items-center justify-center rounded-[8px] border text-[15px] transition-colors duration-[120ms] hover:bg-surface-2"
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

/**
 * The director's buttons of this task — the phone card's own (`cardKeysFor`), each with the letter
 * that does it, the closing move filled — and «Ещё» (or «.») with everything the task allows as
 * a menu; the reaction row of D-133 under them on handed-in and accepted work.
 */
export function TaskKeys({ desk, me, now, pointsEnabled, scope }: { desk: DeskTask; me: Me; now: Date; pointsEnabled: boolean; scope?: () => Element | null }) {
  const task = desk.task as TaskWithPeople;
  const reactions = useTaskReactions();
  const reacted = Boolean(reactions.data?.[task.id]);
  const canReact = isReactable(task, me.userId) && showsReactionBar(task.status, reacted);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const wide = desk.keys[0] ? wideLabelOf(desk.keys[0], desk.signals.request, desk.signals.suggestion, now) : null;
  return (
    <div data-testid="desk-task-keys">
      <div className="flex flex-wrap items-center gap-1.5">
        {desk.keys.map((key, index) => {
          const cap = keyOfAction(key, desk.letters);
          const label = index === 0 && wide ? wide : ACTION_LABEL[key];
          const filled = index === 0 && isPrimaryKey(key, desk.reason);
          return (
            <span key={key} data-act-for={task.id} data-act={key === "reassign" || key === "handoff" ? "reassign handoff" : key === "extend" || key === "retime" ? "extend retime" : key} className="inline-flex">
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
          onClick={(event) => setMenuAt(menuAt ? null : event.currentTarget)}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-surface-2 px-3 font-display text-[14px] font-semibold leading-4 text-text transition-colors duration-[120ms] hover:border-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Ещё
          <span aria-hidden className="rounded-[4px] bg-bg/60 px-1.5 text-[12px] font-bold leading-[14px] text-muted">
            .
          </span>
        </button>
        <Menu open={Boolean(menuAt)} onClose={() => setMenuAt(null)} anchor={menuAt} items={desk.acts.menu(task)} align="end" width={280} label="Все действия" />
      </div>
      {canReact ? (
        <div className="mt-2.5">
          <DeskReactions taskId={task.id} pointsEnabled={pointsEnabled} />
        </div>
      ) : null}
    </div>
  );
}

/** «.» on a task: its «Ещё» opens as if clicked. */
export function openMoreOf(taskId: string, root: Element | null) {
  root?.querySelector<HTMLElement>(`[data-desk-more="${CSS.escape(taskId)}"]`)?.click();
}

/** The caret into the answer field of a task under `root` (O, «Ответить словами»). */
export function focusReply(root: Element | null) {
  focusComposer(root);
}
