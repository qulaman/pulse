"use client";

import { VoicePlayer } from "@/components/tasks/VoicePlayer";
import { TEXT } from "@/lib/tasks/status-text";

/**
 * The original recording behind the task — the same player as a voice message in
 * the thread, so a card never shows two different transports (D-66). The signed URL
 * is fetched on tap, not on render: a feed of twenty cards must not sign twenty
 * objects nobody plays.
 */
export function AudioOriginal({ path }: { path: string }) {
  const load = async () => {
    const res = await fetch(`/api/voice/audio-url?path=${encodeURIComponent(path)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("audio url failed");
    const body = (await res.json()) as { url: string };
    return body.url;
  };

  return (
    <div className="mt-2">
      <p className="text-[12px] leading-4 text-muted">{TEXT.original}</p>
      <VoicePlayer load={load} seed={path} failedText={TEXT.audioFailed} />
    </div>
  );
}
