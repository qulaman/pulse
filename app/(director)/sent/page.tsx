"use client";

import { DirectorTasksView } from "@/components/tasks/list/DirectorTasksView";
import { useMinute } from "@/components/tasks/list/TaskList";
import { SentSkeleton } from "@/components/ui/PageSkeletons";
import { usePurgeClosed, useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";

/**
 * «Задачи» директора (D-82): the data and the actions; the screen itself is
 * `DirectorTasksView` — the /dev sandbox draws the same view from fixtures.
 */
export default function SentPage() {
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  const actions = useTaskActions(me.data);
  const purge = usePurgeClosed();
  const now = useMinute();

  // isPending, not isLoading: a query enabled in this very render has not started fetching yet
  if (me.isPending || tasks.isPending || board.isPending || !me.data) return <SentSkeleton />;

  return (
    <DirectorTasksView
      meId={me.data.userId}
      companyId={me.data.companyId}
      tasks={tasks.data ?? []}
      board={board.data ?? []}
      actions={actions}
      now={now}
      purging={purge.isPending}
      onPurge={(done) => purge.mutate(undefined, { onSettled: done })}
    />
  );
}
