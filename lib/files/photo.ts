"use client";

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/**
 * A phone photo is 3–6 MB; the report needs a readable picture, not the original.
 * Downscale on the device to ≤1600 px JPEG — cheaper to upload on a building-site
 * connection and instant to open in the thread. Falls back to the original file
 * when the browser cannot decode it (HEIC on a desktop, for instance).
 */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; ext: PhotoExt }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("toBlob failed");
    return { blob, ext: "jpg" };
  } catch {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    return { blob: file, ext };
  }
}

export type PhotoExt = "jpg" | "png" | "webp";

export const PHOTO_MIME: Record<PhotoExt, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Upload a shrunk photo under its key: the object lands at `{company}/{user}/{crid}.{ext}`, so a
 * retry of the same key — the replay of a photo kept without network (D-130) — finds it there
 * instead of making a second copy. Resolves to the object path for task_messages.file_path;
 * a dead network surfaces as fetch's own TypeError, so callers can tell «later» from «no».
 */
export async function uploadPhotoBlob(blob: Blob, ext: PhotoExt, crid: string): Promise<string> {
  const res = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ext, client_request_id: crid }),
  });
  if (!res.ok) throw new Error(`upload url failed (${res.status})`);
  const { path, signed_url } = (await res.json()) as { path: string; signed_url: string; stored?: boolean };
  // `stored`: an earlier upload of this key landed and only its answer was lost
  if (!signed_url) return path;
  const put = await fetch(signed_url, { method: "PUT", headers: { "content-type": PHOTO_MIME[ext] }, body: blob });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  return path;
}

/** Upload straight to Storage by signed URL; resolves to the object path for task_messages.file_path. */
export async function uploadPhoto(file: File): Promise<string> {
  const { blob, ext } = await shrinkPhoto(file);
  return uploadPhotoBlob(blob, ext, crypto.randomUUID());
}
