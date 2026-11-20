"use client";

import { memo } from "react";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import type { TvMood } from "@/lib/tv/voice";

import { useVhPx } from "./useKiosk";

/**
 * The mascot on the wall is the same face the director has on the phone (D-45), only large and silent: nobody
 * taps a kiosk. The words under it are the scene's («Сегодня» puts a phrase, «Момент» nothing); the face is only a face.
 *
 * Exactly four states, none of them hurtful: calm, talking, pleased, asleep. Alarm,
 * displeasure and calls never go on the office screen — that is personal and lives in the
 * addressee's channel (D-45).
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

const STATE: Record<TvMood, MascotState> = {
  calm: "calm",
  speaking: "speaking",
  happy: "happy",
  sleeping: "sleeping",
};

/** Memoised on its two primitives: the scenes around it re-render every second with the clock. */
export const TvMascot = memo(function TvMascot({ mood, sizeVh }: { mood: TvMood; sizeVh: number }) {
  const size = useVhPx(sizeVh);
  const state = STATE[mood];
  const acts = useMascotActs(state, true, TV_SKIP);
  const season = useMascotSeason();

  return (
    <span className="relative block shrink-0" style={{ width: `${sizeVh}vh`, height: `${sizeVh}vh` }} data-testid="tv-mascot">
      {size > 0 ? <Mascot state={state} size={size} act={acts.act} season={season} /> : null}
    </span>
  );
});
