"use client";

import type { ReactNode } from "react";

import { PersonCell } from "@/components/desk/ui/PersonCell";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { ReactionBar } from "@/components/points/ReactionBar";
import { ruleLine } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { useTaskDelivery } from "@/components/tasks/DeliveryStatus";
import { Icon } from "@/components/tasks/desk/icons";
import { QuickAnswers } from "@/components/tasks/desk/QuickAnswers";
import { DirectorKeys, LifecycleNotes } from "@/components/tasks/list/DirectorTaskCard";
import { Note, Stepper } from "@/components/tasks/list/TaskList";
import { PhotoMessage } from "@/components/tasks/PhotoMessage";
import { ThreadView } from "@/components/tasks/thread/ThreadView";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { useTaskReactions } from "@/lib/points/game";
import { isReactable, showsReactionBar } from "@/lib/points/reactions";
import { heldLine } from "@/lib/tasks/held";
import { passedWord } from "@/lib/tasks/lifecycle";
import { closedAtOf, stepsOf, timeLeft } from "@/lib/tasks/overview";
import type { DeliveryRow } from "@/lib/tasks/receipts";
import type { Me, TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, TEXT } from "@/lib/tasks/status-text";

import { deliveryLine, stageOf, type Line } from "@/lib/desk/tasks";
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
 * table's one query for all such rows (`useTaskReceipts`); after «Принял» — when it was taken.
 */
export function DeliveryCell({ task, receipt, now }: { task: TaskWithPeople; receipt: DeliveryRow | undefined; now: Date }) {
  const line = deliveryLine(task, receipt ?? null, now);
  if (!line) return <span className="text-muted">—</span>;
  return <ToneLine line={line} className="text-[13px]" testId="desk-delivery" />;
}

/**
 * The receipt under a task's head: what waits for the morning with «отправить сейчас» (D-129),
 * else the push receipt or «принял». Its line is reserved, so the head does not grow.
 */
function Receipt({ task, now, onSendNow }: { task: TaskWithPeople; now: Date; onSendNow: () => void }) {
  const asks = task.status !== "scheduled" && task.status !== "revoked";
  const delivery = useTaskDelivery(asks ? task.id : null, task.assignee_id);
  const held = delivery.data ? heldLine(delivery.data.held, now) : null;
  if (held) {
    return (
      <p className="mt-2 flex h-5 items-center gap-1.5 text-[13px] leading-5 text-muted" data-testid="desk-receipt">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted" />
        {held} ·
        <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={onSendNow} data-testid="send-now">
          отправить сейчас
        </button>
      </p>
    );
  }
  const line = deliveryLine(task, delivery.data?.receipt, now);
  return <p className="mt-2 flex h-5 items-center text-[13px] leading-5">{line ? <ToneLine line={line} testId="desk-receipt" /> : null}</p>;
}

/**
 * The head of a task on the desk: who and the stage, the title, «срок» and the repeat, the
 * receipt, the four steps across, and how much time is left. `large` — the stack of «Разобрать».
 */
export function TaskHead({ desk, now, large = false }: { desk: DeskTask; now: Date; large?: boolean }) {
  const task = desk.task as TaskWithPeople;
  const stage = stageOf(task, desk.reason, now);
  const closed = task.status === "done" || task.status === "revoked";
  const due = deadlineLabel(task, now);
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const left = timeLeft(task, now);
  return (
    <header>
      {/* the panel's «×» stands in the corner: the first line leaves it room */}
      <div className={`flex items-center gap-3 ${large ? "" : "pr-9"}`}>
        <div className="min-w-0 flex-1">
          <PersonCell name={task.assignee?.full_name} />
        </div>
        <span className="shrink-0 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.08em]" style={{ color: TONE_VAR[stage.tone] }} data-testid="desk-task-stage">
          {stage.text}
        </span>
      </div>
      <h2 className={`mt-3 font-display font-bold tracking-[-0.01em] ${large ? "text-[24px] leading-[30px]" : "text-[18px] leading-6"}`}>{task.title}</h2>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted">
        <span className="nums">
          {closed ? (
            <>
              {task.status === "done" ? "принята" : "закрыта"} {humanAqtobe(new Date(closedAtOf(task)), now)}
            </>
          ) : (
            <>
              срок{" "}
              <span style={{ color: due.overdue ? "var(--danger)" : urgentNow ? "var(--warn)" : "var(--text)" }}>{urgentNow ? TEXT.urgent : due.text}</span>
            </>
          )}
        </span>
        {task.status === "scheduled" && task.scheduled_send_at ? <span className="nums">· уйдёт {humanAqtobe(new Date(task.scheduled_send_at), now)}</span> : null}
        {task.priority === "high" && task.deadline && !closed ? <span className="text-warn">· {TEXT.urgent}</span> : null}
        {desk.rule ? (
          <span className="inline-flex min-w-0 items-center gap-1" data-testid="desk-task-repeat">
            · <Icon name="repeat" size={13} />
            <span className="truncate">{ruleLine(desk.rule)}</span>
          </span>
        ) : null}
      </p>
      <Receipt task={task} now={now} onSendNow={() => desk.controls.press("sendNow", task)} />
      <div className="mt-3">
        <Stepper steps={stepsOf(task, now, { declinedAt: desk.signals.declinedAt })} now={now} deadline={task.deadline} />
      </div>
      <p className="mt-2 text-[12px] font-semibold leading-4" style={{ color: TONE_VAR[left.tone] }}>
        {left.text}
      </p>
    </header>
  );
}

