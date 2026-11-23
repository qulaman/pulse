"use client";

import type { CSSProperties } from "react";

import { ReactionBadge, ReactionBar } from "@/components/points/ReactionBar";
import { DeliveryStatus } from "@/components/tasks/DeliveryStatus";
import { QuickAnswers } from "@/components/tasks/director/QuickAnswers";
import { Icon } from "@/components/tasks/icons";
import { DirectorKeys, LifecycleNotes, SCREEN_LABEL } from "@/components/tasks/list/DirectorTaskCard";
import { EmployeeKeys, type EmployeeAction } from "@/components/tasks/list/EmployeeKeys";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Face } from "@/components/tasks/list/TaskList";
import { Note, RevokedNote, TimeRequestNote } from "@/components/tasks/TaskNotes";
import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import type { ReactionCode } from "@/lib/points/reactions";
import type { TaskDetailModel } from "@/lib/tasks/detail-model";
import { isWorking } from "@/lib/tasks/lifecycle";
import { closedAtOf, stepsOf, timeLeft } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { DeskAction } from "@/lib/tasks/reasons";
import { reworkBannerText, TEXT, wordText } from "@/lib/tasks/status-text";
import { TONE_VAR } from "@/lib/tasks/tone";

import { DeadlineCapsule } from "./DeadlineCapsule";
import { TaskPath, type PathClock } from "./TaskPath";
import { WordBubble } from "./WordBubble";

/**
 * The status screen of one task at the head of its own screen (D-87): the stage in its colour,
 * «when» (the capsule that also changes it, D-187), the title, who, the four steps with the time
 * gone, what waits on the task and the buttons of this reader's role. The buttons are the same as on the cards, so a button means
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
  onDeadline,
}: {
  task: TaskWithPeople;
  model: TaskDetailModel;
  now: Date;
  /** The director's keys of this task (`screenKeysFor`); none for anybody else. */
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
  /** A tap on the deadline capsule (D-187): the director moves it, the assignee asks for time. */
  onDeadline?: () => void;
}) {
  const { isDirector, mine, question, request, suggestion, waiting, tone, from, to } = model;

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
        {/* «when» — the one place the deadline is said, and where it is changed (D-187) */}
        <WhenCapsule task={task} model={model} now={now} onPress={onDeadline} />
      </div>

      <h1 className="mt-3 font-display text-[23px] font-bold leading-[29px] tracking-[-0.02em]">{task.title}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-[19px] text-muted">
        {/* the people without a word for them (D-187): who gave it → who does it; the reader's own
            side is left out — the director's own order shows its assignee, the assignee's its author */}
        {from || to ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="task-people">
            {from ? <Person name={from} short={Boolean(to)} /> : null}
            {from && to ? (
              <span className="text-muted/80" aria-label="поручил">
                <Icon name="right" size={13} />
              </span>
            ) : null}
            {to ? <Person name={to} short={false} /> : null}
          </span>
        ) : null}
        {/* when it was handed out is the first step below; only «уйдёт» is news here */}
        {task.status === "scheduled" && task.scheduled_send_at ? (
          <span className="nums">· уйдёт {humanAqtobe(new Date(task.scheduled_send_at), now)}</span>
        ) : null}
        {task.priority === "high" && task.deadline && !model.closed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
            <Icon name="flame" size={12} />
            {TEXT.urgent}
          </span>
        ) : null}
      </div>

      {!isDirector && reaction ? <ReactionBadge code={reaction} points={reactionPoints} className="mt-3" /> : null}

      <div className="mt-4">
        {/* the date is the capsule's; the path says how much of the time is gone (D-187). The holder
            reads a new one as «Ждёт вас», not «В работе» (D-173) */}
        <TaskPath steps={stepsOf(task, now, { declinedAt: model.declinedAt, forAssignee: mine })} now={now} clock={clockOf(task, now)} />
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
      {isDirector ? (
        <DirectorKeys keys={keys} reason={model.reason} request={request} suggestion={suggestion} now={now} onPress={onDirectorKey} labels={SCREEN_LABEL} />
      ) : null}
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

      {/* the foot — for the director, whether the push was seen (принцип 8): «не открывал с 9:14» */}
      {isDirector && task.status !== "scheduled" && task.status !== "revoked" ? (
        <div className="mt-3 border-t border-border/60 pt-1">
          <DeliveryStatus taskId={task.id} status={task.status} assigneeId={task.assignee_id} onSendNow={() => onDirectorKey("sendNow")} />
        </div>
      ) : null}
    </article>
  );
}

/** A face and a name; the giver is shortened when the doer stands next to him. */
function Person({ name, short }: { name: string; short: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Face name={name} size={22} />
      <span className="truncate text-text/90">{short ? shortName(name) : name}</span>
    </span>
  );
}

/** How much of the time to the deadline is gone — the ring of the station the work waits at. */
function clockOf(task: TaskWithPeople, now: Date): PathClock | null {
  if (!task.deadline || !isWorking(task.status)) return null;
  const left = timeLeft(task, now);
  return left.used === null ? null : { used: left.used, color: TONE_VAR[left.tone] };
}

/**
 * The capsule of the head (D-187): the closing time of history; the deadline in its colour; «срочно»
 * when that is all the «when» there is; for the director an empty slot to give one. The assignee of
 * a task without a deadline sees nothing there — no capsule is the answer.
 */
function WhenCapsule({ task, model, now, onPress }: { task: TaskWithPeople; model: TaskDetailModel; now: Date; onPress?: () => void }) {
  const { closed, urgentNow, deadlineMove, deadlineNews } = model;
  const press = deadlineMove ? onPress : undefined;
  if (closed) {
    const text = humanAqtobe(new Date(closedAtOf(task)), now);
    // a tick only for work accepted: a refusal or a recall is not «done» (D-173)
    const icon = task.status === "done" ? "check" : task.status === "declined" ? "hand" : task.passed_to ? "swap" : "undo";
    return <DeadlineCapsule taskId={task.id} look="bare" icon={icon} text={text} rollKey="closed" color="var(--text-muted)" label={`Закрыта ${text}`} />;
  }
  if (task.deadline) {
    const text = humanAqtobe(new Date(task.deadline), now);
    // handed-in work has met its deadline: the date stays, the alarm goes — as in the list (D-173)
    const color = task.status === "pending_review" ? "var(--text-muted)" : TONE_VAR[model.deadlineTone === "accent" ? "muted" : model.deadlineTone];
    const label = deadlineMove === "ask" ? `Сдать ${text}. Попросить больше времени` : press ? `Сдать ${text}. Изменить` : `Сдать ${text}`;
    return (
      <DeadlineCapsule
        taskId={task.id}
        look="pill"
        icon="clock"
        text={text}
        rollKey={task.deadline}
        color={color}
        label={label}
        onPress={press}
        news={deadlineNews ? { from: deadlineNews.from ? humanAqtobe(new Date(deadlineNews.from), now) : null } : null}
      />
    );
  }
  if (urgentNow) {
    return <DeadlineCapsule taskId={task.id} look="pill" icon="flame" text={TEXT.urgent} rollKey="urgent" color="var(--warn)" label={press ? "Срочно, время не названо. Назначить" : "Срочно, время не названо"} onPress={press} />;
  }
  if (!press) return null;
  return <DeadlineCapsule taskId={task.id} look="empty" icon="clockPlus" text={null} rollKey="none" color="var(--text-muted)" label="Назначить срок" onPress={press} />;
}
