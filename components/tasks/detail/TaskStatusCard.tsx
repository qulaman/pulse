"use client";

import type { CSSProperties } from "react";

import { ReactionBadge, ReactionBar } from "@/components/points/ReactionBar";
import { DeliveryStatus } from "@/components/tasks/DeliveryStatus";
import { QuickAnswers } from "@/components/tasks/director/QuickAnswers";
import { Icon } from "@/components/tasks/icons";
import { DirectorKeys, LifecycleNotes } from "@/components/tasks/list/DirectorTaskCard";
import { EmployeeKeys, type EmployeeAction } from "@/components/tasks/list/EmployeeKeys";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Face, Stepper } from "@/components/tasks/list/TaskList";
import { Note, RevokedNote, TimeRequestNote } from "@/components/tasks/TaskNotes";
import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import type { ReactionCode } from "@/lib/points/reactions";
import type { TaskDetailModel } from "@/lib/tasks/detail-model";
import { closedAtOf, stepsOf } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { DeskAction } from "@/lib/tasks/reasons";
import { reworkBannerText, TEXT, wordText } from "@/lib/tasks/status-text";
import { TONE_VAR } from "@/lib/tasks/tone";

import { WordBubble } from "./WordBubble";

/**
 * The status screen of one task at the head of its own screen (D-87): the stage in its colour,
 * «when», the title, who, the four steps, what waits on the task, the buttons of this reader's
 * role and how much time is left. The buttons are the same as on the cards, so a button means
 * the same thing on the list and here.
 */
