"use client";

import { useEffect } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { outboxSize, replayOutbox, takeStale } from "@/lib/outbox";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { taskKeys } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import type { Database } from "@/lib/supabase/types";

type MessageInsert = Database["public"]["Tables"]["task_messages"]["Insert"];

const writeMessage = async (row: unknown) => {
  const { error } = await createBrowserSupabase().from("task_messages").insert(row as MessageInsert);
  return { error: error ? { message: error.message } : null };
};

/**
 * On app start: whatever a previous session could not send (lib/outbox.ts) goes out now,
 * once, under its original idempotency key, and the task lists refresh. Also when the
 * network comes back with nothing paused in memory (the tab was reloaded meanwhile).
 */
export function OutboxReplay() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // reading the outbox drops what waited too long to still mean anything — and says so (D-130)
      const size = outboxSize();
      const dropped = takeStale();
      if (dropped > 0) {
        toast(`Не отправил ${dropped} ${pluralRu(dropped, ["действие", "действия", "действий"])}: больше суток без связи. Сделай ещё раз, если нужно`);
      }
      if (size === 0) return;
      // a paused mutation in this session resumes by itself and clears its own entry
      if (queryClient.getMutationCache().getAll().some((m) => m.state.isPaused)) return;
      const { sent, refused } = await replayOutbox(writeMessage);
      if (cancelled || sent + refused.length === 0) return;
      if (sent > 0) kickPush();
      void queryClient.invalidateQueries({ queryKey: taskKeys.root });
      void queryClient.invalidateQueries({ queryKey: ["task-thread"] });
      // the dictionary's words and names go through the same outbox (D-111)
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      void queryClient.invalidateQueries({ queryKey: ["dictionary"] });
      if (sent > 0) toast(sent === 1 ? "Отправил то, что ждало связи" : `Отправил ${sent}, что ждало связи`);
      // the server refused a tap made without network (the task moved on meanwhile): the person
      // hears it in the server's words instead of finding the tap silently gone (D-130)
      if (refused.length > 0) {
        toast(
          refused.length === 1
            ? `Не прошло то, что ждало связи: ${refused[0]}`
            : `Не прошло ${refused.length} из того, что ждало связи: ${refused[0]}`,
        );
      }
    };
    void run();
    const unsubscribe = onlineManager.subscribe((online) => {
      if (online) void run();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient]);

  return null;
}
