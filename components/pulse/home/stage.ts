import { memo, useCallback, useEffect, useState } from "react";

import type { MascotState } from "@/components/brand/Mascot";
import { EventSheet } from "@/components/calendar/EventSheet";
import type { BallsShow, OrbitId } from "@/components/pulse/OrbitBalls";
import { ThreadSheet } from "@/components/tasks/thread/ThreadSheet";
import { springs } from "@/lib/design/tokens";

/**
 * The home stage both faces stand on — Пульс for the director, Лента for everybody else (D-57,
 * D-62): the words above the head, the face in the middle, the cards under it. One set of sizes,
 * springs and rules, so the two screens move the same way.
 */

/** idle — the face asleep in the middle; ring — awake, the balls orbit it; panel — one ball opened as a card under the row of balls. */
export type Mode = "idle" | "ring" | "panel";

export const FACE = 128;
export const FACE_SMALL = 88;
/** Distance from the face's centre to the balls' centres. */
export const RING_RADIUS = 124;
/** Over the ring a thought floats above the orbit: its trail clear of the top ball (D-178). */
export const OVER_RING = RING_RADIUS + 60;
/** From the face's box down to the row of balls under it. */
export const ROW_GAP = 4;
/** How long a thought hangs above the head before the face dozes off again. */
export const THOUGHT_MS = 9_000;
/** The face jumps for joy this long — a batch landed (D-82), a medal (D-110). */
export const CHEER_MS = 1_800;
/**
 * The spring the face rides when the mode changes; the words above it and the cards under it ride
 * the same one, so the three bands move together instead of the outer two jumping (D-60). A
 * thing's spring: it lands without a bounce (D-166).
 */
export const BAND_SPRING = springs.object;
/**
 * Another ball's content in the same card: the old is gone in a blink, the new shows right after it
 * (it rises on the band's spring from the first frame) — they never stand one over the other.
 */
export const SWAP_OUT = { duration: 0.05, ease: "easeOut" } as const;
export const SWAP_IN = { duration: 0.16, delay: 0.05, ease: "easeOut" } as const;

/**
 * What a tap does not change renders only when what it is given changes (D-178): every tap drew
 * the whole screen again — the sheets and the thread too.
 */
export const QuietEventSheet = memo(EventSheet);
export const QuietThreadSheet = memo(ThreadSheet);

/**
 * An open ball is a job the face does by hand while the panel is open (D-82): it ticks off the
 * tasks on a clipboard, answers a message, shouts into Эфир through a megaphone, tears a page off
 * the calendar, serves the secretary's errands; the week's first five make it glad (D-123).
 */
export const PANEL_FACE: Record<OrbitId, MascotState> = {
  tasks: "checking",
  messages: "chatting",
  ether: "announcing",
  calendar: "scheduling",
  secretary: "serving",
  rating: "happy",
};

/** On Лента Эфир is heard, not shouted: the megaphone belongs to whoever speaks to everyone (D-110). */
export const PANEL_FACE_HEARD: Record<OrbitId, MascotState> = { ...PANEL_FACE, ether: "tuned" };

/** The face's box: wide enough for the orbit on the ring, the face and its margin otherwise. */
export function faceBox(mode: Mode, faceSize: number): number {
  return mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;
}

/**
 * Where the balls are (D-178): in a row under the small face over a card, orbiting on the ring,
 * inside the head at rest; `hidden` — none, whatever was out goes into the head (a phrase in hand
 * on Пульс owns the face).
 */
export function ballsShowOf(mode: Mode, cardOpen: boolean, hidden = false): BallsShow | null {
  if (cardOpen) return "row";
  if (hidden) return null;
  return mode === "idle" ? "rest" : "ring";
}

/**
 * A change on the board as a thought above the head (D-65): it pops up, hangs for `THOUGHT_MS` and
 * is gone — or sooner, on `dismiss`. An opening line is speech, never a thought; `held` keeps the
 * thought back while something else says the same news.
 */
export function useThought<L extends { id: string; opening: boolean }>(line: L | null, held = false): { thought: L | null; dismiss: () => void } {
  const [expired, setExpired] = useState<string | null>(null);
  const thought = line && !line.opening && line.id !== expired && !held ? line : null;
  const thoughtId = thought?.id ?? null;
  useEffect(() => {
    if (!thoughtId) return;
    const timer = setTimeout(() => setExpired(thoughtId), THOUGHT_MS);
    return () => clearTimeout(timer);
  }, [thoughtId]);
  const dismiss = useCallback(() => {
    if (thoughtId) setExpired(thoughtId);
  }, [thoughtId]);
  return { thought, dismiss };
}