/**
 * What was said and what waits: the description, the employee's question with the one-tap
 * answers, a refusal, a return, a recall, the notes of D-128, the original voice and the
 * transcript, and the photo of the handed-in work.
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
      {task.body ? <p className="mt-4 whitespace-pre-line text-[14px] leading-5 text-text/90">{task.body}</p> : null}

      {question ? (
        <div>
          <Note tone="warn" icon={<Icon name="question" size={15} />}>
            «{question}»
          </Note>
          <QuickAnswers question={question} deadline={task.deadline} now={now} onAnswer={(answer) => desk.controls.answer(task, answer.text, answer.deadlineIso)} onWords={onWords} />
        </div>
      ) : null}
      {task.status === "declined" ? (
        <Note tone="danger" icon={<Icon name="hand" size={15} />}>
          Отказ{declineReason ? `: ${declineReason}` : ""}
        </Note>
      ) : null}
      {task.status === "rework" ? (
        <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
          На доработке — ждём новый отчёт
        </Note>
      ) : null}
      {task.status === "revoked" ? (
        <Note tone="muted" icon={<Icon name={task.passed_to ? "swap" : "undo"} size={15} />}>
          {task.passed_to ? passedWord(task.passed?.full_name) : TEXT.revoked}
        </Note>
      ) : null}
      <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={partial} nudgedAt={nudgedAt} now={now} />

      {photo ? (
        <div className="mt-3" data-testid="desk-task-photo">
          <p className="text-[12px] leading-4 text-muted">Фото к отчёту</p>
          <PhotoMessage messageId={photo.id} />
        </div>
      ) : null}

      {task.source_audio_path ? (
        <div className="mt-2">
          <AudioOriginal path={task.source_audio_path} />
        </div>
      ) : null}
      {task.source_transcript && task.source_transcript.trim() !== task.title.trim() ? (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] leading-4 text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <Icon name="quote" size={14} />
            {TEXT.transcriptSpoiler}
            <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">
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

/**
 * The director's buttons of this task — the phone's own (`cardKeysFor` + `DirectorKeys`), in the
 * desk's small size — and «⋯» with every move the task allows (продлить, напомнить,
 * переназначить, выдать снова, отозвать, удалить). The reaction row of D-133 under them.
 */
export function TaskKeys({ desk, me, now, pointsEnabled }: { desk: DeskTask; me: Me; now: Date; pointsEnabled: boolean }) {
  const task = desk.task as TaskWithPeople;
  const reactions = useTaskReactions();
  const reacted = Boolean(reactions.data?.[task.id]);
  const canReact = isReactable(task, me.userId) && showsReactionBar(task.status, reacted);
  return (
    <div data-testid="desk-task-keys">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 [&>div]:mt-0 [&_button]:min-h-[36px]">
          <DirectorKeys
            keys={desk.keys}
            reason={desk.reason}
            request={desk.signals.request}
            suggestion={desk.signals.suggestion}
            now={now}
            onPress={(key) => desk.controls.press(key, task)}
          />
        </div>
        <Button size="sm" variant="secondary" aria-label="Все действия" title="Все действия" className="!px-3" onClick={() => desk.controls.more(task)} data-testid="desk-task-more">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5.5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="18.5" cy="12" r="1.7" />
          </svg>
        </Button>
      </div>
      {canReact ? <ReactionBar taskId={task.id} pointsEnabled={pointsEnabled} className="mt-3" /> : null}
    </div>
  );
}

/** The thread of a task in the desk's flow: the composer is part of the column (`compact`), receipts are the director's. */
export function TaskThreadPane({ desk, me }: { desk: DeskTask; me: Me }) {
  const task = desk.task as TaskWithPeople;
  return (
    <ThreadView
      taskId={task.id}
      companyId={me.companyId}
      messages={desk.messages}
      loading={desk.messagesLoading}
      userId={me.userId}
      actions={desk.controls.actions}
      isDirector
      compact
      // taken back: nobody is on the other end of this thread any more (D-142)
      closedNote={task.status === "revoked" ? "Задача отозвана — переписка закрыта" : null}
    />
  );
}

/**
 * The caret into the reply field of a task's thread under `root` — «Ответить» on the desk is the
 * thread's own field (KeyO, a question's «Ответить словами…»). The thread may still be landing:
 * a few tries, then nothing.
 */
export function focusReply(root: HTMLElement | null, tries = 8) {
  const field = root?.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea');
  if (field) {
    field.focus({ preventScroll: false });
    field.scrollIntoView({ block: "nearest" });
    return;
  }
  if (tries > 0) setTimeout(() => focusReply(root, tries - 1), 120);
}
