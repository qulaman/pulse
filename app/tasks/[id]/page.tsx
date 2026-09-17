"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { latestDeclineReason, latestOpenQuestion, TaskDates } from "@/components/tasks/TaskThread";
import { ThreadView } from "@/components/tasks/thread/ThreadView";
import { TaskPageSkeleton } from "@/components/ui/PageSkeletons";
import { humanAqtobe } from "@/lib/ai/time";
import { homeForRole } from "@/lib/routes";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useTaskThread, type TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, isOverdue, SHORT_STATUS, type TaskStatus } from "@/lib/tasks/status-text";

const TONE: Record<string, string> = {
  sent: "var(--accent)",
  accepted: "var(--ok)",
  in_progress: "var(--ok)",
  pending_review: "var(--warn)",
  rework: "var(--warn)",
  done: "var(--gold)",
  declined: "var(--danger)",
};

function toneOf(task: TaskWithPeople, now: Date): string {
  if (isOverdue(task, now)) return "var(--danger)";
  return TONE[task.status] ?? "var(--text-muted)";
}

/** Statuses where this role has something to do — then the card opens with the thread. */
function needsAction(status: TaskStatus, isDirector: boolean): boolean {
  return isDirector ? status === "pending_review" || status === "declined" : status === "sent" || status === "rework";
}

/**
 * One task as a conversation (D-64 §4): the order itself is a line at the top that
 * unfolds into the full card on a tap — open from the start only when this role has a
 * button to press — and everything else is the thread: words, photos, voice and the
 * order own history in one feed.
 */
export default function TaskThreadPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();

  const me = useMe();
  const { task, messages } = useTaskThread(taskId);
  const actions = useTaskActions(me.data);

  const isDirector = me.data?.role === "director";
  const variant = isDirector ? "director" : "employee";
  const [expanded, setExpanded] = useState<boolean | null>(null);

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
  const home = me.data ? homeForRole(me.data.role) : "/";

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace(home);
  };

  if (task.isLoading || me.isLoading) return <TaskPageSkeleton />;

  const row = task.data;
  const now = new Date();
  const open = expanded ?? (row ? needsAction(row.status, isDirector) : false);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
      <button type="button" onClick={back} className="flex min-h-[32px] items-center gap-1 text-[14px] leading-[18px] text-muted">
        <span aria-hidden>←</span> Назад
      </button>

      {row ? (
        <>
          {open ? (
            <div className="mt-3">
              <TaskCard
                task={row}
                variant={variant}
                actions={actions}
                companyId={companyId ?? ""}
                declineReason={latestDeclineReason(messages.data)}
                question={latestOpenQuestion(messages.data)}
              />
              <TaskDates task={row} />
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="mt-2 block w-full py-2 text-center text-[13px] leading-4 text-muted"
              >
                Свернуть задачу ▴
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="card relative mt-3 block w-full overflow-hidden py-3 pl-5 pr-4 text-left transition-transform duration-[120ms] active:scale-[0.99]"
              data-testid="task-header"
            >
              <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full" style={{ background: toneOf(row, now) }} />
              <span className="flex items-baseline justify-between gap-2">
                <span className="line-clamp-2 text-[16px] font-semibold leading-[21px] text-text">{row.title}</span>
                <span aria-hidden className="shrink-0 text-[12px] text-muted">▾</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] leading-4 text-muted">
                <span style={{ color: toneOf(row, now) }}>{isOverdue(row, now) ? "просрочена" : SHORT_STATUS[row.status]}</span>
                <span aria-hidden>·</span>
                <span className="nums">{deadlineLabel(row, now).text}</span>
                {row.assignee?.full_name ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{row.assignee.full_name}</span>
                  </>
                ) : null}
                {row.completed_at ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="nums">сдана {humanAqtobe(new Date(row.completed_at), now)}</span>
                  </>
                ) : null}
              </span>
            </button>
          )}

          <ThreadView
            taskId={taskId}
            companyId={companyId ?? ""}
            messages={messages.data}
            loading={messages.isLoading}
            userId={me.data?.userId}
            actions={actions}
            isDirector={isDirector}
          />
        </>
      ) : (
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Задача не найдена</p>
      )}
    </main>
  );
}
