/**
 * The client's logo as one still frame (D-155 §6, В-9): whatever file the client uploaded —
 * SMIL or CSS inside an SVG, an animated WebP or PNG — the browser draws it once and the screens
 * show that frame. Here is the pure part: how big the frame is and the per-page cache of frames;
 * the drawing itself is `components/ui/StillLogo.tsx`.
 */

/** A raster logo keeps its own size, never above this on the long side. */
export const RASTER_MAX_SIDE = 1024;

/** A vector logo is drawn at this long side — sharp on a 3× phone and on the wall. */
export const VECTOR_SIDE = 512;

/** An SVG by its path: the bucket names the file after its type (`logo-….svg`). */
export function isVectorLogo(src: string): boolean {
  try {
    return new URL(src, "http://local").pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

/** The canvas for the frame, with the logo's own proportions; null when the file has no size. */
export function frameSize(width: number, height: number, vector: boolean): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const long = Math.max(width, height);
  const scale = (vector ? VECTOR_SIDE : Math.min(long, RASTER_MAX_SIDE)) / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Draws `src` once and gives a blob: address of the frame; rejects with the reason it could not. */
export type Snapshot = (src: string) => Promise<string>;

// A logo shown again (a tab switch) paints from here, without a new snapshot. Blob addresses are
// never revoked: a page has one or two logos.
const frames = new Map<string, Promise<string | null>>();

/**
 * The still frame of `src`, made once per page: null when it could not be made (no CORS, the
 * file did not load, no size) — the screen then shows the file as before, and says why once.
 */
export function stillFrame(src: string, snapshot: Snapshot): Promise<string | null> {
  let frame = frames.get(src);
  if (!frame) {
    frame = new Promise<string>((resolve) => resolve(snapshot(src))).catch((error: unknown) => {
      console.warn(`[still-logo] showing the file as is (${reasonOf(error)}): ${src}`);
      return null;
    });
    frames.set(src, frame);
  }
  return frame;
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
