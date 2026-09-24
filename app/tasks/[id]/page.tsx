"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { useMinute } from "@/components/tasks/list/TaskList";
import { TaskPageSkeleton } from "@/components/ui/PageSkeletons";
import { clearTaskNotifications } from "@/lib/push/client";
import { homeForRole } from "@/lib/routes";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useTaskThread } from "@/lib/tasks/queries";

/**
 * One task on its own screen (D-87): the data, the read cursor and the way back; the screen
 * itself is `TaskDetail` — a status screen with this role's buttons, «О задаче» and the
 * thread (D-64 §4), in the language of «Задачи» (D-83).
 */
export default function TaskThreadPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();

  const me = useMe();
  const { task, messages } = useTaskThread(taskId);
  const actions = useTaskActions(me.data);
  const now = useMinute();

  // the thread on screen is a thread seen: the read cursor follows the newest message (D-61)
  const newestSeq = (messages.data ?? []).reduce((max, message) => Math.max(max, message.seq), 0);
  const companyId = me.data?.companyId;
  const markRead = actions.markRead;
  // once per cursor: `actions` is a new object on every render, and a screen that also
  // watches the board would otherwise loop through its own mutation
  const marked = useRef("");
  useEffect(() => {
    if (!companyId || newestSeq === 0) return;
    const cursor = `${taskId}:${newestSeq}`;
    if (marked.current === cursor) return;
    marked.current = cursor;
    markRead({ taskId, companyId, seq: newestSeq });
  }, [taskId, companyId, newestSeq, markRead]);
  // a task on screen is a task seen: its bubbles leave the shade and the icon's number follows (D-114)
  useEffect(() => {
    clearTaskNotifications(taskId);
  }, [taskId, newestSeq]);
  const home = me.data ? homeForRole(me.data.role) : "/";

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace(home);
  };

  if (task.isLoading || me.isLoading || !me.data) return <TaskPageSkeleton />;

  if (!task.data) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
        <button type="button" onClick={back} className="flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-accent">
          ‹ Назад
        </button>
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Задача не найдена — возможно, её удалили</p>
      </main>
    );
  }

  return (
    <TaskDetail
      task={task.data}
      messages={messages.data}
      messagesLoading={messages.isLoading}
      me={me.data}
      base={actions}
      now={now}
      onBack={back}
    />
  );
}
