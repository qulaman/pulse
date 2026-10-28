"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { taskMeta } from "@/lib/daily-report/format";
import type { DailyReportTask } from "@/lib/daily-report/types";

/**
 * The tasks of a day in a report — handed over or accepted that day, written in by themselves
 * (D-152): the stage ring of «Задачи», the title, «принята · в срок»; a tap opens the task.
 */
export function DayTasks({ tasks, empty, flat = false }: { tasks: readonly DailyReportTask[]; empty?: ReactNode; flat?: boolean }) {
  if (tasks.length === 0) return <>{empty ?? null}</>;
  return (
    <ul
      className={`${flat ? "rounded-[14px] bg-surface-2/50" : "card"} overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70`}
      data-testid="day-tasks"
    >
      {tasks.map((task) => (
        <li key={task.id}>
          <Link
            href={`/tasks/${task.id}`}
            className="relative flex min-h-[56px] items-center gap-3 px-3.5 py-2.5 transition-colors duration-[120ms] active:bg-surface-2"
          >
            <StatusGlyph status={task.status} size={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-5">{task.title}</span>
              <span className="block truncate text-[13px] leading-4 text-muted">{taskMeta(task)}</span>
            </span>
            <span className="shrink-0 text-muted">
              <Icon name="open" size={14} />
            </span>
            <HapticSwitch />
          </Link>
        </li>
      ))}
    </ul>
  );
}
