"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { handedIn, type TvPhoto } from "@/lib/tv/photos";

/** One photo on the wall for fifteen seconds, then the next. */
const PHOTO_MS = 15_000;
/** Narrower than this is a portrait (a square too): the photo takes its half, the caption the other. */
const PORTRAIT_BELOW = 1.1;
const EASE = [0.2, 0, 0, 1] as const;
/**
 * The whole wall moves a few pixels every ten minutes against burn-in (`burnInShift`, ≤ 5 px): a
 * photo to the screen's edge runs past it by this much, so no dark sliver opens at the edge.
 */
const BLEED = "6px";

/**
 * The slow push-in over a photo's fifteen seconds: a compositor transform, the browser runs it
 * alone. React hoists the `<style>` and keeps one copy by `href`.
 */
const DRIFT_CSS = `@keyframes tv-photo-drift { from { transform: scale(1); } to { transform: scale(1.05); } }
.tv-photo-drift { animation: tv-photo-drift ${PHOTO_MS}ms linear both; transform-origin: 50% 50%; }`;

type Loaded = { url: string; ratio: number };

/**
 * «Фото» (D-185): photos from the reports of finished tasks, one at a time over the whole middle
 * of the wall, no head. A landscape fills the middle; a portrait stands on its half and the caption
 * takes the other. The caption — who, what, when it was handed in — stands at the bottom left, in the main
 * column of the wall's grid, over a still shade that darkens the photo's lower part across its whole width: no
 * plate with an edge, the photo runs on behind the words. Every photo is loaded before its turn (its shape is known by then, so the layout
 * never jumps), the next one is decoded during the current one's fifteen seconds (unpacking a
 * photo never lands on the frame of the change), and the change is one fade: the old photo leaves,
 * then the new one comes. A photo not decoded by its turn waits: the one on the wall stays.
 */
