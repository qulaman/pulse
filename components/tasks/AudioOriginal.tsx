"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { TEXT } from "@/lib/tasks/status-text";

/**
 * The original recording behind the task. The signed URL is fetched on tap, not
 * on render: a feed of twenty cards must not sign twenty objects nobody plays.
 */
export function AudioOriginal({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/voice/audio-url?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("audio url failed");
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (url) {
    return <audio className="mt-3 w-full" controls preload="none" src={url} />;
  }

  return (
    <div className="mt-3">
      <Button variant="secondary" onClick={open} disabled={loading}>
        ▶️ {TEXT.original}
      </Button>
      {failed ? (
        <p className="mt-2 text-[13px] leading-4 text-danger">{TEXT.audioFailed}</p>
      ) : null}
    </div>
  );
}
