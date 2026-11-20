"use client";

import { Composer } from "@/components/tasks/thread/Composer";
import { ThreadTail } from "@/components/tasks/thread/ThreadTail";
import { Chip } from "@/components/ui/Chip";
import type { BoardTask } from "@/lib/pulse/board";
import { otherSideOf } from "@/lib/pulse/employee";
import type { TaskActions } from "@/lib/tasks/mutations";

/**
 * A director's unread word on a task: the tail of the thread, «Прочитал», and a reply
 * line right here (D-64 §5), laid out as on the task's own screen — one composer, the same
 * place for the microphone and «+» wherever the person answers (D-173). The card opens the
 * thread over Лента, never a page.
 */
export function MessageRow({
  task,
  companyId,
  meId,
  actions,
  onRead,
  onOpen,
}: {
  task: BoardTask;
  companyId: string;
  meId: string;
  actions: TaskActions;
  onRead: (seq: number) => void;
  onOpen: () => void;
}) {
  const last = task.last_message!;
  return (
    <article className="relative overflow-hidden rounded-[20px] border border-border bg-surface p-4 pl-5" data-testid="message-row">
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: "var(--warn)" }} />
      <span className="block text-[13px] leading-4 text-muted">{otherSideOf(task)}</span>
      <button type="button" onClick={onOpen} className="mt-1 block w-full text-left">
        <span className="line-clamp-2 text-[17px] font-semibold leading-[22px] text-text">{task.title}</span>
      </button>
      <ThreadTail taskId={task.id} meId={meId} enabled />
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip className="!min-h-[44px]" onClick={() => onRead(last.seq)}>Прочитал</Chip>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface-2 px-3 font-display text-[13px] font-semibold leading-4 text-text"
        >
          Открыть переписку ›
        </button>
      </div>
      <div className="mt-2">
        <Composer taskId={task.id} companyId={companyId} actions={actions} inline />
      </div>
    </article>
  );
}
