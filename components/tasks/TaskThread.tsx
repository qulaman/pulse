"use client";

import { humanAqtobe } from "@/lib/ai/time";
import type { TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";

/**
 * What the meta of a message means, and the dates of an order. The thread itself lives
 * in components/tasks/thread/* — one feed of words, files and the order own history
 * (D-64 §4); this file holds what both the thread and the card read.
 */

type MessageFlags = {
  isQuestion: boolean;
  answered: boolean;
  declineReason: boolean;
  reworkComment: boolean;
  /** The words of a handover: they arrive inside transition_task (D-64 §3). */
  report: boolean;
  newStatus: string | null;
};

export function messageFlags(message: TaskMessage): MessageFlags {
  const meta = message.meta;
  const record =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};

  return {
    isQuestion: record.is_question === true,
    answered: Boolean(record.answered_at),
    declineReason: record.decline_reason === true,
    reworkComment: record.rework_comment === true,
    report: record.report === true,
    newStatus: typeof record.new_status === "string" ? record.new_status : null,
  };
}

/** The newest decline reason of the thread — the card shows it next to «Отказ». */
export function latestDeclineReason(messages: TaskMessage[] | undefined): string | null {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index];
    if (messageFlags(message).declineReason && message.content) return message.content;
  }
  return null;
}

/** The newest question still waiting for the director — the card offers quick answers. */
export function latestOpenQuestion(messages: TaskMessage[] | undefined): string | null {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages![index];
    const flags = messageFlags(message);
    if (flags.isQuestion && !flags.answered && message.content) return message.content;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Сроки — the dates that matter, in one glance                                */
/* -------------------------------------------------------------------------- */

function DateRow({ label, iso, tone }: { label: string; iso: string | null; tone?: "danger" | "ok" | "muted" }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "ok" ? "var(--ok)" : "var(--text)";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px] leading-4 text-muted">{label}</span>
      <span className="nums text-[14px] leading-[18px]" style={{ color: iso ? color : "var(--text-muted)" }}>
        {iso ? humanAqtobe(new Date(iso)) : "—"}
      </span>
    </div>
  );
}

export function TaskDates({ task }: { task: TaskWithPeople }) {
  const overdue = isOverdue(task);
  return (
    <section className="mt-4 card px-4 py-2">
      <h2 className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Сроки</h2>
      <DateRow label="Создана" iso={task.created_at} />
      {task.status === "scheduled" ? <DateRow label="Отправится" iso={task.scheduled_send_at} /> : null}
      <DateRow label={overdue ? "Срок · просрочено" : "Срок"} iso={task.deadline} tone={overdue ? "danger" : undefined} />
      <DateRow label="Принял" iso={task.accepted_at} tone={task.accepted_at ? "ok" : undefined} />
      <DateRow label="Выполнил" iso={task.completed_at} tone={task.completed_at ? "ok" : undefined} />
      <DateRow label="Закрыта" iso={task.closed_at} tone={task.closed_at ? "ok" : undefined} />
    </section>
  );
}
