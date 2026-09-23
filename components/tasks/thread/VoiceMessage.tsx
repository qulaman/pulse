"use client";

import { VoicePlayer } from "@/components/tasks/VoicePlayer";

/**
 * A voice message in the thread. Ten seconds of somebody's own voice, played as
 * it was said — no transcript underneath (D-66): a recording this short is faster
 * to hear than to read, and the words were never worth an STT call.
 */
export function VoiceMessage({ messageId, durationMs }: { messageId: string; durationMs?: number | null }) {
  const load = async () => {
    const res = await fetch(`/api/files/url?message_id=${encodeURIComponent(messageId)}`, { credentials: "include" });
    if (!res.ok) throw new Error("file url failed");
    const body = (await res.json()) as { url: string };
    return body.url;
  };

  return <VoicePlayer load={load} durationMs={durationMs} seed={messageId} />;
}
