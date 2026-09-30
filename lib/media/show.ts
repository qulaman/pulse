import type { QueryClient } from "@tanstack/react-query";

import type { Json } from "@/lib/supabase/types";
import { taskKeys, type TaskMessage } from "@/lib/tasks/queries";

import type { PendingMedia } from "./pending";

/**
 * A voice message or a photo kept on the phone (D-130) stands in its thread at once, with the
 * clock of a row on its way and «ждёт связи» instead of the player: taking it off the screen is
 * the one thing that would make the person record it twice. The row the replay inserts later
 * has the same id and takes its place.
 */
export function showKeptMedia(queryClient: QueryClient, item: PendingMedia, me: { userId: string; fullName: string }): void {
  const queryKey = taskKeys.thread(item.taskId);
  queryClient.setQueryData<TaskMessage[]>(queryKey, (old) => {
    const rest = (old ?? []).filter((message) => message.id !== item.id);
    const lastSeq = rest.length ? rest[rest.length - 1]!.seq : 0;
    const row: TaskMessage = {
      id: item.id,
      task_id: item.taskId,
      company_id: item.companyId,
      sender_id: me.userId,
      // placeholder ordering only: pending rows are excluded from the cursor
      seq: lastSeq + 0.5,
      type: item.kind === "voice" ? "voice" : "photo",
      content: item.text.trim() || null,
      file_path: null,
      meta: { pending: true, kept: true, ...(item.durationMs ? { duration_ms: item.durationMs } : {}) } as Json,
      created_at: item.createdAt,
      sender: { full_name: me.fullName },
    };
    return [...rest, row];
  });
}
