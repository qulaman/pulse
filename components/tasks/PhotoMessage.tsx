"use client";

import { useEffect, useState } from "react";

/** A photo in the thread: signed on mount (a thread holds a handful, not a feed). */
export function PhotoMessage({ messageId }: { messageId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/url?message_id=${encodeURIComponent(messageId)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("file url failed"))))
      .then((body: { url: string }) => {
        if (!cancelled) setUrl(body.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (failed) return <p className="mt-2 text-[13px] leading-4 text-danger">Фото не открылось. Попробуй позже</p>;

  // one fixed frame (4:3, capped) for the placeholder and the photo alike — the thread never reflows
  const frame = "mt-2 block w-full max-h-[320px] overflow-hidden rounded-[12px] border border-border";
  if (!url) return <div className={`skeleton ${frame} aspect-[4/3] bg-surface-2`} aria-label="Загружаю фото" />;

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${frame} aspect-[4/3] bg-surface-2`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, ten-minute lifetime */}
      <img src={url} alt="Фото к отчёту" className="card-in h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
