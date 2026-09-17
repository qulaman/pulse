"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Sheet } from "@/components/ui/Sheet";
import type { TaskActions } from "@/lib/tasks/mutations";
import { useTaskMessages } from "@/lib/tasks/queries";
import { ThreadView } from "./ThreadView";

/**
 * The thread over Пульс (D-64 §5): the director answers without leaving the board —
 * the screen behind stays mounted, so the deck, the balls and the mascot are exactly
 * where they were when the sheet closes.
 *
 * Boundaries, so this does not grow into a messenger (D-64 §6): a chat exists only
 * inside a task — there are no private or group chats, and none are planned; nobody
 * is «печатает»; reactions wait for the adaptation gate (D-40). The employee still has
 * three buttons on a card — the input lives in the thread and in the reply line, never
 * as a fourth button.
 */
export function ThreadSheet({
  open,
  onClose,
  taskId,
  title,
  companyId,
  userId,
  actions,
  isDirector = false,
}: {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  title: string;
  companyId: string;
  userId: string | undefined;
  actions: TaskActions;
  isDirector?: boolean;
}) {
  // the thread is fetched only while the sheet is up
  const messages = useTaskMessages(taskId ?? "", open && Boolean(taskId));
  const rows = messages.data;
  const newestSeq = (rows ?? []).reduce((max, message) => Math.max(max, message.seq), 0);
  const markRead = actions.markRead;

  // The thread on screen is a thread seen (D-61), exactly as on its own page — but once
  // per cursor: over Пульс the mutation repaints the board, the board hands the sheet a
  // fresh `actions` object, and an effect keyed on that identity would call itself for
  // ever (React: «Maximum update depth exceeded»).
  const marked = useRef("");
  useEffect(() => {
    if (!open || !taskId || !companyId || newestSeq === 0) return;
    const cursor = `${taskId}:${newestSeq}`;
    if (marked.current === cursor) return;
    marked.current = cursor;
    markRead({ taskId, companyId, seq: newestSeq });
  }, [open, taskId, companyId, newestSeq, markRead]);

  if (!taskId) return null;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex h-[74dvh] flex-col">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 className="line-clamp-2 text-[17px] font-semibold leading-[22px]">{title}</h2>
          <Link href={`/tasks/${taskId}`} className="shrink-0 text-[13px] leading-4 text-accent">
            Открыть полностью ›
          </Link>
        </div>
        <ThreadView
          taskId={taskId}
          companyId={companyId}
          messages={rows}
          loading={messages.isLoading}
          userId={userId}
          actions={actions}
          isDirector={isDirector}
          compact
        />
      </div>
    </Sheet>
  );
}
