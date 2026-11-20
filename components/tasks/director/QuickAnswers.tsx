"use client";

import { Chip } from "@/components/ui/Chip";
import { answersFor, wantsWords, type QuickAnswer } from "@/lib/tasks/answers";
import type { TaskActions } from "@/lib/tasks/mutations";

/**
 * The director's one-tap answers under an employee's question (D-142): chips that fit the
 * question (lib/tasks/answers.ts) and «Ответить словами…» — first and loud when no chip can
 * answer it («Какой формат?»), last and quiet otherwise. One component for the deck, «Задачи»,
 * the task's screen and the full card, so the same question gets the same answers everywhere.
 */
export function QuickAnswers({
  question,
  deadline,
  now,
  onAnswer,
  onWords,
  className = "mt-2",
}: {
  question: string;
  deadline: string | null;
  now: Date;
  onAnswer: (answer: QuickAnswer) => void;
  /** «Ответить словами…»: the sheet or the thread; without it there is no such chip */
  onWords?: () => void;
  className?: string;
}) {
  const answers = answersFor(question, deadline, now);
  const words = wantsWords(question);
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-testid="quick-answers">
      {words && onWords ? (
        <Chip tone="accent" onClick={onWords}>
          Ответить словами…
        </Chip>
      ) : null}
      {answers.map((answer) => (
        <Chip key={answer.label} onClick={() => onAnswer(answer)}>
          {answer.label}
        </Chip>
      ))}
      {!words && onWords ? (
        <Chip tone="muted" onClick={onWords}>
          Ответить словами…
        </Chip>
      ) : null}
    </div>
  );
}

/** The answer as a word in the thread — and, for «Когда срок?», the new deadline on the task. */
export function sendQuickAnswer(actions: TaskActions, taskId: string, companyId: string, answer: QuickAnswer) {
  if (answer.deadlineIso) actions.extend({ taskId, deadlineIso: answer.deadlineIso });
  actions.sendMessage({ taskId, companyId, text: answer.text });
}
