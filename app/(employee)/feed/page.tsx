"use client";

import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { ToastHost } from "@/components/ui/Toast";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useMyTasks } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

export default function FeedPage() {
  const me = useMe();
  const tasks = useMyTasks(me.data?.userId);
  const actions = useTaskActions(me.data);

  const loading = me.isLoading || tasks.isLoading;
  const items = tasks.data ?? [];

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Лента</h1>

      <div className="mt-4">
        {loading ? (
          <TaskSkeleton />
        ) : items.length === 0 ? (
          <p className="text-[16px] leading-[22px] text-muted">{TEXT.emptyFeed}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                variant="employee"
                actions={actions}
                companyId={me.data?.companyId ?? ""}
                href={`/tasks/${task.id}`}
              />
            ))}
          </div>
        )}
      </div>

      <ToastHost />
    </main>
  );
}
