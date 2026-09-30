"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { toast } from "@/components/ui/Toast";
import { uploadPhotoBlob, type PhotoExt } from "@/lib/files/photo";
import { listMedia, onMediaHandedOver, refreshMedia, type PendingMedia } from "@/lib/media/pending";
import { mediaRound, type MediaDeps } from "@/lib/media/replay";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { taskKeys } from "@/lib/tasks/queries";
import { voiceApi, type AudioExt } from "@/lib/voice/api";

type MessageInsert = Database["public"]["Tables"]["task_messages"]["Insert"];

/** While something waits on the phone, a quiet retry on this beat — `online` events lie on a captive network. */
const RETRY_MS = 30_000;

const deps: MediaDeps = {
  async upload(item: PendingMedia) {
    if (item.kind === "voice") {
      const slot = await voiceApi.uploadUrl({ ext: item.ext as AudioExt, context: "task_message", client_request_id: item.crid });
      await voiceApi.uploadAudio({ signed_url: slot.signed_url, blob: item.blob, mime: item.mime });
      return slot.audio_path;
    }
    return uploadPhotoBlob(item.blob, item.ext as PhotoExt, item.crid);
  },
  async insertMessage(row) {
    const { error } = await createBrowserSupabase()
      .from("task_messages")
      .insert(row as unknown as MessageInsert);
    return { error: error ? { message: error.message } : null };
  },
  async handIn(item, filePath) {
    let res: Response;
    try {
      res = await fetch(`/api/tasks/${item.taskId}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to_status: "pending_review",
          report: { ...(item.text.trim() ? { text: item.text.trim() } : {}), file_path: filePath, ...(item.partial ? { partial: true } : {}) },
          client_request_id: item.id,
        }),
      });
    } catch {
      return { status: 0 };
    }
    if (res.ok) return { status: res.status };
    let message: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message_ru?: unknown } } | null;
      if (typeof body?.error?.message_ru === "string") message = body.error.message_ru;
    } catch {
      // no body: the status says enough
    }
    return { status: res.status, message };
  },
};

/**
 * The files the phone kept (D-130) — a voice message or a photo of a thread, a report with a
 * photo — go out on start, when the network is back, when the app comes to the front, and on a
 * slow beat while something waits. For everyone signed in: employees answer by voice from the
 * site as much as the director does. The person is read from the session, not from /api/me.
 */
export function MediaReplay() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    let running = false;
    const round = async () => {
      if (running || !onlineManager.isOnline()) return;
      running = true;
      try {
        const { data } = await createBrowserSupabase().auth.getSession();
        const userId = data.session?.user.id;
        if (!userId || (await listMedia(userId)).length === 0) return;
        const { sent, refused } = await mediaRound(userId, deps);
        refreshMedia();
        if (!alive) return;
        if (sent + refused.length > 0) {
          void queryClient.invalidateQueries({ queryKey: ["task-thread"] });
          void queryClient.invalidateQueries({ queryKey: taskKeys.root });
        }
        if (sent > 0) {
          kickPush();
          toast(sent === 1 ? "Отправил то, что ждало связи" : `Отправил ${sent}, что ждало связи`);
        }
        if (refused.length > 0) toast(`Не прошло то, что ждало связи: ${refused[0]}`);
      } finally {
        running = false;
      }
    };
    void round();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void round();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void round();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(() => void round(), RETRY_MS);
    const offHanded = onMediaHandedOver(() => void round());
    return () => {
      alive = false;
      offOnline();
      offHanded();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [queryClient]);

  return null;
}
