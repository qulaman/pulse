"use client";

import { useEffect, useState } from "react";

/** A report photo in the thread: signed on mount (a thread holds a handful, not a feed). */
export function PhotoMessage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/url?path=${encodeURIComponent(path)}`, { credentials: "include" })
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
  }, [path]);

  if (failed) return <p className="mt-2 text-[13px] leading-4 text-danger">Фото не открылось. Попробуй позже</p>;
  if (!url) return <div className="skeleton mt-2 h-40 w-full rounded-[12px]" aria-label="Загружаю фото" />;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, ten-minute lifetime */}
      <img
        src={url}
        alt="Фото к отчёту"
        className="card-in max-h-[320px] w-full rounded-[12px] border border-border object-cover"
        loading="lazy"
      />
    </a>
  );
}
