"use client";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Лента</h1>

      <div className="mt-4">
        {loading ? (
          <TaskSkeleton />
        ) : items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
            <Mascot state="calm" size={72} />
            <p className="mt-4 text-[16px] leading-[22px]">{TEXT.emptyFeed}</p>
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
