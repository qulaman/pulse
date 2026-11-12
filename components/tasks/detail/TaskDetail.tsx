"use client";

import type { CSSProperties, ReactNode } from "react";

import { ReactionBadge, ReactionBar } from "@/components/points/ReactionBar";
import { ruleLine, ruleState } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { DeliveryStatus } from "@/components/tasks/DeliveryStatus";
import { Icon } from "@/components/tasks/desk/icons";
import { cardKeysFor, DirectorKeys, LifecycleNotes } from "@/components/tasks/list/DirectorTaskCard";
import type { EmployeeAction } from "@/components/tasks/list/EmployeeTaskCard";
import { statusToneOf, StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Face, Note, Stepper } from "@/components/tasks/list/TaskList";
import { useDirectorControls } from "@/components/tasks/list/useDirectorControls";
import { useEmployeeControls } from "@/components/tasks/list/useEmployeeControls";
import { latestDeclineReason, latestOpenQuestion, messageFlags } from "@/components/tasks/TaskThread";
import { ThreadView } from "@/components/tasks/thread/ThreadView";
import { Button } from "@/components/ui/Button";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { formatAqtobe, humanAqtobe } from "@/lib/ai/time";
import { useReactionPrices, useTaskReactions } from "@/lib/points/game";
import { usePointsEnabled } from "@/lib/points/queries";
import { isReactable, showsReactionBar } from "@/lib/points/reactions";
import { useRecurrenceRules } from "@/lib/recurrence/queries";
import { QuickAnswers } from "@/components/tasks/desk/QuickAnswers";
import type { DeskAction } from "@/lib/tasks/desk";
import {
  handedInPartly,
  isWorking,
  lastNudgeAt,
  latestSuggestion,
  latestTimeRequest,
  passedWord,
  untilWords,
} from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import { closedAtOf, REASON_TONE, REASON_WORD, reasonFor, statusWord, stepsOf, timeLeft } from "@/lib/tasks/overview";
import type { Me, TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, isOverdue, reworkBannerText, reworkCommentOf, TEXT, unreadWordOf, wordText, type TaskStatus } from "@/lib/tasks/status-text";
import { deadlineToneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";
import { useSeenAtOpen, WordBubble } from "./WordBubble";

/** Work the assignee still holds: a word from the director on it waits for them (D-173). */
const IN_HAND: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework", "pending_review"];

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
  // the assignee reading their own order: who and when are said once, at the top (D-173); a
  // manager opening a subordinate's task and the director keep «О задаче» whole
  const mine = !isDirector && task.assignee_id === me.userId;
  const question = latestOpenQuestion(messages);
  const declineReason = latestDeclineReason(messages);
  const myQuestion = isDirector ? null : openQuestionOf(messages, me.userId);
  const overdue = isOverdue(task, now);
  // D-128: a request for time, a suggested colleague, «не всё», the last reminder — from the thread
  const request = isWorking(task.status) ? latestTimeRequest(messages) : null;
  const suggestion = task.status === "declined" ? latestSuggestion(messages) : null;
  const partial = handedInPartly(task, messages);
  const nudgedAt = lastNudgeAt(messages);
  // a recalled task that had been refused first keeps the refusal on its way (D-142)
  const declinedAt =
    task.status === "revoked"
      ? ([...(messages ?? [])].reverse().find((message) => (message.meta as Record<string, unknown> | null)?.decline_reason === true)?.created_at ?? null)
      : null;
  const reason = isDirector ? reasonFor(task, question, now, Boolean(request)) : null;
  // D-173: what the reader has to read stands at the top, where the eye lands — the return's
  // reason in the director's words, and the other side's word they have not seen yet (it used to
  // sit ~600 px down, in the thread)
  const reworkComment = !isDirector && task.status === "rework" ? reworkCommentOf(messages) : null;
  const seenAtOpen = useSeenAtOpen(task.id, mine ? me.userId : undefined);
  // `undefined` — the cursor is still being asked for (a cold open): the word waits for it
  const waiting = mine && IN_HAND.includes(task.status) && seenAtOpen !== undefined ? unreadWordOf(messages, me.userId, seenAtOpen) : null;

  const director = useDirectorControls({
    base,
    companyId: me.companyId,
    tasks: [task],
    questionOf: () => question,
    requestOf: () => request,
    suggestionOf: () => suggestion,
    now,
    onThread: false,
    afterRemove: onBack,
  });
  const employee = useEmployeeControls({ actions: base, companyId: me.companyId, tasks: [task] });
  const rules = useRecurrenceRules(Boolean(task.recurrence_rule_id));
  const rule = task.recurrence_rule_id ? (rules.data?.find((row) => row.id === task.recurrence_rule_id) ?? null) : null;
  const actions = isDirector ? director.actions : base;

  // the stage, as this reader needs it: the director's move by its name, else the state
  const tone: Tone = reason && reason !== "question" ? REASON_TONE[reason] : statusToneOf(task.status, overdue);
  const word = reason && reason !== "question" ? REASON_WORD[reason] : statusWord(task, isDirector ? "director" : "employee", now);
  const closed = task.status === "done" || task.status === "revoked" || (!isDirector && task.status === "declined");
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const deadlineTone = deadlineToneOf(task, now);
  const left = timeLeft(task, now);
  // a typed order's «transcript» is its own title — only a voice one says something new
  const spoken = Boolean(task.source_transcript && task.source_transcript.trim() !== task.title.trim());
  const facts = !mine;
  const about = Boolean(task.body || task.source_audio_path || spoken || rule);
  const talk = (messages ?? []).filter((message) => message.type !== "status_change" && message.type !== "system").length;

  const keys: DeskAction[] = isDirector
    ? cardKeysFor(task, { question: Boolean(question), request: Boolean(request), suggestion: Boolean(suggestion) }, now)
    : [];

  const person = isDirector ? task.assignee?.full_name : task.author?.full_name;
  // D-133: the director's reaction — a row of seven for the director, a gold badge for the assignee
  const pointsEnabled = usePointsEnabled().data === true;
  const reactions = useTaskReactions();
  const prices = useReactionPrices();
  const reaction = reactions.data?.[task.id] ?? null;
  const canReact = isDirector && isReactable(task, me.userId) && showsReactionBar(task.status, Boolean(reaction));

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
        data-reacted={reaction ? true : undefined}
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
              color: closed
                ? "var(--text-muted)"
                : urgentNow
                  ? "var(--warn)"
                  : // handed-in work has met its deadline: the date stays, the alarm goes — as in the list (D-173)
                    task.deadline && task.status !== "pending_review"
                    ? TONE_VAR[deadlineTone === "accent" ? "muted" : deadlineTone]
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

        {!isDirector && reaction ? (
          <ReactionBadge code={reaction} points={pointsEnabled ? prices[reaction] : null} className="mt-3" />
        ) : null}

        <div className="mt-4">
          {/* the assignee hears the deadline twice — the pill above and «осталось» below; a third time
              under the station («Принять до 18:09») read as a deadline to accept by (D-173) */}
          {/* the holder reads a new one as «Ждёт вас», not «В работе» (D-173) */}
          <Stepper steps={stepsOf(task, now, { declinedAt, forAssignee: mine })} now={now} deadline={mine ? null : task.deadline} />
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
              onAnswer={(answer) => director.answer(task, answer.text, answer.deadlineIso)}
              onWords={() => director.answer(task, null)}
            />
          </div>
        ) : null}
        {myQuestion ? (
          <Note tone="warn" icon={<Icon name="question" size={15} />}>
            Вопрос директору: «{myQuestion}» · ждёт ответа
          </Note>
        ) : null}
        {!isDirector && request ? (
          <Note tone="warn" icon={<Icon name="clock" size={15} />}>
            Просите срок {untilWords(request.proposed, now)} · ждёт ответа директора
          </Note>
        ) : null}
        {task.status === "declined" ? (
          <Note tone="danger" icon={<Icon name="hand" size={15} />}>
            {isDirector
              ? `Отказ${declineReason ? `: ${declineReason}` : ""}`
              : `Отказ отправлен директору${suggestion ? ` · вы предложили: ${suggestion.name.trim().split(/\s+/)[0]}` : ""}`}
          </Note>
        ) : null}
        {task.status === "rework" ? (
          <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
            {isDirector ? (
              "На доработке — ждём новый отчёт"
            ) : (
              // what to fix, in the director's words, up to three lines; the whole of it stays in the thread
              <span className="line-clamp-3" data-testid="rework-reason">
                {reworkBannerText(reworkComment)}
              </span>
            )}
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
        {waiting ? (
          <WordBubble
            name={waiting.message.sender?.full_name ?? task.author?.full_name ?? "Директор"}
            text={wordText(waiting.message)}
            at={waiting.message.created_at}
            now={now}
            unread={waiting.unread}
          />
        ) : null}
        {isDirector ? (
          <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={partial} nudgedAt={nudgedAt} now={now} />
        ) : null}

        {/* the buttons of this role — the same as on the card */}
        {isDirector ? (
          <DirectorKeys keys={keys} reason={reason} request={request} suggestion={suggestion} now={now} onPress={(key) => director.press(key, task)} />
        ) : null}
        {canReact ? <ReactionBar taskId={task.id} pointsEnabled={pointsEnabled} className="mt-3" /> : null}
        {/* only the assignee answers: a manager opening a subordinate's task reads it, no more */}
        {!isDirector && task.assignee_id === me.userId ? (
          <EmployeeButtons task={task} onAction={(action) => employee.press(action, task)} />
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

      {/* what was said and written, and the facts. The assignee's own order keeps only what is said
          nowhere else — the director's words and the repeat; who, when given and by when stand at the
          top already (D-173). Nothing left — no card. */}
      {facts || about ? (
        <section className="task-card mt-3 rounded-[18px] px-4 py-3.5" data-testid="task-about">
          <h2 className="font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">О задаче</h2>
          {task.body ? <p className="mt-2 whitespace-pre-line text-[15px] leading-[21px] text-text/90">{task.body}</p> : null}
          {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
          {spoken ? (
            <details className="group mt-1">
              {/* the whole row opens it — a thumb's height (D-173) */}
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-[13px] leading-4 text-muted [&::-webkit-details-marker]:hidden">
                <Icon name="quote" size={14} />
                {TEXT.transcriptSpoiler}
                <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <blockquote
                className="mb-1 border-l-2 pl-3 text-[14px] italic leading-[19px] text-muted"
                style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
              >
                «{task.source_transcript}»
              </blockquote>
            </details>
          ) : null}
          {facts || rule ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {facts ? (
                <>
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
                </>
              ) : null}
              {/* made by a repeating order (D-148): when it comes again; the director stops it in «⋯» */}
              {rule ? (
                // the rule's line wraps: «раз в две недели по вторникам и четвергам» does not fit a cell
                <div className="col-span-2 min-w-0" data-testid="task-repeat">
                  <dt className="text-[12px] leading-4 text-muted">Повторяется</dt>
                  <dd className="mt-0.5 text-[14px] leading-[19px]">
                    {ruleLine(rule)}
                    <span className="text-muted"> · {ruleState(rule).text}</span>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      ) : null}

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
        // taken back: nobody is on the other end of this thread any more (D-142)
        closedNote={task.status === "revoked" ? "Задача отозвана — переписка закрыта" : null}
      />

      {isDirector ? director.sheets : employee.sheets}
    </main>
  );
}

/** The employee's buttons of FRONTEND «Состояние задачи → набор кнопок» — принцип 2, three at most. */
function EmployeeButtons({ task, onAction }: { task: TaskWithPeople; onAction: (action: EmployeeAction) => void }) {
  if (task.status === "sent") {
    // each key as wide as its words plus an equal share, the icon close to its word: in equal
    // thirds «Уточнить» touched its border at 360 px (D-173, as Лента's card)
    const key = "min-w-0 flex-auto !px-2 whitespace-nowrap [&>span]:gap-1";
    return (
      <div className="mt-4 flex gap-2">
        <Button data-testid="task-action-accept" className={key} icon={<Icon name="check" />} onClick={() => onAction("accept")}>
          {BUTTON.accept}
        </Button>
        <Button variant="secondary" className={key} icon={<Icon name="question" />} onClick={() => onAction("ask")}>
          {BUTTON.ask}
        </Button>
        <Button variant="danger" className={key} icon={<Icon name="x" />} onClick={() => onAction("decline")}>
          {BUTTON.cant}
        </Button>
      </div>
    );
  }
  if (task.status === "accepted" || task.status === "in_progress" || task.status === "rework") {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button data-testid="task-action-complete" className="col-span-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onAction("complete")}>
          {BUTTON.complete}
        </Button>
        <Button variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onAction("ask")}>
          {BUTTON.ask}
        </Button>
        <Button data-testid="task-action-cant" variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="clock" />} onClick={() => onAction("decline")}>
          {BUTTON.cant}
        </Button>
      </div>
    );
  }
  if (task.status === "pending_review") {
    return (
      // one line: when it was handed in is the station «Сдана» and the foot below — said a third
      // time here it wrapped into two broken columns (D-173)
      <p className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-surface-2/70 px-3 text-[14px] text-muted">
        <Icon name="clock" size={16} />
        <span>{TEXT.underReview}</span>
      </p>
    );
  }
  return null;
}