export function TaskStatusCard({
  task,
  model,
  now,
  keys,
  reaction,
  reactionPoints,
  canReact,
  pointsEnabled,
  onAnswer,
  onDirectorKey,
  onEmployeeKey,
}: {
  task: TaskWithPeople;
  model: TaskDetailModel;
  now: Date;
  /** The director's keys of this task (`cardKeysFor`); none for anybody else. */
  keys: DeskAction[];
  /** D-133: the director's reaction — a gold badge for the assignee. */
  reaction: ReactionCode | null;
  reactionPoints: number | null;
  /** The director's row of seven reactions under the keys. */
  canReact: boolean;
  pointsEnabled: boolean;
  /** A quick answer to the employee's question; `null` words open the answer sheet. */
  onAnswer: (text: string | null, deadlineIso?: string) => void;
  onDirectorKey: (key: DeskAction) => void;
  onEmployeeKey: (action: EmployeeAction) => void;
}) {
  const { isDirector, mine, question, request, suggestion, waiting, tone, closed, urgentNow } = model;
  const person = isDirector ? task.assignee?.full_name : task.author?.full_name;

  return (
    <article
      data-testid="task-screen"
      data-status={task.status}
      data-reacted={reaction ? true : undefined}
      className="status-screen mt-1 rounded-[22px] px-4 pb-3.5 pt-3.5"
      style={{ "--tone": TONE_VAR[tone] } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <StatusGlyph status={task.status} overdue={model.overdue} size={18} />
          <span className="truncate font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color: TONE_VAR[tone] }}>
            {model.word}
          </span>
        </span>
        {/* «when»: the deadline while it matters, the closing time once it is over */}
        <span
          className="nums inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4"
          style={{
            color: closed
              ? "var(--text-muted)"
              : urgentNow
                ? "var(--warn)"
                : // handed-in work has met its deadline: the date stays, the alarm goes — as in the list (D-173)
                  task.deadline && task.status !== "pending_review"
                  ? TONE_VAR[model.deadlineTone === "accent" ? "muted" : model.deadlineTone]
                  : "var(--text-muted)",
            borderColor: "color-mix(in srgb, currentColor 35%, transparent)",
          }}
        >
          {/* a tick only for work accepted: a refusal or a recall is not «done» (D-173) */}
          <Icon
            name={
              closed
                ? task.status === "done"
                  ? "check"
                  : task.status === "declined"
                    ? "hand"
                    : task.passed_to
                      ? "swap"
                      : "undo"
                : urgentNow
                  ? "flame"
                  : "clock"
            }
            size={13}
          />
          {closed
            ? humanAqtobe(new Date(closedAtOf(task)), now)
            : task.deadline
              ? humanAqtobe(new Date(task.deadline), now)
              : urgentNow
                ? TEXT.urgent
                : TEXT.noDeadline}
        </span>
      </div>

      <h1 className="mt-3 font-display text-[23px] font-bold leading-[29px] tracking-[-0.02em]">{task.title}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-[19px] text-muted">
        {person ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Face name={person} size={22} />
            {/* «Поручил» takes the name as it is: «от Тимур Сапаров» wanted a declension (D-173) */}
            <span className="truncate text-text/90">{isDirector ? person : `Поручил ${person}`}</span>
          </span>
        ) : null}
        {/* when it was handed out is the first step below; only «уйдёт» is news here */}
        {task.status === "scheduled" && task.scheduled_send_at ? (
          <span className="nums">· уйдёт {humanAqtobe(new Date(task.scheduled_send_at), now)}</span>
        ) : null}
        {task.priority === "high" && task.deadline && !closed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
            <Icon name="flame" size={12} />
            {TEXT.urgent}
          </span>
        ) : null}
      </div>

      {!isDirector && reaction ? <ReactionBadge code={reaction} points={reactionPoints} className="mt-3" /> : null}

      <div className="mt-4">
        {/* the assignee hears the deadline twice — the pill above and «осталось» below; a third time
            under the station («Принять до 18:09») read as a deadline to accept by (D-173) */}
        {/* the holder reads a new one as «Ждёт вас», not «В работе» (D-173) */}
        <Stepper steps={stepsOf(task, now, { declinedAt: model.declinedAt, forAssignee: mine })} now={now} deadline={mine ? null : task.deadline} />
      </div>

      {/* what waits on this task: the employee's question, a refusal, a return, a recall */}
      {isDirector && question ? (
        <div className="mt-1">
          <Note tone="warn" icon={<Icon name="question" size={15} />}>
            «{question}»
          </Note>
          <QuickAnswers
            question={question}
            deadline={task.deadline}
            now={now}
            onAnswer={(answer) => onAnswer(answer.text, answer.deadlineIso)}
            onWords={() => onAnswer(null)}
          />
        </div>
      ) : null}
      {model.myQuestion ? (
        <Note tone="warn" icon={<Icon name="question" size={15} />}>
          Вопрос директору: «{model.myQuestion}» · ждёт ответа
        </Note>
      ) : null}
      {!isDirector && request ? <TimeRequestNote proposed={request.proposed} now={now} /> : null}
      {task.status === "declined" ? (
        <Note tone="danger" icon={<Icon name="hand" size={15} />}>
          {isDirector
            ? `Отказ${model.declineReason ? `: ${model.declineReason}` : ""}`
            : `Отказ отправлен директору${suggestion ? ` · вы предложили: ${shortName(suggestion.name)}` : ""}`}
        </Note>
      ) : null}
      {task.status === "rework" ? (
        <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
          {isDirector ? (
            "На доработке — ждём новый отчёт"
          ) : (
            // what to fix, in the director's words, up to three lines; the whole of it stays in the thread
            <span className="line-clamp-3" data-testid="rework-reason">
              {reworkBannerText(model.reworkComment)}
            </span>
          )}
        </Note>
      ) : null}
      {task.status === "revoked" ? <RevokedNote task={task} /> : null}
      {waiting ? (
        <WordBubble
          name={waiting.message.sender?.full_name ?? task.author?.full_name ?? "Директор"}
          text={wordText(waiting.message)}
          at={waiting.message.created_at}
          now={now}
          unread={waiting.unread}
          testId="task-word"
        />
      ) : null}
      {isDirector ? (
        <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={model.partial} nudgedAt={model.nudgedAt} now={now} />
      ) : null}

      {/* the buttons of this role — the same as on the card */}
      {isDirector ? <DirectorKeys keys={keys} reason={model.reason} request={request} suggestion={suggestion} now={now} onPress={onDirectorKey} /> : null}
      {canReact ? <ReactionBar taskId={task.id} pointsEnabled={pointsEnabled} className="mt-3" /> : null}
      {/* only the assignee answers: a manager opening a subordinate's task reads it, no more */}
      {mine ? (
        task.status === "pending_review" ? (
          // one line: when it was handed in is the station «Сдана» and the foot below — said a third
          // time here it wraps into two broken columns (D-173)
          <p className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-surface-2/70 px-3 text-[14px] text-muted">
            <Icon name="clock" size={16} />
            <span>{TEXT.underReview}</span>
          </p>
        ) : (
          <EmployeeKeys status={task.status} onPress={onEmployeeKey} />
        )
      ) : null}

      {/* the foot: how much time is left, and — for the director — whether the push was seen */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <p className="text-[13px] font-semibold leading-[18px]" style={{ color: TONE_VAR[model.left.tone] }} data-testid="time-left">
          {model.left.text}
        </p>
        {model.left.used !== null ? (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full origin-left rounded-full"
              style={{ transform: `scaleX(${Math.max(0.02, model.left.used)})`, background: TONE_VAR[model.left.tone] }}
            />
          </span>
        ) : null}
        {isDirector && task.status !== "scheduled" && task.status !== "revoked" ? (
          <DeliveryStatus taskId={task.id} status={task.status} assigneeId={task.assignee_id} onSendNow={() => onDirectorKey("sendNow")} />
        ) : null}
      </div>
    </article>
  );
}
