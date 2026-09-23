"use client";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { hasUnread, type BoardTask } from "@/lib/pulse/board";
import { statusWord, stepsOf } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, TEXT } from "@/lib/tasks/status-text";

import { Icon } from "../desk/icons";
import { CardFoot, CardHead, CardShell, LastWord, Note, Stepper } from "./TaskList";

export type EmployeeAction = "accept" | "ask" | "decline" | "complete";

/**
 * A card of «Мои дела». Closed: the state mark, the title, «when», the state. Open: what
 * the director wrote and said (the recording and the words), a return for rework, the
 * director's last word, the four steps and the buttons of FRONTEND «Состояние задачи →
 * набор кнопок» — Принял / Уточнить / Не могу on a new task (принцип 2), «Выполнено» on
 * work in hand. «Уточнить» stays next to «Выполнено»: a question mid-work is the same
 * message with `is_question`, not a new action.
 */
export function EmployeeTaskCard({
  task,
  row,
  meId,
  open,
  now,
  onToggle,
  onAction,
  onThread,
}: {
  task: TaskWithPeople;
  row: BoardTask | undefined;
  meId: string;
  open: boolean;
  now: Date;
  onToggle: () => void;
  onAction: (action: EmployeeAction, task: TaskWithPeople) => void;
  onThread: (task: TaskWithPeople) => void;
}) {
  const unread = row ? hasUnread(row, meId) : false;
  const closed = task.status === "done" || task.status === "revoked" || task.status === "declined";
  const last = row?.last_message ?? null;
  const lastText = last
    ? last.type === "photo"
      ? `фото${last.content ? ` · ${last.content}` : ""}`
      : last.type === "voice"
        ? `голосовое${last.content ? ` · ${last.content}` : ""}`
        : (last.content ?? "")
    : "";
  const lastName = last ? (last.sender_id === meId ? "Вы" : (task.author?.full_name ?? "Директор")) : "";
  const author = task.author?.full_name?.trim().split(/\s+/)[0];

  return (
    <CardShell
      id={task.id}
      open={open}
      closed={closed}
      onToggle={onToggle}
      testId="my-task"
      status={task.status}
      head={
        <CardHead
          task={task}
          now={now}
          open={open}
          unread={unread}
          closed={closed}
          word={statusWord(task, "employee", now)}
          wordTone={task.status === "sent" ? "accent" : task.status === "rework" ? "warn" : undefined}
        />
      }
    >
      <div className="pl-[34px]">
        {task.body ? <p className="whitespace-pre-line text-[15px] leading-[21px] text-text/85">{task.body}</p> : null}
        <p className={`${task.body ? "mt-2" : ""} text-[13px] leading-[18px] text-muted`}>
          {author ? `Поручил ${author} · ` : ""}
          <span className="nums">{humanAqtobe(new Date(task.created_at), now)}</span>
        </p>

        {task.status === "rework" ? (
          <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
            {TEXT.reworkBanner}
          </Note>
        ) : null}
        {task.status === "revoked" ? (
          <Note tone="muted" icon={<Icon name="undo" size={15} />}>
            {TEXT.revoked}
          </Note>
        ) : null}
        {task.status === "declined" ? (
          <Note tone="danger" icon={<Icon name="hand" size={15} />}>
            Отказ отправлен директору
          </Note>
        ) : null}

        {last && lastText ? <LastWord name={lastName} text={lastText} at={last.created_at} now={now} unread={unread} /> : null}

        {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
        {/* a typed order's «transcript» is its own title — only a voice one says something new */}
        {task.source_transcript && task.source_transcript.trim() !== task.title.trim() ? (
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] leading-4 text-muted [&::-webkit-details-marker]:hidden">
              <Icon name="quote" size={14} />
              {TEXT.transcriptSpoiler}
              <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">
                ▾
              </span>
            </summary>
            <blockquote
              className="mt-2 border-l-2 pl-3 text-[14px] italic leading-[19px] text-muted"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
            >
              «{task.source_transcript}»
            </blockquote>
          </details>
        ) : null}
      </div>

      <div className="mt-4">
        <Stepper steps={stepsOf(task, now)} now={now} deadline={task.deadline} />
      </div>

      {task.status === "sent" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button data-testid="task-action-accept" className="!px-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onAction("accept", task)}>
            {BUTTON.accept}
          </Button>
          <Button variant="secondary" className="!px-2 whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onAction("ask", task)}>
            {BUTTON.ask}
          </Button>
          <Button variant="danger" className="!px-2 whitespace-nowrap" icon={<Icon name="x" />} onClick={() => onAction("decline", task)}>
            {BUTTON.cant}
          </Button>
        </div>
      ) : task.status === "accepted" || task.status === "in_progress" || task.status === "rework" ? (
        <div className="mt-4 grid grid-cols-[1.4fr_1fr] gap-2">
          <Button data-testid="task-action-complete" className="whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onAction("complete", task)}>
            {BUTTON.complete}
          </Button>
          <Button variant="secondary" className="whitespace-nowrap" icon={<Icon name="question" />} onClick={() => onAction("ask", task)}>
            {BUTTON.ask}
          </Button>
        </div>
      ) : task.status === "pending_review" ? (
        <p className="mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-surface-2/70 text-[14px] text-muted">
          <Icon name="clock" size={16} />
          {TEXT.underReview}
          {task.completed_at ? <span className="nums">· сдано {humanAqtobe(new Date(task.completed_at), now)}</span> : null}
        </p>
      ) : null}

      <CardFoot onThread={() => onThread(task)} />
    </CardShell>
  );
}
