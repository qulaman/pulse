"use client";

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/**
 * A phone photo is 3–6 MB; the report needs a readable picture, not the original.
 * Downscale on the device to ≤1600 px JPEG — cheaper to upload on a building-site
 * connection and instant to open in the thread. Falls back to the original file
 * when the browser cannot decode it (HEIC on a desktop, for instance).
 */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; ext: "jpg" | "png" | "webp" }> {
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

/** Upload straight to Storage by signed URL; resolves to the object path for task_messages.file_path. */
export async function uploadPhoto(file: File): Promise<string> {
  const { blob, ext } = await shrinkPhoto(file);
  const res = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ext, client_request_id: crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error("upload url failed");
  const { path, signed_url } = (await res.json()) as { path: string; signed_url: string };
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const put = await fetch(signed_url, { method: "PUT", headers: { "content-type": mime }, body: blob });
  if (!put.ok) throw new Error("upload failed");
  return path;
}
