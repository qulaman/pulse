"use client";

import { EmployeeTasksView } from "@/components/tasks/list/EmployeeTasksView";
import { useMinute } from "@/components/tasks/list/TaskList";
import { TasksSkeleton } from "@/components/ui/PageSkeletons";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useMyTasks, usePulseBoard } from "@/lib/tasks/queries";

/**
 * «Мои дела» (D-82): the data and the actions; the screen itself is `EmployeeTasksView` —
 * the /dev sandbox draws the same view from fixtures.
 */
export default function TasksPage() {
  const me = useMe();
  const tasks = useMyTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  const actions = useTaskActions(me.data);
  const now = useMinute();

  // the board only adds the director's last word: the list does not wait for it
  if (me.isPending || tasks.isPending || !me.data) return <TasksSkeleton />;

  return (
    <EmployeeTasksView
      meId={me.data.userId}
      companyId={me.data.companyId}
      tasks={tasks.data ?? []}
      board={board.data ?? []}
      actions={actions}
      now={now}
    />
  );
}
