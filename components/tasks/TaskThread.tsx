"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { formatAqtobe } from "@/lib/ai/time";
import type { TaskActions } from "@/lib/tasks/mutations";
import { isPendingMessage, type TaskMessage } from "@/lib/tasks/queries";
import { statusChangeLine, TEXT } from "@/lib/tasks/status-text";

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

function MessageRow({ message }: { message: TaskMessage }) {
  const flags = messageFlags(message);
  const time = formatAqtobe(new Date(message.created_at));

  if (message.type === "status_change") {
    return (
      <p className="py-1 text-center text-[13px] leading-4 text-muted">
        {statusChangeLine(flags.newStatus ?? "")} · <span className="nums">{time}</span>
      </p>
    );
  }

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
    <div
      className={`rounded-[12px] border ${tone} bg-surface px-3 py-2 ${
        isPendingMessage(message) ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] leading-4 text-muted">
          {message.sender?.full_name ?? "—"}
          {label ? ` · ${label}` : ""}
        </span>
        <span className="nums text-[13px] leading-4 text-muted">{time}</span>
      </div>
      {message.content ? (
        <p className="mt-1 text-[16px] leading-[22px]">{message.content}</p>
      ) : null}
    </div>
  );
}

export function TaskThread({
  messages,
  loading,
  taskId,
  companyId,
  actions,
}: {
  messages: TaskMessage[] | undefined;
  loading: boolean;
  taskId: string;
  companyId: string;
  actions: TaskActions;
}) {
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    actions.sendMessage({ taskId, companyId, text });
    setDraft("");
  };

  return (
    <>
      <div className="mt-4 flex flex-col gap-2 pb-28">
        {loading ? (
          <p className="text-[14px] leading-[18px] text-muted">Загружаю переписку…</p>
        ) : (messages?.length ?? 0) === 0 ? (
          <p className="text-[14px] leading-[18px] text-muted">Сообщений пока нет</p>
        ) : (
          messages!.map((message) => <MessageRow key={message.id} message={message} />)
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <textarea
            className="min-h-[44px] flex-1 rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] outline-none placeholder:text-muted focus:border-accent"
            rows={1}
            placeholder={TEXT.composerPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button onClick={send} disabled={!draft.trim()}>
            {"Отправить"}
          </Button>
        </div>
      </div>
    </>
  );
}
