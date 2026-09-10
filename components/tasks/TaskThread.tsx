"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { PhotoMessage } from "./PhotoMessage";
import type { TaskActions } from "@/lib/tasks/mutations";
import { isPendingMessage, type TaskMessage, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, STATUS_LABEL, TEXT, type TaskStatus } from "@/lib/tasks/status-text";

type MessageFlags = {
  isQuestion: boolean;
  answered: boolean;
  declineReason: boolean;
  reworkComment: boolean;
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
    <section className="mt-4 rounded-[16px] border border-border bg-surface px-4 py-2">
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

/* -------------------------------------------------------------------------- */
/* Хронология — status changes as a vertical line                              */
/* -------------------------------------------------------------------------- */

const STATUS_TONE: Partial<Record<TaskStatus, string>> = {
  accepted: "var(--accent)",
  pending_review: "var(--warn)",
  done: "var(--ok)",
  rework: "var(--warn)",
  declined: "var(--danger)",
  revoked: "var(--text-muted)",
};

export function TaskTimeline({ task, messages }: { task: TaskWithPeople; messages: TaskMessage[] | undefined }) {
  const events = [
    { id: "created", label: task.status === "scheduled" ? "Запланирована" : "Отправлена", at: task.created_at, tone: "var(--text-muted)" },
    ...(messages ?? [])
      .filter((m) => m.type === "status_change")
      .map((m) => {
        const status = messageFlags(m).newStatus as TaskStatus | null;
        return {
          id: m.id,
          label: status ? (STATUS_LABEL[status] ?? status) : "Статус изменён",
          at: m.created_at,
          tone: (status && STATUS_TONE[status]) || "var(--text-muted)",
        };
      }),
  ];

  return (
    <section className="mt-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Хронология</h2>
      <ol className="mt-2 border-l border-border pl-4">
        {events.map((event) => (
          <li key={event.id} className="relative py-1.5">
            <span
              aria-hidden
              className="absolute -left-[21px] top-[11px] h-2.5 w-2.5 rounded-full border-2 border-bg"
              style={{ background: event.tone }}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] leading-[18px]">{event.label}</span>
              <span className="nums text-[13px] leading-4 text-muted">{humanAqtobe(new Date(event.at))}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Чат — the people talking, the composer at the bottom                        */
/* -------------------------------------------------------------------------- */

function MessageRow({ message, mine }: { message: TaskMessage; mine: boolean }) {
  const flags = messageFlags(message);
  const time = humanAqtobe(new Date(message.created_at));

  const label = flags.declineReason
    ? "Причина отказа"
    : flags.reworkComment
      ? "Комментарий к доработке"
      : flags.isQuestion
        ? flags.answered
          ? `${TEXT.question} · ${TEXT.answered}`
          : TEXT.question
        : null;

  const tone = flags.declineReason
    ? "border-danger/40"
    : flags.reworkComment
      ? "border-warn/40"
      : flags.isQuestion && !flags.answered
        ? "border-accent/40"
        : "border-border";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[14px] border ${tone} px-3 py-2 ${mine ? "rounded-br-[4px] bg-surface-2" : "rounded-bl-[4px] bg-surface"} ${
          isPendingMessage(message) ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] leading-4 text-muted">
            {mine ? "Вы" : (message.sender?.full_name ?? "—")}
            {label ? ` · ${label}` : ""}
          </span>
          <span className="nums text-[12px] leading-4 text-muted">{time}</span>
        </div>
        {message.content ? <p className="mt-1 text-[16px] leading-[22px]">{message.content}</p> : null}
        {message.type === "photo" && message.file_path && !isPendingMessage(message) ? (
          <PhotoMessage path={message.file_path} />
        ) : null}
      </div>
    </div>
  );
}

export function TaskChat({
  messages,
  loading,
  taskId,
  companyId,
  userId,
  actions,
}: {
  messages: TaskMessage[] | undefined;
  loading: boolean;
  taskId: string;
  companyId: string;
  userId: string | undefined;
  actions: TaskActions;
}) {
  const [draft, setDraft] = useState("");
  const chat = (messages ?? []).filter((m) => m.type !== "status_change" && m.type !== "system");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    actions.sendMessage({ taskId, companyId, text });
    setDraft("");
  };

  return (
    <>
      <section className="mt-4 pb-28">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Чат</h2>
        <div className="mt-2 flex flex-col gap-2">
          {loading ? (
            <p className="text-[14px] leading-[18px] text-muted">Загружаю переписку…</p>
          ) : chat.length === 0 ? (
            <p className="text-[14px] leading-[18px] text-muted">Сообщений пока нет. Вопрос или уточнение — сюда</p>
          ) : (
            chat.map((message) => <MessageRow key={message.id} message={message} mine={message.sender_id === userId} />)
          )}
        </div>
      </section>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <textarea
            className="min-h-[44px] flex-1 rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] outline-none placeholder:text-muted focus:border-accent"
            rows={1}
            placeholder={TEXT.composerPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
            }}
          />
          <Button onClick={send} disabled={!draft.trim()}>
            Отправить
          </Button>
        </div>
      </div>
    </>
  );
}
