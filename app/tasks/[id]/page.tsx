"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { latestDeclineReason, latestOpenQuestion, TaskChat, TaskDates, TaskTimeline } from "@/components/tasks/TaskThread";
import { TaskPageSkeleton } from "@/components/ui/PageSkeletons";
import { homeForRole } from "@/lib/routes";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useTaskThread } from "@/lib/tasks/queries";

/** One task: the card with its buttons, the dates, the timeline, the chat. */
export default function TaskThreadPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();

  const me = useMe();
  const { task, messages } = useTaskThread(taskId);
  const actions = useTaskActions(me.data);

  const variant = me.data?.role === "director" ? "director" : "employee";

  // the thread on screen is a thread seen: the read cursor follows the newest message (D-61)
  const newestSeq = (messages.data ?? []).reduce((max, message) => Math.max(max, message.seq), 0);
  const companyId = me.data?.companyId;
  const markRead = actions.markRead;
  useEffect(() => {
    if (!companyId || newestSeq === 0) return;
    markRead({ taskId, companyId, seq: newestSeq });
  }, [taskId, companyId, newestSeq, markRead]);
  const home = me.data ? homeForRole(me.data.role) : "/";

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace(home);
  };

  if (task.isLoading || me.isLoading) return <TaskPageSkeleton />;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
      <button type="button" onClick={back} className="flex min-h-[32px] items-center gap-1 text-[14px] leading-[18px] text-muted">
        <span aria-hidden>←</span> Назад
      </button>

      {task.data ? (
        <>
          <div className="mt-3">
            <TaskCard
              task={task.data}
              variant={variant}
              actions={actions}
              companyId={me.data?.companyId ?? ""}
              declineReason={latestDeclineReason(messages.data)}
              question={latestOpenQuestion(messages.data)}
            />
          </div>

          <TaskDates task={task.data} />
          <TaskTimeline task={task.data} messages={messages.data} />
          <TaskChat
            messages={messages.data}
            loading={messages.isLoading}
            taskId={taskId}
            companyId={me.data?.companyId ?? ""}
            userId={me.data?.userId}
            actions={actions}
            isDirector={variant === "director"}
          />
        </>
      ) : (
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Задача не найдена</p>
      )}
    </main>
  );
}
