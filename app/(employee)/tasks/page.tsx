"use client";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { SkeletonGroup, TaskListBone } from "@/components/ui/Skeleton";
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
          <SkeletonGroup>
            <TaskListBone />
          </SkeletonGroup>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center card px-6 py-10 text-center">
            <Mascot state="calm" size={72} />
            <p className="mt-4 text-[16px] leading-[22px]">{TEXT.emptyTasks}</p>
          </div>
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
