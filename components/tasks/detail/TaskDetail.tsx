"use client";

import type { CSSProperties, ReactNode } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { DeliveryStatus } from "@/components/tasks/DeliveryStatus";
import { Icon, type IconName } from "@/components/tasks/desk/icons";
import { ACTION_ICON, ACTION_LABEL, cardKeysFor, isPrimary } from "@/components/tasks/list/DirectorTaskCard";
import type { EmployeeAction } from "@/components/tasks/list/EmployeeTaskCard";
import { statusToneOf, StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Face, Note, Stepper } from "@/components/tasks/list/TaskList";
import { useDirectorControls } from "@/components/tasks/list/useDirectorControls";
import { useEmployeeControls } from "@/components/tasks/list/useEmployeeControls";
import { latestDeclineReason, latestOpenQuestion, messageFlags } from "@/components/tasks/TaskThread";
import { ThreadView } from "@/components/tasks/thread/ThreadView";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { formatAqtobe, humanAqtobe } from "@/lib/ai/time";
import { QUICK_ANSWERS, type DeskAction } from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import { closedAtOf, REASON_TONE, REASON_WORD, reasonFor, statusWord, stepsOf, timeLeft } from "@/lib/tasks/overview";
import type { Me, TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, isOverdue, TEXT } from "@/lib/tasks/status-text";
import { deadlineToneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";

/** A question the employee asked and nobody has answered — their own words, waiting. */
function openQuestionOf(messages: TaskMessage[] | undefined, senderId: string): string | null {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index];
    const flags = messageFlags(message);
    if (flags.isQuestion && !flags.answered && message.sender_id === senderId && message.content) return message.content;
  }
  return null;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] leading-[19px]">{children}</dd>
    </div>
  );
}

/**
 * One task on its own screen (D-87), in the same language as «Задачи» (D-83): a status screen
 * at the head — the stage in its colour, «when», the title, who, the four steps, the buttons
 * of this role and how much time is left — then «О задаче» (what was said and written, and
 * the facts), then the thread with its composer at the bottom. The buttons are the same hooks
 * as on the cards, so a button means the same thing on the list and here.
 */
