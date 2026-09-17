"use client";

import { useState } from "react";

/**
 * A voice message in the thread. The URL is signed on tap, never on render: a thread
 * of thirty recordings must not sign thirty objects nobody plays. While the transcript
 * is still being written the row shows the player alone — the recording is already
 * safe (принцип 5), the words catch up over Realtime.
 */
export function VoiceMessage({ messageId }: { messageId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/files/url?message_id=${encodeURIComponent(messageId)}`, { credentials: "include" });
      if (!res.ok) throw new Error("file url failed");
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (url) return <audio className="mt-2 w-full max-w-[260px]" controls preload="none" src={url} autoPlay />;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="flex min-h-[36px] items-center gap-2 rounded-full border border-border bg-surface-2 px-3 text-[14px] leading-4 text-text transition-transform duration-[120ms] active:scale-[0.98]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
        {loading ? "Открываю…" : "Голосовое"}
      </button>
      {failed ? <p className="mt-1 text-[13px] leading-4 text-danger">Не открылось. Попробуй позже</p> : null}
    </div>
  );
}