export function TvPhotos({ photos, now }: { photos: TvPhoto[]; now: Date }) {
  const loaded = usePreloaded(photos);
  // the turn runs over the whole list by the clock, so photos arriving one by one never reshuffle
  // it; a photo not loaded by its turn is skipped to the next loaded one
  const turn = photos.length > 0 ? Math.floor(now.getTime() / PHOTO_MS) % photos.length : 0;
  const due = nextLoaded(photos, turn, loaded);
  const after = due ? nextLoaded(photos, (photos.indexOf(due) + 1) % photos.length, loaded) : null;
  const next = after && after.id !== due?.id ? after : null;
  const decoded = useDecoded(due ? loaded.get(due.id)!.url : null, next ? loaded.get(next.id)!.url : null);
  // the photo on the wall changes only to a decoded one (state from the previous render, set while
  // rendering); the scene's first photo does not wait — the scene's own fade-in covers its decoding
  const [shownId, setShownId] = useState<string | null>(() => due?.id ?? null);
  if (due && shownId !== due.id && (shownId === null || decoded.has(loaded.get(due.id)!.url))) setShownId(due.id);
  const photo = photos.find((candidate) => candidate.id === shownId && loaded.has(candidate.id)) ?? null;
  const shown = photo ? loaded.get(photo.id) : undefined;

  return (
    // the clip lets the photo run past the screen's edges by the burn-in shift (≤ 5 px), never into the band
    <div className="relative h-full w-full" style={{ clipPath: `inset(-${BLEED} -${BLEED} 0 -${BLEED})` }} data-testid="tv-photos">
      <style href="tv-photos" precedence="default">
        {DRIFT_CSS}
      </style>
      <AnimatePresence mode="wait">
        {photo && shown ? (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.5, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className="absolute inset-0"
            data-photo={photo.id}
            data-shape={shown.ratio < PORTRAIT_BELOW ? "portrait" : "landscape"}
          >
            {shown.ratio < PORTRAIT_BELOW ? (
              <Portrait photo={photo} shown={shown} now={now} />
            ) : (
              <Landscape photo={photo} shown={shown} now={now} />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Past the screen's top, left and right edges by the bleed; the bottom stops at the band. */
const BLEED_BOX = { top: `-${BLEED}`, left: `-${BLEED}`, right: `-${BLEED}`, bottom: 0 } as const;

function Landscape({ photo, shown, now }: { photo: TvPhoto; shown: Loaded; now: Date }) {
  return (
    <>
      <div className="absolute overflow-hidden" style={BLEED_BOX}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, not static assets */}
        <img src={shown.url} alt="" className="tv-photo-drift h-full w-full object-cover" />
      </div>
      {/* the channel mark stands over the photo's top edge: a still shade fading down keeps it legible on a
          bright sky without cutting the photo with an edge */}
      <div
        aria-hidden
        className="absolute h-[calc(var(--tv-y)*3+9vh)]"
        style={{ ...BLEED_BOX, bottom: "auto", background: STRIP }}
      />
      {/* the shade under the caption: the lower 40 % of the photo, darkening to 90 % at the band */}
      <div aria-hidden className="absolute h-[40%]" style={{ ...BLEED_BOX, top: "auto", background: SHADE }} />
      <div className="tv-split absolute inset-x-0 bottom-0 px-[var(--tv-x)] pb-[var(--tv-gap)]">
        <Caption photo={photo} now={now} size="plane" />
      </div>
    </>
  );
}

/**
 * A portrait on the wall's grid (`.tv-split`): the photo's room runs from the screen's left edge to the side
 * column, the photo stands in the middle of it at its own shape (a phone portrait is shown whole; wider than
 * the room — cropped to it); the caption takes the side column, on the same line as every scene's second column.
 */
function Portrait({ photo, shown, now }: { photo: TvPhoto; shown: Loaded; now: Date }) {
  return (
    <div className="tv-split absolute inset-x-0 bottom-0 px-[var(--tv-x)]" style={{ top: `-${BLEED}` }}>
      <div className="relative flex min-w-0 justify-center overflow-hidden" style={{ marginLeft: `calc(-1 * var(--tv-x) - ${BLEED})` }}>
        <div className="relative h-full max-w-full shrink-0 overflow-hidden" style={{ aspectRatio: shown.ratio }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, not static assets */}
          <img src={shown.url} alt="" className="tv-photo-drift h-full w-full object-cover" />
        </div>
      </div>
      {/* the side column is the caption's own: the wall itself is its plane, the words one step larger */}
      <div className="flex min-w-0 flex-col justify-end pb-[var(--tv-gap)]">
        <Caption photo={photo} now={now} size="half" />
      </div>
    </div>
  );
}

/**
 * The shades over a photo, still, never animated: under the channel mark at the top, under the caption at the
 * bottom. The bottom one holds dark where the words stand and thins out above them — the photo shows through.
 */
const STRIP = "linear-gradient(to bottom, color-mix(in srgb, var(--bg) 72%, transparent), color-mix(in srgb, var(--bg) 40%, transparent) 45%, transparent)";
const SHADE = `linear-gradient(to top, ${[
  ["90%", "0%"],
  ["88%", "40%"],
  ["78%", "62%"],
  ["54%", "80%"],
  ["20%", "93%"],
]
  .map(([alpha, at]) => `color-mix(in srgb, var(--bg) ${alpha}, transparent) ${at}`)
  .join(", ")}, transparent 100%)`;

/** A portrait's half is tall: the title, one size up, takes the lines it needs — a task's title is a sentence at most. */
const HALF_TITLE: CSSProperties = { color: "var(--tv-text)", fontWeight: 400, overflowWrap: "anywhere" };
const PLANE_TITLE: CSSProperties = { color: "var(--tv-text)", fontWeight: 400 };

/**
 * Who, what, and when it was handed in — a line each, so the plane hugs its longest line. On the
 * plane at the lead size, on a portrait's half one step up.
 */
function Caption({ photo, now, size }: { photo: TvPhoto; now: Date; size: "plane" | "half" }) {
  const half = size === "half";
  return (
    <div className={`flex flex-col ${half ? "gap-[1.6vh]" : "gap-[0.8vh]"}`}>
      <p className={half ? "tv-title" : "tv-lead"} style={{ color: "var(--tv-text)" }}>
        {photo.name}
      </p>
      {photo.title ? (
        <p className={half ? "tv-lead" : "tv-body tv-two-lines"} style={half ? HALF_TITLE : PLANE_TITLE}>
          {photo.title}
        </p>
      ) : null}
      <p className="tv-small tv-num text-muted">{handedIn(photo, now)}</p>
    </div>
  );
}

/** The first loaded photo from `start` on, round the list; null while none has loaded. */
function nextLoaded(photos: TvPhoto[], start: number, loaded: Map<string, Loaded>): TvPhoto | null {
  for (let step = 0; step < photos.length; step += 1) {
    const photo = photos[(start + step) % photos.length]!;
    if (loaded.has(photo.id)) return photo;
  }
  return null;
}

/**
 * What the wall has learned about its photos, kept across the scene's mounts: the round comes back
 * to «Фото» every half hour or so, and the kiosk primes the list before the first turn
 * (`primeTvPhotos`), so the scene opens on a photo, not on an empty middle. A photo is known by its
 * id: the half-hourly refresh signs the same photo anew, and the wall keeps the link it already has
 * until the new one has loaded. A photo that fails to load stays off.
 */
const shapes = new Map<string, Loaded>();
const requested = new Map<string, string>();
const listeners = new Set<() => void>();

function request(photo: TvPhoto): void {
  if (requested.get(photo.id) === photo.url) return;
  requested.set(photo.id, photo.url);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const ratio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 4 / 3;
    shapes.set(photo.id, { url: photo.url, ratio });
    for (const listener of listeners) listener();
  };
  image.src = photo.url;
}

/** The kiosk loads the round's photos as soon as it has their links — long before «Фото» comes round. */
export function primeTvPhotos(photos: readonly TvPhoto[]): void {
  for (const photo of photos) request(photo);
}

function usePreloaded(photos: TvPhoto[]): Map<string, Loaded> {
  const pick = () => new Map(photos.flatMap((photo) => (shapes.has(photo.id) ? [[photo.id, shapes.get(photo.id)!] as const] : [])));
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(pick);
  useEffect(() => {
    const refresh = () => setLoaded(pick);
    listeners.add(refresh);
    for (const photo of photos) request(photo);
    refresh();
    return () => {
      listeners.delete(refresh);
    };
    // `pick` reads the module's map for this list only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);
  return loaded;
}

/**
 * Decodes the photo on the wall and the next one ahead of its turn, and holds their images so the
 * decoded pictures stay in memory; the rest are let go (a dozen decoded 1600-px photos would be
 * ~90 MB on a television). Answers which links are decoded and held.
 */
function useDecoded(current: string | null, next: string | null): Set<string> {
  const [decoded, setDecoded] = useState<Set<string>>(() => new Set());
  const held = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    const wanted = [current, next].filter((url): url is string => url !== null);
    for (const url of [...held.current.keys()]) if (!wanted.includes(url)) held.current.delete(url);
    for (const url of wanted) {
      if (held.current.has(url)) continue;
      const image = new Image();
      image.src = url;
      held.current.set(url, image);
      image.decode().then(
        () =>
          setDecoded((before) => {
            // only what is still held counts as decoded
            const after = new Set([...before].filter((known) => held.current.has(known)));
            return after.add(url);
          }),
        // a photo that cannot be decoded never gets its turn: the wall keeps the one it has
        () => held.current.delete(url),
      );
    }
  }, [current, next]);
  return decoded;
}
