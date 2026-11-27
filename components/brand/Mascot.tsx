import type { GlyphId } from "@/components/brand/mark/glyphs";
import { ACT_LOOK, LITE_PX, STATE_LOOK } from "@/components/brand/mark/look";
import { Mark } from "@/components/brand/mark/Mark";
import type { MascotSeason } from "@/lib/mascot/season";

/**
 * The mascot of the product (D-205, docs/DESIGN.md §3): a dot inside a ring, light and waves round
 * the ring. The director's, the employee's and the wall's face. Three figures and nothing else: the
 * dot is a pupil — it looks about, blinks, looks where the screen tells it; the ring breathes, opens
 * into three arcs, turns; the light pulses, takes the voice, throws a wave. A thing of the product
 * is never held beside the mark: the dot turns into it — a card, an envelope, a cup, a medal — and
 * back. Each state is its own choreography, read at a glance without a caption:
 *   calm         the pulse: two beats — the dot, then the ring, then the light — and two waves, a look about, a blink
 *   listening    the ring opens into three arcs, the dot is three bars of the voice, a wave trembles round
 *                and another comes in from the edge, as bright as the voice is loud
 *   saving       the recording is put away: a note sinks into the ring
 *   transcribing the voice becomes text: three lines written one by one and running off, a comet runs the ring
 *   parsing      the text is sorted: the arcs step round by thirds, three dots take turns
 *   sending      the dot is thrown up, the ring kicks back, one strong wave; a new dot grows
 *   offering     parsed and waiting for the tap: an arrow up, the mark presses itself like a button
 *   thinking     pondering, loading, «не разобрал»: the arcs drift, the pupil looks up and aside
 *   speaking     the dot beats with the words, a small wave goes with each (D-49)
 *   happy        gold, the dot beams (rays with the beat), sparks
 *   sleeping     the eye is shut, the slowest breath, z-s drift up — the screen before the first tap
 *   alert        «насторожен»: the pupil sweeps the room and goes up to a small amber light over
 *                the ring — the director's face never gets angry, it watches
 *   processing   news from the base: a comet runs the dimmed ring, the pupil follows it (D-65)
 *   calling      «обрати внимание!»: a card with «!», two hops like a dog at the door
 *   nervous      the director's unread word: an envelope, a tremble
 *   panicking    the deadline burns: red, a clock racing, the mark shaking
 * What the dot is while a ball of Пульс is open (D-82) — the ball's own thing:
 *   checking     «Задачи»: a list ticked off row by row
 *   chatting     «Сообщения»: a bubble with the typing dots
 *   announcing   «Эфир»: a megaphone, the words leave it in arcs, waves go out
 *   tuned        «Эфир» from the listener's side: gold waves come in
 *   scheduling   «Календарь»: a tear-off calendar, a day falls off
 *   serving      «Секретарь»: a cup with steam, a small bow
 *   celebrating  the batch has flown: a star, the arcs fly round, confetti
 * The employee's face carries the work the director hands out (D-110):
 *   working      orders in work: a stack of cards (`carry` — how many, a red mark when one is due)
 *   awaiting     everything handed over: an hourglass turns
 * An `act` is a one-shot over any of them (D-82): the small things a face does at rest — a yawn,
 * a hop, a wink, a tune — and what has just happened to the work: a card caught, «есть!», a medal,
 * the card back to redo. For its length the dot turns into the act's thing, then back into the
 * state's. What each state and act is made of — components/brand/mark/look.ts.
 * Perf contract: drawn by the server (one small client part swaps the things), motion on
 * `transform` and `opacity` only, CSS keyframes (components/brand/mark/mark.css). Pass `level` (0..1,
 * from the microphone) while listening, or paint `--mascot-level` on an ancestor.
 */
export type MascotState =
  | "calm"
  | "listening"
  | "saving"
  | "transcribing"
  | "parsing"
  | "sending"
  | "offering"
  | "thinking"
  | "speaking"
  | "happy"
  | "sleeping"
  | "processing"
  | "calling"
  | "alert"
  | "nervous"
  | "panicking"
  | "checking"
  | "chatting"
  | "announcing"
  | "scheduling"
  | "serving"
  | "celebrating"
  | "working"
  | "awaiting"
  | "tuned";

/** What has just happened to the employee's work (D-110). */
export type WorkAct =
  | "catch"
  | "insist"
  | "nod"
  | "raise"
  | "shrug"
  | "poof"
  | "handover"
  | "medal"
  | "boomerang"
  | "relief"
  | "letter"
  | "read"
  | "listen"
  | "thumb"
  | "watch"
  | "shuffle"
  | "coin";

/** The director's face answers the board: a gesture of an aide with a card, not a feeling (tasks/020). */
export type BoardAct = "tick" | "receive" | "hmm" | "puzzle" | "stamp" | "flick" | "crumple" | "push" | "clock" | "reply";