export function TaskDetail({
  task,
  messages,
  messagesLoading,
  me,
  base,
  now,
  onBack,
  wall,
}: {
  task: TaskWithPeople;
  messages: TaskMessage[] | undefined;
  messagesLoading: boolean;
  me: Me;
  base: TaskActions;
  now: Date;
  onBack: () => void;
  /** The director's «На экран» (D-123): the page passes it, the sandbox does not. */
  wall?: ReactNode;
}) {
  const isDirector = me.role === "director";
  const question = latestOpenQuestion(messages);
  const declineReason = latestDeclineReason(messages);
  const myQuestion = isDirector ? null : openQuestionOf(messages, me.userId);
  const overdue = isOverdue(task, now);
  const reason = isDirector ? reasonFor(task, question, now) : null;

  const director = useDirectorControls({
    base,
    companyId: me.companyId,
    tasks: [task],
    questionOf: () => question,
    now,
    onThread: false,
    afterRemove: onBack,
  });
  const employee = useEmployeeControls({ actions: base, companyId: me.companyId, tasks: [task] });
  const actions = isDirector ? director.actions : base;

  // the stage, as this reader needs it: the director's move by its name, else the state
  const tone: Tone = reason && reason !== "question" ? REASON_TONE[reason] : statusToneOf(task.status, overdue);
  const word = reason && reason !== "question" ? REASON_WORD[reason] : statusWord(task, isDirector ? "director" : "employee", now);
  const closed = task.status === "done" || task.status === "revoked" || (!isDirector && task.status === "declined");
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const deadlineTone = deadlineToneOf(task, now);
  const left = timeLeft(task, now);
  const talk = (messages ?? []).filter((message) => message.type !== "status_change" && message.type !== "system").length;

  const keys: DeskAction[] = isDirector ? cardKeysFor(task, Boolean(question), now) : [];

  const person = isDirector ? task.assignee?.full_name : task.author?.full_name;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4">
      {/* the navigation bar (D-113): back, and — for the director — every move this task allows;
          the title lives in the status screen, so the bar carries none (as a letter in Mail) */}
      <PageHead
        bare
        back={{ label: "Назад", onClick: onBack }}
        actions={
          isDirector ? (
            <>
              {wall}
              <HeadButton label="Все действия" icon="more" testId="task-more" onClick={() => director.more(task)} />
            </>
          ) : null
        }
      />

      {/* the status screen of this one task */}
      <article
        data-testid="task-screen"
        data-status={task.status}
        className="status-screen mt-1 rounded-[22px] px-4 pb-3.5 pt-3.5"
        style={{ "--tone": TONE_VAR[tone] } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2">
            <StatusGlyph status={task.status} overdue={overdue} size={18} />
            <span
              className="truncate font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]"
              style={{ color: TONE_VAR[tone] }}
            >
              {word}
            </span>
          </span>
          {/* «when»: the deadline while it matters, the closing time once it is over */}
          <span
            className="nums inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4"
            style={{
              color: closed ? "var(--text-muted)" : urgentNow ? "var(--warn)" : task.deadline ? TONE_VAR[deadlineTone === "accent" ? "muted" : deadlineTone] : "var(--text-muted)",
              borderColor: "color-mix(in srgb, currentColor 35%, transparent)",
            }}
          >
            <Icon name={closed ? "check" : urgentNow ? "flame" : "clock"} size={13} />
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
              <span className="truncate text-text/90">{isDirector ? person : `от ${person}`}</span>
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

        <div className="mt-4">
          <Stepper steps={stepsOf(task, now)} now={now} deadline={task.deadline} />
        </div>

        {/* what waits on this task: the employee's question, a refusal, a return, a recall */}
        {isDirector && question ? (
          <div className="mt-1">
            <Note tone="warn" icon={<Icon name="question" size={15} />}>
              «{question}»
            </Note>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_ANSWERS.map((text) => (
                <Chip key={text} onClick={() => director.answer(task, text)}>
                  {text}
                </Chip>
              ))}
              <Chip tone="muted" onClick={() => director.answer(task, null)}>
                Ответить словами…
              </Chip>
            </div>
          </div>
        ) : null}
        {myQuestion ? (
          <Note tone="warn" icon={<Icon name="question" size={15} />}>
            Вопрос директору: «{myQuestion}» · ждёт ответа
          </Note>
        ) : null}
        {task.status === "declined" ? (
          <Note tone="danger" icon={<Icon name="hand" size={15} />}>
            {isDirector ? `Отказ${declineReason ? `: ${declineReason}` : ""}` : "Отказ отправлен директору"}
          </Note>
        ) : null}
        {task.status === "rework" ? (
          <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
            {isDirector ? "На доработке — ждём новый отчёт" : TEXT.reworkBanner}
          </Note>
        ) : null}
        {task.status === "revoked" ? (
          <Note tone="muted" icon={<Icon name="undo" size={15} />}>
            {TEXT.revoked}
          </Note>
        ) : null}

        {/* the buttons of this role — the same as on the card */}
        {isDirector && keys.length > 0 ? (
          <div className={`mt-4 grid gap-2 ${keys.length === 3 ? "grid-cols-3" : keys.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {keys.map((key, index) => {
              const danger = key === "remove" || key === "cancel";
              const icon = ACTION_ICON[key];
              return (
                <Button
                  key={key}
                  data-testid={`task-action-${key}`}
                  variant={index === 0 && isPrimary(key, reason) ? "primary" : danger ? "ghost" : "secondary"}
                  className={`!px-2 whitespace-nowrap !text-[14px] ${danger ? "!text-danger/85" : ""}`}
                  icon={keys.length < 3 && icon ? <Icon name={icon as IconName} size={16} /> : undefined}
                  onClick={() => director.press(key, task)}
                >
                  {key === "remove" ? BUTTON.remove : ACTION_LABEL[key]}
                </Button>
              );
            })}
          </div>
        ) : null}
        {/* only the assignee answers: a manager opening a subordinate's task reads it, no more */}
        {!isDirector && task.assignee_id === me.userId ? (
          <EmployeeButtons task={task} onAction={(action) => employee.press(action, task)} now={now} />
        ) : null}

        {/* the foot: how much time is left, and — for the director — whether the push was seen */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[13px] font-semibold leading-[18px]" style={{ color: TONE_VAR[left.tone] }} data-testid="time-left">
            {left.text}
          </p>
          {left.used !== null ? (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full origin-left rounded-full"
                style={{ transform: `scaleX(${Math.max(0.02, left.used)})`, background: TONE_VAR[left.tone] }}
              />
            </span>
          ) : null}
          {isDirector && task.status !== "scheduled" && task.status !== "revoked" ? <DeliveryStatus taskId={task.id} status={task.status} assigneeId={task.assignee_id} onSendNow={() => director.press("sendNow", task)} /> : null}
        </div>
      </article>

      {/* what was said and written, and the facts */}
      <section className="task-card mt-3 rounded-[18px] px-4 py-3.5" data-testid="task-about">
        <h2 className="font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">О задаче</h2>
        {task.body ? <p className="mt-2 whitespace-pre-line text-[15px] leading-[21px] text-text/90">{task.body}</p> : null}
        {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
        {task.source_transcript && task.source_transcript.trim() !== task.title.trim() ? (
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] leading-4 text-muted [&::-webkit-details-marker]:hidden">
              <Icon name="quote" size={14} />
              {TEXT.transcriptSpoiler}
              <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">
                ▾
              </span>
            </summary>
            <blockquote
              className="mt-2 border-l-2 pl-3 text-[14px] italic leading-[19px] text-muted"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
            >
              «{task.source_transcript}»
            </blockquote>
          </details>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Fact label="Исполнитель">{task.assignee?.full_name ?? "—"}</Fact>
          <Fact label="Поручил">{task.author?.full_name ?? "—"}</Fact>
          <Fact label="Выдана">
            <span className="nums">{formatAqtobe(new Date(task.created_at))}</span>
          </Fact>
          <Fact label="Срок">
            <span className="nums" style={overdue ? { color: "var(--danger)" } : undefined}>
              {task.deadline ? formatAqtobe(new Date(task.deadline)) : urgentNow ? "срочно, без времени" : "без срока"}
            </span>
          </Fact>
        </dl>
      </section>

      {/* the conversation — words, photos, voice and the order's own history in one feed */}
      <h2 className="mt-5 flex items-center gap-2 px-1 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">
        Переписка
        {talk > 0 ? <span className="nums">{talk}</span> : null}
      </h2>
      <ThreadView
        taskId={task.id}
        companyId={me.companyId}
        messages={messages}
        loading={messagesLoading}
        userId={me.userId}
        actions={actions}
        isDirector={isDirector}
      />

      {isDirector ? director.sheets : employee.sheets}
    </main>
  );
}

/** The employee's buttons of FRONTEND «Состояние задачи → набор кнопок» — принцип 2, three at most. */
function EmployeeButtons({ task, onAction, now }: { task: TaskWithPeople; onAction: (action: EmployeeAction) => void; now: Date }) {
  if (task.status === "sent") {
    return (
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button data-testid="task-action-accept" className="!px-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onAction("accept")}>
          {BUTTON.accept}
        </Button>
        <Button variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onAction("ask")}>
          {BUTTON.ask}
        </Button>
        <Button variant="danger" className="!px-2 whitespace-nowrap" icon={<Icon name="x" />} onClick={() => onAction("decline")}>
          {BUTTON.cant}
        </Button>
      </div>
    );
  }
  if (task.status === "accepted" || task.status === "in_progress" || task.status === "rework") {
    return (
      <div className="mt-4 grid grid-cols-[1.4fr_1fr] gap-2">
        <Button data-testid="task-action-complete" className="whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onAction("complete")}>
          {BUTTON.complete}
        </Button>
        <Button variant="secondary" className="whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onAction("ask")}>
          {BUTTON.ask}
        </Button>
      </div>
    );
  }
  if (task.status === "pending_review") {
    return (
      <p className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-surface-2/70 text-[14px] text-muted">
        <Icon name="clock" size={16} />
        {TEXT.underReview}
        {task.completed_at ? <span className="nums">· сдано {humanAqtobe(new Date(task.completed_at), now)}</span> : null}
      </p>
    );
  }
  return null;
}
