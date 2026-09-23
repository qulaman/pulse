"use client";

import Link from "next/link";

import { TaskHead } from "@/components/tasks/TaskChrome";
import type { TaskWithPeople } from "@/lib/tasks/queries";

function firstName(full: string | undefined | null): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

type Props = {
  task: TaskWithPeople;
  now?: Date;
  question?: boolean;
  /** Off inside a per-person group, where the name is already the heading. */
  showPerson?: boolean;
  /** Off under a «Просрочено» heading — the word would be the third thing saying it. */
  showStatus?: boolean;
};

/**
 * A task on the trace of «Задачи»: the shared head and nothing else — no box of its own,
 * because the bead on the thread already carries the state. Tap opens the thread; the
 * director's buttons live there and in Пульс, not in the list (docs/FRONTEND.md).
 */
export function TaskCapsule({ task, now = new Date(), question = false, showPerson = true, showStatus = true }: Props) {
  const closed = task.status === "done" || task.status === "revoked" || task.status === "declined";
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={[
        "-mx-2 block rounded-[12px] px-2 py-1.5 transition-colors duration-[120ms] active:bg-surface",
        closed ? "opacity-55" : "",
      ].join(" ")}
    >
      <TaskHead
        task={task}
        now={now}
        question={question}
        showStatus={showStatus}
        person={showPerson ? firstName(task.assignee?.full_name) || "без исполнителя" : undefined}
      />
    </Link>
  );
}