/** A phrase that did not make it (docs/AI.md §11). */
export type ErrorAct = "ear" | "scratch" | "pinch" | "nomic" | "signal";

/**
 * The small one-shots of a face at rest (D-82): played over the state, never instead of it,
 * so the barometer still reads — a sleeping face yawns and stays asleep. The waiting screen
 * picks them (components/pulse/useMascotActs.ts); the screen can also call one on purpose — a
 * wave when the face wakes, a yawn when it dozes off again.
 */
export type MascotAct =
  | "yawn"
  | "turn"
  | "doze"
  | "smile"
  | "kick"
  | "wave"
  | "wink"
  | "hop"
  | "spin"
  | "heart"
  | "orbit"
  | "peek"
  | "tiptoe"
  | "scan"
  | "limber"
  | "eyeroll"
  | "thump"
  | WorkAct
  | BoardAct
  | ErrorAct;

/** How long each act takes: the screen clears it after this, the one-shots of the act last exactly this. */
export const ACT_MS: Record<MascotAct, number> = {
  // the director's face answers the board (tasks/020)
  tick: 1200,
  receive: 1600,
  hmm: 1800,
  puzzle: 1600,
  stamp: 1800,
  flick: 1050,
  crumple: 1400,
  push: 1600,
  clock: 1800,
  reply: 2000,
  // a phrase that did not make it (tasks/020, phase B)
  ear: 1800,
  scratch: 1800,
  pinch: 1600,
  nomic: 2000,
  signal: 2200,
  catch: 1500,
  insist: 1500,
  nod: 1200,
  raise: 1800,
  shrug: 1800,
  poof: 1050,
  handover: 850,
  medal: 2400,
  boomerang: 2200,
  relief: 1800,
  letter: 1500,
  read: 1400,
  listen: 2000,
  thumb: 1300,
  watch: 1800,
  shuffle: 1400,
  coin: 1600,
  yawn: 2200,
  turn: 2600,
  doze: 2400,
  smile: 3200,
  kick: 1600,
  wave: 1800,
  wink: 1300,
  hop: 1000,
  spin: 1300,
  heart: 2400,
  orbit: 3600,
  peek: 2800,
  tiptoe: 2200,
  // the mark's own: a look round the ring, a stretch of the arcs, the eye rolled, one strong beat
  scan: 2300,
  limber: 2200,
  eyeroll: 1500,
  thump: 1400,
};

/**
 * The moment an act lands, for a phone that can answer it in the hand (Android; iOS has no
 * vibration API): the card caught, the harder «!!», the medal, the card back in the ring —
 * [ms into the act, vibration pattern]. The screen that plays the act schedules it.
 */
export const ACT_TOUCH: Partial<Record<MascotAct, [number, number | number[]]>> = {
  catch: [450, 18],
  insist: [570, [18, 60, 24]],
  medal: [340, [14, 50, 22]],
  boomerang: [1360, 22],
};

export { SLEEP_COLOR } from "@/components/brand/mark/look";

export function Mascot({
  state = "calm",
  size = 64,
  level = 0,
  act = null,
  gaze = null,
  carry = null,
  season = null,
  thing = null,
}: {
  state?: MascotState;
  size?: number;
  level?: number;
  /** a one-shot over the state (D-82); the screen clears it after ACT_MS */
  act?: MascotAct | null;
  /**
   * The employee's orders in work (D-110): how many, and whether one of them is due within the
   * hour — the stack the dot is while they are in work. null or zero — one card.
   */
  carry?: { count: number; hot?: boolean } | null;
  /** a holiday of the company's calendar to dress for (D-119, lib/mascot/useSeason.ts) */
  season?: MascotSeason | null;
  /**
   * Where the pupil looks, as a direction from the middle (−1..1 on each axis): it goes there and
   * holds, the ring leans a little the same way (D-84 — the person the director has just tapped).
   * null — the state's own look.
   */
  gaze?: { x: number; y: number } | null;
  /**
   * The dot is this thing for as long as the prop is set, whatever the state's own thing — what a
   * failed phrase is about stays in the ring while its words are up (a muted microphone, no signal).
   * An act still plays over it. null — the state's own.
   */
  thing?: GlyphId | null;
}) {
  // an avatar plays no acts: it only tells the state
  const doing = size < LITE_PX ? null : act;
  return (
    <Mark
      state={state}
      act={doing}
      size={size}
      look={thing ? { ...STATE_LOOK[state], glyph: thing } : STATE_LOOK[state]}
      part={doing ? ACT_LOOK[doing] : null}
      ms={doing ? ACT_MS[doing] : 0}
      level={level}
      gaze={gaze}
      count={carry?.count ?? 1}
      hot={carry?.hot ?? false}
      season={season}
    />
  );
}
