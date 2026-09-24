"use client";

import { useEffect } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { outboxSize, replayOutbox } from "@/lib/outbox";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { taskKeys } from "@/lib/tasks/queries";
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
      if (outboxSize() === 0) return;
      // a paused mutation in this session resumes by itself and clears its own entry
      if (queryClient.getMutationCache().getAll().some((m) => m.state.isPaused)) return;
      const { sent } = await replayOutbox(writeMessage);
      if (cancelled || sent === 0) return;
      kickPush();
      void queryClient.invalidateQueries({ queryKey: taskKeys.root });
      void queryClient.invalidateQueries({ queryKey: ["task-thread"] });
      toast(sent === 1 ? "Отправил то, что ждало связи" : `Отправил ${sent}, что ждало связи`);
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
