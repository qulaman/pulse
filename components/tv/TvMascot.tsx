"use client";

import { memo, type CSSProperties } from "react";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import type { TvMood } from "@/lib/tv/voice";

import { useVhPx } from "./useKiosk";

/**
 * The mascot on the wall is the same face the director has on the phone (D-45), only large and silent: nobody
 * taps a kiosk. The words beside it are the scene's («Сегодня» puts them in a speech bubble, a moment none);
 * the face is only a face.
 *
 * On the wall the face is never gold (D-185): the gold body is the phone's mood, and on the wall gold means points.
 * A glad piece of news makes it talk, not glow; a moment gives it the megaphone of «Эфир» (`announcing`). Alarm,
 * displeasure and calls never go on the office screen — that is personal and lives in the addressee's channel (D-45).
 *
 * The wall draws it flat: the phone's glossy highlight on a 30vh body reads as clip art from across the room, so it
 * is hidden here (the shared drawing in components/brand stays as it is). `tone` repaints the face for a full-colour
 * plane: on the gold of a moment the megaphone goes ink, on the accent of an announcement the body goes ink — the
 * face of the brand's colour would vanish into a plane of the same colour.
 *
 * The size is a fraction of the screen height: `Mascot` draws in pixels, and a wall may be 720p or 4K. The box
 * holds its size from the first frame, the face comes after the measurement — the layout does not jump.
 */

/**
 * The face on the wall does the small things a face at rest does (D-82, D-119): asleep it snores
 * and rolls over, awake it waves, winks, whistles — never the look after the balls: the wall has
 * none. Only the calm and glad acts: the wall shows nothing that could sting (D-45).
 */
const TV_SKIP: readonly MascotAct[] = ["orbit"];

/** The wall's moods and the face that says each; `announcing` is a moment's. Never `happy` — its body is gold. */
export type TvFace = TvMood | "announcing";

const STATE: Record<TvFace, MascotState> = {
  calm: "calm",
  speaking: "speaking",
  happy: "speaking",
  sleeping: "sleeping",
  announcing: "announcing",
};

/** The plane the face stands on: the wall's own, or a moment's full gold or full accent. */
export type TvMascotTone = "wall" | "gold" | "live";

/** Custom properties the mascot's drawing reads, set for its subtree only. */
const TONE: Record<TvMascotTone, CSSProperties | undefined> = {
  wall: undefined,
  // the megaphone of «Эфир» is gold: on a gold plane it is drawn in ink
  gold: { "--gold": "var(--tv-ink)" } as CSSProperties,
  // the body is the accent: on an accent plane it is ink, the eyes (drawn in --bg) are cut out of it
  live: { "--accent": "var(--tv-ink)", "--bg": "var(--tv-live)" } as CSSProperties,
};

/** Memoised on its primitives: the scenes around it re-render every second with the clock. */
export const TvMascot = memo(function TvMascot({ mood, sizeVh, tone = "wall" }: { mood: TvFace; sizeVh: number; tone?: TvMascotTone }) {
  const size = useVhPx(sizeVh);
  const state = STATE[mood];
  const acts = useMascotActs(state, true, TV_SKIP);
  const season = useMascotSeason();

  return (
    <span
      // the phone's highlight — the white lens high on the body (Mascot.tsx) — is not drawn on the wall
      className="relative block shrink-0 [&_[data-face]_ellipse[cx='24'][cy='18']]:hidden"
      style={{ width: `${sizeVh}vh`, height: `${sizeVh}vh`, ...TONE[tone] }}
      data-testid="tv-mascot"
    >
      {size > 0 ? <Mascot state={state} size={size} act={acts.act} season={season} /> : null}
    </span>
  );
});
