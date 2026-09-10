"use client";

import { useParams } from "next/navigation";

import { TaskCard } from "@/components/tasks/TaskCard";
import { latestDeclineReason, TaskThread } from "@/components/tasks/TaskThread";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useTaskThread } from "@/lib/tasks/queries";

export default function TaskThreadPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const me = useMe();
  const { task, messages } = useTaskThread(taskId);
  const actions = useTaskActions(me.data);

  const variant = me.data?.role === "director" ? "director" : "employee";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      {task.isLoading || me.isLoading ? (
        <TaskSkeleton count={1} />
      ) : task.data ? (
        <>
          <TaskCard
            task={task.data}
            variant={variant}
            actions={actions}
            companyId={me.data?.companyId ?? ""}
            declineReason={latestDeclineReason(messages.data)}
          />

          <TaskThread
            messages={messages.data}
            loading={messages.isLoading}
            taskId={taskId}
            companyId={me.data?.companyId ?? ""}
            actions={actions}
          />
        </>
      ) : (
        <p className="text-[16px] leading-[22px] text-muted">Задача не найдена</p>
      )}

    </main>
  );
}
