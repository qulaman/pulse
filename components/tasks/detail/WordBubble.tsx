"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Face, stepTime } from "@/components/tasks/list/TaskList";
import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import type { BoardTask } from "@/lib/pulse/board";
import { taskKeys, useOwnReadSeq } from "@/lib/tasks/queries";

/**
 * The other side's newest word, as a small bubble with its author (D-173): a face, the name, when,
 * «новое» while it is unread, and the words in three lines at most. The cards of «Задачи» and
 * «Мои дела» show the thread's last word in it, the task's screen what waits for the reader at the
 * top of its status block. `brief` — the time as a station shows it («9:41» today, «вчера»
 * before), for a card; otherwise with the minute.
 */
export function WordBubble({
  name,
  text,
  at,
  now,
  unread,
  brief = false,
  testId,
}: {
  name: string;
  text: string;
  at: string;
  now: Date;
  unread: boolean;
  brief?: boolean;
  testId?: string;
}) {
  return (
    <div className="mt-3 flex items-start gap-2.5" data-testid={testId}>
      <Face name={name} size={24} />
      <div className="min-w-0 flex-1 rounded-[14px] rounded-tl-[6px] bg-surface-2/80 px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] leading-4 text-muted">
          <span className="font-semibold text-text/90">{shortName(name)}</span>
          <span className="nums">{brief ? stepTime(at, now) : humanAqtobe(new Date(at), now).replace(/^сегодня /, "")}</span>
          {unread ? <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">новое</span> : null}
        </p>
        <p className="mt-0.5 line-clamp-3 text-[14px] leading-[19px] text-text/90">{text}</p>
      </div>
    </div>
  );
}

/**
 * The reader's read cursor on this thread as it stood when the screen opened (D-173). Frozen for
 * the visit: the screen moves the cursor to the end as soon as the thread is on it, and the word
 * must not vanish under the reader's eyes the moment it has been «read».
 * - From the board Лента and «Дела» keep, when it is on the phone.
 * - Otherwise (a push opened the app cold, before the kept board came back) — the person's own row
 *   of `task_reads`, asked once at opening, before the thread on screen moves it. `undefined` while
 *   that answer is on its way: the bubble waits rather than show yesterday's word as if it were the
 *   point. `null` — not known (no row, an error): the word is shown without «новое».
 */
export function useSeenAtOpen(taskId: string, userId: string | undefined): number | null | undefined {
  const queryClient = useQueryClient();
  const fromBoard = () => queryClient.getQueryData<BoardTask[]>(taskKeys.board())?.find((row) => row.id === taskId)?.seen_seq ?? null;
  const [seen, setSeen] = useState<{ taskId: string; seq: number | null | undefined }>(() => ({ taskId, seq: fromBoard() ?? undefined }));
  const asked = useOwnReadSeq(taskId, userId, seen.taskId === taskId && seen.seq === undefined);
  // another task on the same screen: its own cursor, read the same way
  if (seen.taskId !== taskId) {
    const next = { taskId, seq: fromBoard() ?? undefined };
    setSeen(next);
    return next.seq;
  }
  // the server's answer, taken once and kept for the visit
  if (seen.seq === undefined && (asked.isSuccess || asked.isError)) {
    const next = { taskId, seq: asked.isSuccess ? asked.data : null };
    setSeen(next);
    return next.seq;
  }
  return seen.seq;
}
