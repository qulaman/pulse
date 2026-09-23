"use client";

import { initialsOf } from "@/lib/people/queries";
import { deadlineLabel, SHORT_STATUS, TEXT, type TaskStatus } from "@/lib/tasks/status-text";
import { deadlineToneOf, pillStyle, TONE_VAR, toneOf, type Tone } from "@/lib/tasks/tone";

/**
 * The parts every task wears, in one place: the rail and the tint that carry its state,
 * the eyebrow that names it, the pill that carries the deadline and the chip that names
 * the person. The thread's card (`TaskCard`) draws from here; the list cards of «Задачи»
 * and «Мои дела» have their own head (components/tasks/list, D-82).
 */

/** Left rail plus a breath of the same colour in the corner. Needs a relative, clipped parent. */
export function TaskRail({ tone }: { tone: Tone }) {
  return (
    <>
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: TONE_VAR[tone] }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${TONE_VAR[tone]} 15%, transparent), transparent 70%)` }}
      />
    </>
  );
}

/** «В РАБОТЕ», «ПРОСРОЧЕНО», «ВОПРОС» — the state in one word, in its colour. */
export function StatusEyebrow({
  status,
  overdue = false,
  question = false,
  tone,
}: {
  status: TaskStatus;
  overdue?: boolean;
  question?: boolean;
  tone: Tone;
}) {
  const word =
    overdue && status !== "done"
      ? "Просрочено"
      : question
        ? TEXT.question
        : SHORT_STATUS[status].charAt(0).toUpperCase() + SHORT_STATUS[status].slice(1);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.06em]"
      style={{ color: TONE_VAR[tone] }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />
      {word}
    </span>
  );
}

function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M12 3s5 4.5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3 1-5.5 1-8z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/**
 * The deadline, always with its clock — «без срока» included, so the right edge of every
 * list is one shape. Red past the deadline, amber inside a day, accent further out.
 *
 * «Срочно» без срока (docs/AI.md §10: the director said «срочно» and named no time) is
 * the answer to «когда» too, and a louder one: it takes the slot, in amber and with a
 * flame, instead of a grey «без срока» that contradicts it.
 */
export function DeadlinePill({
  task,
  now = new Date(),
}: {
  task: { deadline: string | null; status: TaskStatus; priority?: string | null };
  now?: Date;
}) {
  const label = deadlineLabel(task, now);
  const urgentNow = isUrgentNow(task);
  return (
    <span
      className="nums inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4"
      style={pillStyle(urgentNow ? "warn" : deadlineToneOf(task, now))}
    >
      {urgentNow ? <FlameIcon /> : <ClockIcon />}
      {urgentNow ? TEXT.urgent : label.text}
    </span>
  );
}

/** Urgent, open, and nobody named a time — the flag is all the «when» this task has. */
export function isUrgentNow(task: { deadline: string | null; status: TaskStatus; priority?: string | null }): boolean {
  if (task.deadline || task.priority !== "high") return false;
  return !(["done", "declined", "revoked"] as TaskStatus[]).includes(task.status);
}

/** Who it is on: initials in the brand circle and the name as the caller wants it. */
export function PersonChip({ fullName, label }: { fullName: string | null | undefined; label?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] leading-4 text-muted">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-[10px] font-bold text-bg"
        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
      >
        {initialsOf(fullName ?? "")}
      </span>
      <span className="truncate">{label ?? fullName ?? "без исполнителя"}</span>
    </span>
  );
}

export { toneOf, TONE_VAR, type Tone };
