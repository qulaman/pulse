"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { GENERIC_ERROR } from "@/lib/api/client";
import { isNetworkError, NetworkError } from "@/lib/net";
import { dequeue, enqueue } from "@/lib/outbox";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";

import { taskKeys, type Me, type TaskMessage } from "./query-core";
import { invalidateTasks } from "./task-cache";
import { markFailed } from "./thread";

/* -------------------------------------------------------------------------- */
/* Messages — straight into task_messages under RLS                            */
/* -------------------------------------------------------------------------- */

export type SendMessageInput = {
  taskId: string;
  companyId: string;
  text: string;
  /** `{ is_question: true }` for «Уточнить» (D-03). */
  meta?: Record<string, unknown>;
  /** Storage path of the attachment — `photos` for a photo, `voice` for a recording. */
  filePath?: string | null;
  /** Derived from `filePath` when omitted; a voice message says so itself. */
  type?: "text" | "photo" | "voice";
  /** A retry sends the very same row again — same id, so nothing is duplicated (принцип 7). */
  id?: string;
};

function typeOf(input: Pick<SendMessageInput, "type" | "filePath">): "text" | "photo" | "voice" {
  return input.type ?? (input.filePath ? "photo" : "text");
}

/**
 * The id is generated on the client and inserted explicitly, so the optimistic
 * row and the row that comes back are the same row — mergeBySeq dedupes them
 * instead of showing the message twice.
 */
export function useSendMessage(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput & { id: string }) => {
      if (!me) throw new Error(GENERIC_ERROR);
      const supabase = createBrowserSupabase();
      const row = {
        id: input.id,
        task_id: input.taskId,
        company_id: input.companyId,
        sender_id: me.userId,
        type: typeOf(input),
        content: input.text || null,
        file_path: input.filePath ?? null,
        meta: (input.meta ?? {}) as Json,
      };
      const { error } = await supabase.from("task_messages").insert(row);
      if (error && isNetworkError(error)) {
        // the row waits in the persisted outbox too — a closed tab must not lose the words
        enqueue({ id: input.id, kind: "message", path: "task_messages", payload: row });
        throw new NetworkError();
      }
      if (error) throw new Error(GENERIC_ERROR);
      dequeue(input.id);
      // the other side hears it now, not on the minute sweep (D-114)
      kickPush();
    },
    onMutate: async (input) => {
      const queryKey = taskKeys.thread(input.taskId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskMessage[]>(queryKey);

      // a retry of a failed row replaces it in place; a new row goes to the end
      const withoutRetry = (previous ?? []).filter((message) => message.id !== input.id);

      if (me) {
        const pending: TaskMessage = {
          id: input.id,
          task_id: input.taskId,
          company_id: input.companyId,
          sender_id: me.userId,
          // Placeholder ordering only: pending rows are excluded from the cursor.
          seq: (previous?.length ? previous[previous.length - 1].seq : 0) + 0.5,
          type: typeOf(input),
          content: input.text || null,
          file_path: input.filePath ?? null,
          meta: { ...(input.meta ?? {}), pending: true } as Json,
          created_at: new Date().toISOString(),
          sender: { full_name: me.fullName },
        };
        queryClient.setQueryData<TaskMessage[]>(queryKey, [...withoutRetry, pending]);
      }

      return { previous, queryKey };
    },
    onError: (error, input, context) => {
      if (!context) return;
      // No network: the row is in the persisted outbox and will arrive — it stays on
      // screen with its clock, because taking the words away is the one thing that
      // would make the person write them twice (принцип 5, DoD «оффлайн»).
      if (error instanceof NetworkError || isNetworkError(error)) return;
      queryClient.setQueryData<TaskMessage[]>(context.queryKey, (old) => markFailed(old, input.id));
      toast(GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}
