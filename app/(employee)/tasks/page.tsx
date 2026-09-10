"use client";

import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { useTaskActions } from "@/lib/tasks/mutations";
import { activeOnly, useMe, useMyTasks } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

/** «Мои дела»: only what is still open, overdue on top (D-05). */
export default function TasksPage() {
  const me = useMe();
  const tasks = useMyTasks(me.data?.userId);
  const actions = useTaskActions(me.data);

  const loading = me.isLoading || tasks.isLoading;
  const items = activeOnly(tasks.data);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Мои дела</h1>

      <div className="mt-4">
        {loading ? (
          <TaskSkeleton />
        ) : items.length === 0 ? (
          <p className="text-[16px] leading-[22px] text-muted">{TEXT.emptyTasks}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((task) => (
              <div key={task.id} className="card-in">
              <TaskCard
                task={task}
                variant="employee"
                actions={actions}
                companyId={me.data?.companyId ?? ""}
                href={`/tasks/${task.id}`}
              />
              </div>
            ))}
          </div>
        )}
      </div>

    </main>
  );
}
