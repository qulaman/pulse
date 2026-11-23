"use client";

import type { ReactNode } from "react";

import { screenKeysFor } from "@/components/tasks/list/DirectorTaskCard";
import { useDirectorControls } from "@/components/tasks/list/useDirectorControls";
import { useEmployeeControls } from "@/components/tasks/list/useEmployeeControls";
import { ThreadView } from "@/components/tasks/thread/ThreadView";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { useReactionPrices, useTaskReactions } from "@/lib/points/game";
import { usePointsEnabled } from "@/lib/points/queries";
import { isReactable, showsReactionBar } from "@/lib/points/reactions";
import { useRecurrenceRules } from "@/lib/recurrence/queries";
import { taskDetailModel } from "@/lib/tasks/detail-model";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { Me, TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import type { DeskAction } from "@/lib/tasks/reasons";

import { TaskAbout } from "./TaskAbout";
import { TaskStatusCard } from "./TaskStatusCard";
import { useSeenAtOpen } from "./WordBubble";

/**
 * One task on its own screen (D-87), in the same language as «Задачи» (D-83): the status screen
 * at the head (`TaskStatusCard`), then «О задаче» (`TaskAbout`), then the thread with its
 * composer at the bottom. What the screen shows is derived in one pure step (`taskDetailModel`);
 * the buttons are the same hooks as on the cards, so a button means the same thing on the list
 * and here.
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
  const seenAtOpen = useSeenAtOpen(task.id, me.role !== "director" && task.assignee_id === me.userId ? me.userId : undefined);
  const model = taskDetailModel(task, messages, me, now, seenAtOpen);
  const { isDirector, question, request, suggestion } = model;

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

  const keys: DeskAction[] = isDirector
    ? screenKeysFor(task, { question: Boolean(question), request: Boolean(request), suggestion: Boolean(suggestion) }, now)
    : [];
  // the capsule of the head (D-187): the director moves the deadline (answering a request for time,
  // when there is one), the assignee asks for more
  const move = model.deadlineMove;
  const onDeadline = move === "ask" ? () => employee.press("time", task) : move ? () => director.press(move, task) : undefined;

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
        // the task's state lives in its status card below: the sky stays quiet (D-176)
        tone="muted"
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

      <TaskStatusCard
        task={task}
        model={model}
        now={now}
        keys={keys}
        reaction={reaction}
        reactionPoints={reaction && pointsEnabled ? prices[reaction] : null}
        canReact={canReact}
        pointsEnabled={pointsEnabled}
        onAnswer={(text, deadlineIso) => director.answer(task, text, deadlineIso)}
        onDirectorKey={(key) => director.press(key, task)}
        onEmployeeKey={(action) => employee.press(action, task)}
        onDeadline={onDeadline}
      />

      <TaskAbout task={task} model={model} rule={rule} />

      {/* the conversation — words, photos, voice and the order's own history in one feed */}
      <h2 className="mt-5 flex items-center gap-2 px-1 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">
        Переписка
        {model.talk > 0 ? <span className="nums">{model.talk}</span> : null}
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
