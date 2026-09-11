"use client";

import Link from "next/link";

import { humanAqtobe } from "@/lib/ai/time";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

/** Short, lowercase: the capsule is a glance, not a card. */
const SHORT_STATUS: Record<TaskStatus, string> = {
  scheduled: "отложена",
  sent: "новая",
  accepted: "в работе",
  in_progress: "в работе",
  pending_review: "на приёмке",
  done: "готово",
  rework: "доработка",
  declined: "отказ",
  revoked: "отозвана",
};

const DOT: Record<TaskStatus, string> = {
  scheduled: "var(--text-muted)",
  sent: "var(--accent)",
  accepted: "var(--ok)",
  in_progress: "var(--ok)",
  pending_review: "var(--warn)",
  done: "var(--text-muted)",
  rework: "var(--warn)",
  declined: "var(--danger)",
  revoked: "var(--text-muted)",
};

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "shrink-0",
};

function firstName(full: string | undefined | null): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/**
 * One task as a capsule on «Задачи»: who, when it is due, when it was given —
 * three facts in one line under the title, a status dot on the left, the short
 * status on the right. Tap opens the thread.
 */
export function TaskCapsule({ task, now = new Date() }: { task: TaskWithPeople; now?: Date }) {
  const overdue = isOverdue(task, now);
  const closed = task.status === "done" || task.status === "revoked" || task.status === "declined";
  const dot = overdue ? "var(--danger)" : DOT[task.status];
  const who = firstName(task.assignee?.full_name) || "без исполнителя";
  const due = task.deadline ? humanAqtobe(new Date(task.deadline), now) : "без срока";
  const given = humanAqtobe(new Date(task.created_at), now);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={[
        "flex items-center gap-3 rounded-[20px] border border-border bg-surface py-3 pl-4 pr-4 transition-transform duration-[120ms] active:scale-[0.99]",
        closed ? "opacity-60" : "",
      ].join(" ")}
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-[22px]">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] leading-4 text-muted">
          <span className="inline-flex items-center gap-1">
            <svg {...ICON}>
              <circle cx="12" cy="8.5" r="3.6" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
            {who}
          </span>
          <span className="nums inline-flex items-center gap-1" style={overdue ? { color: "var(--danger)" } : undefined}>
            <svg {...ICON}>
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            {task.deadline ? `до ${due}` : due}
          </span>
          <span className="nums inline-flex items-center gap-1">
            <svg {...ICON}>
              <path d="M4 12h12M11 7l5 5-5 5" />
              <path d="M19 5v14" />
            </svg>
            дали {given}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-[13px] leading-4 text-muted">{overdue ? "просрочена" : SHORT_STATUS[task.status]}</span>
    </Link>
  );
}
