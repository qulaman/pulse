"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Photos from task reports on the wall (D-185). The kiosk's role reads no task tables and no
 * storage (G.5): `GET /api/tv/photos` picks the photos on the server, inside the caller's company
 * (`lib/tv/photosServer.ts`), and hands back links signed for an hour.
 */

export type TvPhoto = {
  /** The task message that carries the photo. */
  id: string;
  /** Signed link to the image, valid for an hour. */
  url: string;
  task_id: string;
  /** The person who sent the report. */
  employee_id: string;
  name: string;
  /** The task's title; null with a guest in the office. */
  title: string | null;
  /** When the photo was sent. */
  at: string;
  /** When the report was handed in (the task went to review); null while it has not been. */
  done_at?: string | null;
};

export const tvPhotoKeys = {
  recent: ["tv", "photos", "recent"] as const,
  task: (taskId: string) => ["tv", "photos", "task", taskId] as const,
  person: (employeeId: string) => ["tv", "photos", "person", employeeId] as const,
};

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric", month: "long" });

function dayIndex(date: Date): number {
  return Math.floor((date.getTime() + AQTOBE_OFFSET_MS) / DAY_MS);
}

/**
 * The caption's time: «сдано 14:22» today, «сдано вчера в 14:22», «сдано 17 ноября» earlier in
 * the week — when the report was handed in, or when the photo was sent if it has not been.
 */
export function handedIn(photo: Pick<TvPhoto, "at" | "done_at">, now: Date): string {
  const at = new Date(photo.done_at ?? photo.at);
  const days = dayIndex(now) - dayIndex(at);
  if (days <= 0) return `сдано ${timeFmt.format(at)}`;
  if (days === 1) return `сдано вчера в ${timeFmt.format(at)}`;
  return `сдано ${dayFmt.format(at)}`;
}

/** The links live an hour: fresh for twenty minutes, asked again every half hour. */
const STALE_MS = 20 * 60_000;
const REFRESH_MS = 30 * 60_000;

const NONE: TvPhoto[] = [];
const hide = (): TvPhoto[] => NONE;

async function fetchPhotos(taskId: string | null, employeeId: string | null): Promise<TvPhoto[]> {
  const path = taskId
    ? `/api/tv/photos?task_id=${encodeURIComponent(taskId)}`
    : employeeId
      ? `/api/tv/photos?employee_id=${encodeURIComponent(employeeId)}`
      : "/api/tv/photos";
  // the session's cookies, as every other call of the kiosk; a failure keeps the photos already on the wall
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`tv photos: ${res.status}`);
  const body = (await res.json()) as { photos?: TvPhoto[] };
  return Array.isArray(body.photos) ? body.photos : NONE;
}

/**
 * Recent photos of finished tasks (the round's «Фото»), a person's reports (`employeeId`, the person
 * on the wall), or the photos of one task (`taskId`, an order on the wall). With a guest in the
 * office the query stops and nothing is handed out — not even what the cache still holds.
 */
export function useTvPhotos({
  enabled,
  guest,
  taskId = null,
  employeeId = null,
}: {
  enabled: boolean;
  guest: boolean;
  taskId?: string | null;
  employeeId?: string | null;
}) {
  return useQuery({
    queryKey: taskId ? tvPhotoKeys.task(taskId) : employeeId ? tvPhotoKeys.person(employeeId) : tvPhotoKeys.recent,
    queryFn: () => fetchPhotos(taskId, employeeId),
    enabled: enabled && !guest,
    staleTime: STALE_MS,
    refetchInterval: REFRESH_MS,
    // a stopped query still answers from its cache: a guest gets an empty list instead
    select: guest ? hide : undefined,
  });
}
