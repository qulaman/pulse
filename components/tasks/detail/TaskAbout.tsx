"use client";

import { ruleLine, ruleState } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Icon } from "@/components/tasks/icons";
import { TranscriptSpoiler } from "@/components/tasks/TaskNotes";
import type { Rule } from "@/lib/recurrence/queries";
import type { TaskDetailModel } from "@/lib/tasks/detail-model";
import type { TaskWithPeople } from "@/lib/tasks/queries";

/**
 * What was said and written for the task, on its own screen: the director's words, the recording
 * behind them, the transcript and the repeat. Who, when given and by when stand at the top
 * already — the people under the title, «Выдана» on the path, the deadline in its capsule — so
 * this card repeats none of them, for anybody (D-173, D-187). Nothing left — no card.
 */
export function TaskAbout({ task, model, rule }: { task: TaskWithPeople; model: Pick<TaskDetailModel, "spoken">; rule: Rule | null }) {
  if (!task.body && !task.source_audio_path && !model.spoken && !rule) return null;

  return (
    <section className="task-card mt-3 rounded-[18px] px-4 py-3" data-testid="task-about">
      {task.body ? <p className="whitespace-pre-line text-[15px] leading-[21px] text-text/90">{task.body}</p> : null}
      {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
      <TranscriptSpoiler task={task} />
      {/* made by a repeating order (D-148): when it comes again; the director stops it in «⋯» */}
      {rule ? (
        <p className={`flex items-start gap-2 text-[14px] leading-[19px] ${task.body || task.source_audio_path || model.spoken ? "mt-2" : ""}`} data-testid="task-repeat">
          <span className="mt-0.5 text-muted" aria-label="Повторяется">
            <Icon name="repeat" size={15} />
          </span>
          <span className="min-w-0">
            {ruleLine(rule)}
            <span className="text-muted"> · {ruleState(rule).text}</span>
          </span>
        </p>
      ) : null}
    </section>
  );
}
