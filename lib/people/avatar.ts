/** The bucket of the cards' photos (migration 20261104120000_person_contact). */
export const AVATAR_BUCKET = "avatars";

const EDGE = 512;
const QUALITY = 0.85;
/** A portrait is cut nearer its top: a face is rarely in the very middle of a tall photo. */
const PORTRAIT_FOCUS = 0.3;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = new RegExp(`^(${UUID})/(${UUID})\\.jpg$`);
const PUBLIC_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

/** `{company}/{key}.jpg`: the key is random, fixed when the photo is chosen, so a retry lands on the same file. */
export function avatarPath(companyId: string, key: string): string {
  return `${companyId}/${key}.jpg`;
}

/** The path is a photo of this company, in the shape the client uploads. */
export function avatarPathFits(path: string, companyId: string): boolean {
  return FILE.exec(path)?.[1] === companyId;
}

/**
 * The path of a stored photo from the URL on the card, for removing the file behind it; null —
 * not a file of this company's folder (no photo, or a URL from elsewhere): nothing to remove.
 */
export function avatarPathOf(url: string | null | undefined, companyId: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(PUBLIC_PREFIX)) return null;
  const path = pathname.slice(PUBLIC_PREFIX.length);
  return avatarPathFits(path, companyId) ? path : null;
}

/** The largest square of the picture, whole on the short side; a tall one keeps its upper part. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) * PORTRAIT_FOCUS),
    side,
  };
}

/**
 * A chosen picture as the card keeps it: a square of at most 512 px, JPEG, and the same as an
 * address for the form's preview. Runs in the browser; throws when it cannot read the file (a
 * HEIC on a desktop, for instance) — the original never leaves the machine. Transparency lands
 * on white, JPEG has none.
 */
export async function squarePhoto(file: Blob): Promise<{ blob: Blob; preview: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const edge = Math.min(EDGE, side);
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, edge, edge);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("toBlob failed");
  return { blob, preview: canvas.toDataURL("image/jpeg", QUALITY) };
}
