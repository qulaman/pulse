"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Face } from "@/components/tasks/list/TaskList";
import { humanAqtobe } from "@/lib/ai/time";
import type { BoardTask } from "@/lib/pulse/board";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { taskKeys } from "@/lib/tasks/queries";

/**
 * The other side's newest word in the status block of the task's screen (D-173) — the look of
 * «Дела»'s last-word bubble (components/tasks/list/TaskList.tsx `LastWord`): a face, the first
 * name, when, «новое» while it is unread, and the words in three lines at most. The whole
 * conversation stays below; this is only what waits for the reader.
 */
export function WordBubble({ name, text, at, now, unread }: { name: string; text: string; at: string; now: Date; unread: boolean }) {
  return (
    <div className="mt-3 flex items-start gap-2.5" data-testid="task-word">
      <Face name={name} size={24} />
      <div className="min-w-0 flex-1 rounded-[14px] rounded-tl-[6px] bg-surface-2/80 px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] leading-4 text-muted">
          <span className="font-semibold text-text/90">{name.split(/\s+/)[0]}</span>
          <span className="nums">{humanAqtobe(new Date(at), now).replace(/^сегодня /, "")}</span>
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
  const asked = useQuery({
    queryKey: [...taskKeys.root, "seen-at-open", taskId, userId ?? ""],
    queryFn: async () => {
      const { data, error } = await createBrowserSupabase()
        .from("task_reads")
        .select("last_seq")
        .eq("task_id", taskId)
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.last_seq ?? 0;
    },
    enabled: seen.taskId === taskId && seen.seq === undefined && Boolean(userId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
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
