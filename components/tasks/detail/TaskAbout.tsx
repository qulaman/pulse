"use client";

import type { ReactNode } from "react";

import { ruleLine, ruleState } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { TranscriptSpoiler } from "@/components/tasks/TaskNotes";
import { formatAqtobe } from "@/lib/ai/time";
import type { Rule } from "@/lib/recurrence/queries";
import type { TaskDetailModel } from "@/lib/tasks/detail-model";
import type { TaskWithPeople } from "@/lib/tasks/queries";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] leading-[19px]">{children}</dd>
    </div>
  );
}

/**
 * «О задаче» on the task's own screen: what was said and written, and the facts. The assignee's
 * own order keeps only what is said nowhere else — the director's words and the repeat; who, when
 * given and by when stand at the top already (D-173). Nothing left — no card.
 */
export function TaskAbout({ task, model, rule }: { task: TaskWithPeople; model: Pick<TaskDetailModel, "facts" | "spoken" | "overdue" | "urgentNow">; rule: Rule | null }) {
  const { facts } = model;
  if (!facts && !task.body && !task.source_audio_path && !model.spoken && !rule) return null;

  return (
    <section className="task-card mt-3 rounded-[18px] px-4 py-3.5" data-testid="task-about">
      <h2 className="font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">О задаче</h2>
      {task.body ? <p className="mt-2 whitespace-pre-line text-[15px] leading-[21px] text-text/90">{task.body}</p> : null}
      {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
      <TranscriptSpoiler task={task} />
      {facts || rule ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {facts ? (
            <>
              <Fact label="Исполнитель">{task.assignee?.full_name ?? "—"}</Fact>
              <Fact label="Поручил">{task.author?.full_name ?? "—"}</Fact>
              <Fact label="Выдана">
                <span className="nums">{formatAqtobe(new Date(task.created_at))}</span>
              </Fact>
              <Fact label="Срок">
                <span className="nums" style={model.overdue ? { color: "var(--danger)" } : undefined}>
                  {task.deadline ? formatAqtobe(new Date(task.deadline)) : model.urgentNow ? "срочно, без времени" : "без срока"}
                </span>
              </Fact>
            </>
          ) : null}
          {/* made by a repeating order (D-148): when it comes again; the director stops it in «⋯» */}
          {rule ? (
            // the rule's line wraps: «раз в две недели по вторникам и четвергам» does not fit a cell
            <div className="col-span-2 min-w-0" data-testid="task-repeat">
              <dt className="text-[12px] leading-4 text-muted">Повторяется</dt>
              <dd className="mt-0.5 text-[14px] leading-[19px]">
                {ruleLine(rule)}
                <span className="text-muted"> · {ruleState(rule).text}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
