"use client";

import { humanAqtobe } from "@/lib/ai/time";
import { PhotoMessage } from "@/components/tasks/PhotoMessage";
import { messageFlags } from "@/components/tasks/TaskThread";
import type { TaskMessage } from "@/lib/tasks/queries";
import { TIME_ANSWER_WORD } from "@/lib/tasks/lifecycle";
import { messageState } from "@/lib/tasks/thread";
import { TEXT } from "@/lib/tasks/status-text";
import { VoiceMessage } from "./VoiceMessage";

/** How long the recording is, as the sender's phone measured it (D-66); older rows have none. */
function durationOf(message: TaskMessage): number | null {
  const value = (message.meta as { duration_ms?: unknown } | null)?.duration_ms;
  return typeof value === "number" && value > 0 ? value : null;
}

/** A clock while the row is on its way, a tick once the thread holds it. */
function StateMark({ state }: { state: "pending" | "sent" }) {
  if (state === "pending") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="отправляю" className="text-muted">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="отправлено" className="text-muted">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * One word of the thread. The labels that matter stay («Причина отказа», «Отчёт»,
 * «вопрос · отвечено»); everything else is the bubble, the time and — on one’s own
 * rows — how far it got.
 */
export function MessageRow({ message, mine, onRetry }: { message: TaskMessage; mine: boolean; onRetry?: (message: TaskMessage) => void }) {
  const flags = messageFlags(message);
  const state = messageState(message);
  const time = humanAqtobe(new Date(message.created_at));

  const label = flags.report
    ? flags.partial
      ? "Отчёт · сделано не всё"
      : "Отчёт"
    : flags.timeRequest
      ? `Просьба о сроке · ${flags.timeAnswer ? TIME_ANSWER_WORD[flags.timeAnswer] : "ждёт ответа"}`
      : flags.handoffNote
        ? "При передаче"
        : flags.declineReason
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
    : flags.reworkComment || flags.partial
      ? "border-warn/40"
      : (flags.isQuestion && !flags.answered) || (flags.timeRequest && !flags.timeAnswer)
        ? "border-accent/40"
        : "border-border";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[14px] border ${tone} px-3 py-2 ${mine ? "rounded-br-[4px] bg-surface-2" : "rounded-bl-[4px] bg-surface"} ${
          state === "pending" ? "opacity-60" : ""
        }`}
        data-testid="message-row"
        data-state={state}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] leading-4 text-muted">
            {mine ? "Вы" : (message.sender?.full_name ?? "—")}
            {label ? ` · ${label}` : ""}
          </span>
          <span className="nums flex items-center gap-1 text-[12px] leading-4 text-muted">
            {time}
            {mine && state !== "failed" ? <StateMark state={state} /> : null}
          </span>
        </div>

        {message.content ? <p className="mt-1 text-[16px] leading-[22px]">{message.content}</p> : null}

        {message.type === "photo" && message.file_path && state === "sent" ? <PhotoMessage messageId={message.id} /> : null}
        {message.type === "voice" && state === "sent" ? (
          <VoiceMessage messageId={message.id} durationMs={durationOf(message)} />
        ) : null}

        {state === "failed" ? (
          <button
            type="button"
            onClick={() => onRetry?.(message)}
            className="mt-1 text-[13px] leading-4 text-danger underline decoration-dotted underline-offset-2"
          >
            не отправилось · повторить
          </button>
        ) : null}
      </div>
    </div>
  );
}
