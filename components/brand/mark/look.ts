import type { MascotAct, MascotState } from "@/components/brand/Mascot";

import type { GlyphId } from "./glyphs";

/**
 * What the mark looks like in each state and what each act does to it (D-205) — one table for the
 * drawing, the storyboards and the tests. The mark is three figures: a dot (the pupil), a ring, light
 * round the ring. A state is told by what they do; a thing of the product — a card, an envelope, a
 * cup — is what the dot turns into, never something held beside it. Motion is named here and lives
 * in `mark.css`: a state's loops carry their own time, an act's one-shots take the act's (`ACT_MS`).
 */

export const SLEEP_COLOR = "color-mix(in srgb, var(--accent) 72%, var(--surface-2))";

/** Below this size the mark is an avatar: no waves, no acts, no outfit — only what tells the state. */
export const LITE_PX = 40;
/** Below this the light keeps closer to the ring: the mark stands in a card beside words. */
export const FULL_PX = 96;

/** The ring: one piece, three arcs a little apart, opened wide to listen, or dimmed under a comet. */
export type Ring = "whole" | "apart" | "open" | "dim";
/** The dot: itself, three bars of the voice, three lines of text being read, three dots taking turns. */
export type Core = "dot" | "bars" | "lines" | "dots";
/** The light: waves leaving, coming in, the voice, nothing, and the special cases of a few states. */
export type Glow = "pulse" | "sleep" | "fast" | "talk" | "press" | "in" | "voice" | "burst" | "party" | "quiet";

export type StateLook = {
  color: string;
  ring?: Ring;
  /** the arcs turn: in thirds with a stop, slowly, or fast */
  spin?: "step" | "drift" | "fast";
  core?: Core;
  /** what the dot has turned into */
  glyph?: GlyphId;
  glow?: Glow;
  /** the colour of the waves when it is not the mark's own (gold for Эфир) */
  wave?: string;
  /** where the pupil looks by itself */
  look?: "wander" | "sweep" | "follow" | "desk" | "ponder";
  blink?: boolean;
  /** a comet runs the ring */
  comet?: boolean;
  /** loops: the whole mark, the ring, the dot (and a second one under it), the thing, the halo — `animation` shorthands */
  all?: string;
  ringAnim?: string;
  coreAnim?: string;
  dotAnim?: string;
  glyphAnim?: string;
  halo?: string;
  /** a loop of what the ring wears (the secretary's headset ringing) */
  wearAnim?: string;
  /** what stands round the ring */
  extra?: "sparks" | "light" | "confetti";
};

const BREATH = "bk-breath 3.4s var(--ease-in-out) infinite";
const CALM = "bk-calm 4.6s var(--ease-in-out) infinite";

export const STATE_LOOK: Record<MascotState, StateLook> = {
  // awake, nothing asked: the pulse, a look about, a blink
  calm: { color: "var(--accent)", glow: "pulse", look: "wander", blink: true, coreAnim: "bk-beat 3.4s var(--ease-in-out) infinite", ringAnim: BREATH, halo: "bk-halo-beat 3.4s var(--ease-in-out) infinite" },
  // the ring opens and leans in, the dot is the voice, a wave comes in with it
  listening: { color: "var(--accent)", ring: "open", spin: "drift", core: "bars", glow: "voice", ringAnim: "bk-calm 2.8s var(--ease-in-out) infinite" },
  // the recording is put away: a note sinks into the ring
  saving: { color: "var(--accent)", glyph: "note", glow: "in", ringAnim: "bk-gulp 1.3s var(--ease-in-out) infinite" },
  // the voice becomes text: three lines written one after another under a running comet
  transcribing: { color: "var(--warn)", ring: "dim", comet: true, core: "lines", glow: "quiet" },
  // the text is sorted: the arcs step round, three dots take turns
  parsing: { color: "var(--warn)", ring: "apart", spin: "step", core: "dots", glow: "quiet", halo: "bk-think 1.05s var(--ease-in-out) infinite" },
  // the dot is thrown
  sending: { color: "var(--accent)", glow: "burst", coreAnim: "bk-launch 1.5s linear infinite both", ringAnim: "bk-recoil 1.5s var(--ease-out) infinite", halo: "bk-flash 1.5s var(--ease-out) infinite" },
  // parsed and waiting for the tap: the mark is a button that presses itself
  offering: { color: "var(--accent)", glyph: "send", glow: "press", all: "bk-press 1.6s var(--ease-in-out) infinite" },
  // pondering, loading, «не разобрал»: one pupil that looks up and aside and thinks — the three dots
  // are the sign of «разбираю» alone, so «не получилось» never looks like «ещё работаю»
  thinking: { color: "var(--warn)", ring: "apart", spin: "drift", glow: "quiet", look: "ponder", blink: true, halo: "bk-think 1.4s var(--ease-in-out) infinite" },
  // the dot beats with the words, a small wave goes with each
  speaking: { color: "var(--accent)", glow: "talk", blink: true, coreAnim: "bk-talk 0.9s var(--ease-in-out) infinite", dotAnim: "bk-talk-2 0.62s var(--ease-in-out) infinite", ringAnim: CALM },
  // gold, the dot beams: rays go out of it with the beat, sparks
  happy: { color: "var(--gold)", glyph: "beam", glow: "pulse", extra: "sparks", ringAnim: BREATH, halo: "bk-halo-beat 3.4s var(--ease-in-out) infinite" },
  // the eye is shut, the slowest breath
  sleeping: { color: SLEEP_COLOR, glyph: "shut", glow: "sleep", all: "bk-sleep 5.8s var(--ease-in-out) infinite", halo: "bk-sleep-halo 5.8s var(--ease-in-out) infinite" },
  // news from the base: a comet runs the ring, the pupil follows it
  processing: { color: "var(--accent)", ring: "dim", comet: true, look: "follow", glow: "in", coreAnim: "bk-sync-dot 1.15s var(--ease-in-out) infinite" },
  // «обрати внимание»: a card with «!», two hops
  calling: { color: "var(--warn)", glyph: "card-bang", glow: "fast", all: "bk-call 1.8s var(--ease-in-out) infinite" },
  // watchful: the pupil sweeps the room, an amber light over the ring
  alert: { color: "var(--accent)", glow: "quiet", look: "sweep", extra: "light", ringAnim: "bk-taut 2.3s var(--ease-in-out) infinite" },
  // an unread word of the director: the envelope frets — a burst of shivers, a look up, and quiet
  nervous: { color: "var(--warn)", glyph: "envelope", glow: "quiet", ringAnim: "bk-tremble 2.3s linear infinite", glyphAnim: "bk-fret 2.3s var(--ease-in-out) infinite" },
  // the deadline burns: a clock racing, the mark shaking in bursts, the ring jolting on its own clock
  panicking: { color: "var(--danger)", ring: "apart", glyph: "clock", glow: "fast", all: "bk-panic 0.9s linear infinite", ringAnim: "bk-jolt 0.37s linear infinite" },
  // the work of an open ball of Пульс: its thing in the middle of the ring
  checking: { color: "var(--accent)", glyph: "list", glow: "quiet", ringAnim: CALM },
  chatting: { color: "var(--accent)", glyph: "bubble", glow: "quiet", ringAnim: CALM },
  announcing: { color: "var(--accent)", glyph: "megaphone", glow: "fast", ringAnim: "bk-pump 0.65s var(--ease-in-out) infinite" },
  scheduling: { color: "var(--accent)", glyph: "calendar", glow: "quiet", ringAnim: CALM },
  serving: { color: "var(--accent)", glyph: "cup", glow: "quiet", all: "bk-bow 3.2s var(--ease-in-out) infinite" },
  // the batch has flown
  celebrating: { color: "var(--gold)", ring: "apart", spin: "fast", glyph: "star", glow: "party", extra: "confetti", all: "bk-jump 1.2s var(--ease-in-out) infinite" },
  // the employee's orders in work: the stack
  working: { color: "var(--accent)", glyph: "stack", glow: "pulse", ringAnim: BREATH, halo: "bk-halo-beat 3.4s var(--ease-in-out) infinite" },
  // everything handed in: the hourglass turns
  awaiting: { color: "var(--accent)", glyph: "hourglass", glow: "quiet", ringAnim: CALM },
  // Эфир heard: gold waves come in
  tuned: { color: "var(--accent)", glow: "in", wave: "var(--gold)", coreAnim: "bk-sync-dot 1.15s var(--ease-in-out) infinite" },
};

export type ActLook = {
  /** what the dot turns into for the act (the state's own thing steps aside) */
  glyph?: GlyphId;
  color?: string;
  ring?: Ring;
  /** one-shots, by the name of their keyframes: the whole mark, the ring, the dot, the pupil's look, its lid, the thing */
  all?: string;
  ringAnim?: string;
  coreAnim?: string;
  lookAnim?: string;
  lidAnim?: string;
  glyphAnim?: string;
  /** what the ring wears: the headset set right */
  wearAnim?: string;
  /** light of the act's own: two friendly waves, one strong, one coming in */
  glow?: "waves" | "burst" | "in";
  /** a comet runs the ring for the act */
  comet?: boolean;
  /** the thing flies off or is crushed: the act ends as it goes, nothing of it comes back to go out again */
  leaves?: boolean;
  extra?: "moon" | "spark" | "dust";
};

const POP = "bk-a-g-pop";
const BOB = "bk-a-g-bob";

export const ACT_LOOK: Record<MascotAct, ActLook> = {
  // ── the director's face answers the board ──
  tick: { glyph: "check", glyphAnim: POP },
  receive: { glyph: "card", glyphAnim: "bk-a-g-side", ringAnim: "bk-a-gulp" },
  hmm: { glyph: "card-x", glyphAnim: "bk-a-g-tilt" },
  puzzle: { glyph: "question", glyphAnim: BOB },
  stamp: { glyph: "check", glyphAnim: "bk-a-g-stamp", ringAnim: "bk-a-kick", glow: "burst" },
  flick: { glyph: "card", glyphAnim: "bk-a-g-flick", leaves: true },
  crumple: { glyph: "card", glyphAnim: "bk-a-g-crumple", leaves: true },
  push: { glyph: "card-bang", glyphAnim: "bk-a-g-push", glow: "waves" },
  clock: { glyph: "clock", glyphAnim: BOB },
  reply: { glyph: "bubble-lines", glyphAnim: POP },
  // ── a phrase that did not make it ──
  ear: { glyph: "quiet", ring: "open", glyphAnim: BOB, glow: "in" },
  scratch: { glyph: "question", ring: "apart", ringAnim: "bk-a-rock", glyphAnim: BOB },
  pinch: { coreAnim: "bk-a-pinch" },
  nomic: { glyph: "mic-off", glyphAnim: "bk-a-g-no" },
  signal: { glyph: "signal-off", glyphAnim: "bk-a-g-no" },
  // ── what happens to the employee's work ──
  catch: { glyph: "card", glyphAnim: "bk-a-g-drop", ringAnim: "bk-a-gulp" },
  insist: { glyph: "card-bang2", glyphAnim: "bk-a-g-no", all: "bk-a-hop2" },
  nod: { glyph: "check", glyphAnim: POP, all: "bk-a-nod" },
  raise: { glyph: "question", glyphAnim: BOB },
  shrug: { glyph: "card-x", ring: "apart", ringAnim: "bk-a-shrug", glyphAnim: "bk-a-g-tilt" },
  poof: { glyph: "card", glyphAnim: "bk-a-g-poof", extra: "dust", leaves: true },
  handover: { glyph: "card", glyphAnim: "bk-a-g-fly", ringAnim: "bk-a-kick", glow: "burst", leaves: true },
  medal: { glyph: "medal", color: "var(--gold)", glyphAnim: POP, extra: "spark", glow: "waves" },
  boomerang: { glyph: "card", glyphAnim: "bk-a-g-boomerang", ringAnim: "bk-a-gulp-late" },
  relief: { lidAnim: "bk-a-rest", ringAnim: "bk-a-inhale", glow: "waves" },
  letter: { glyph: "envelope", glyphAnim: "bk-a-g-drop" },
  read: { glyph: "lines", glyphAnim: POP },
  listen: { glyph: "sound", glyphAnim: POP },
  thumb: { glyph: "thumb", glyphAnim: POP },
  watch: { glyph: "clock", glyphAnim: BOB },
  shuffle: { glyph: "stack", glyphAnim: "bk-a-g-shuffle" },
  coin: { glyph: "coin", color: "var(--gold)", glyphAnim: "bk-a-g-flip", extra: "spark" },
  // ── the small things of a face at rest ──
  // dozing off: a long breath of the ring, the lid rests — the mark has no mouth to open
  yawn: { ringAnim: "bk-a-inhale", lidAnim: "bk-a-rest" },
  turn: { ring: "apart", ringAnim: "bk-a-roll", glyphAnim: "bk-a-g-tilt" },
  doze: { all: "bk-a-nodoff" },
  // a good dream: the sleeper warms to gold for a moment, the line of the shut eye lifts, a spark, two waves
  smile: { color: "var(--gold)", glyphAnim: "bk-a-g-lift", extra: "spark", glow: "waves" },
  kick: { all: "bk-a-jerk" },
  // hello: the whole mark tips like a head — a swing of the pupil from side to side is «нет»
  wave: { all: "bk-a-greet", lookAnim: "bk-a-lookup", glow: "waves" },
  // the lid shuts aslant and the ring lifts on that side — a blink shuts level
  wink: { lidAnim: "bk-a-wink", ringAnim: "bk-a-cock", extra: "spark" },
  hop: { all: "bk-a-hop" },
  spin: { ring: "apart", ringAnim: "bk-a-spin" },
  heart: { glyph: "heart", glyphAnim: "bk-a-g-beat" },
  orbit: { lookAnim: "bk-a-follow", extra: "moon" },
  peek: { lookAnim: "bk-a-peek", ringAnim: "bk-a-lean" },
  tiptoe: { all: "bk-a-tiptoe", lookAnim: "bk-a-lookup" },
  // a comet goes round the ring twice and the pupil goes after it
  scan: { ring: "dim", comet: true, lookAnim: "bk-a-scan" },
  // the ring opens into its three arcs, a long breath, and closes
  limber: { ring: "open", ringAnim: "bk-a-inhale", lidAnim: "bk-a-rest" },
  // the pupil goes once round the rim
  eyeroll: { lookAnim: "bk-a-eyeroll" },
  // one strong beat: the dot thumps, the ring kicks, two waves
  thump: { coreAnim: "bk-a-thump", ringAnim: "bk-a-kick", glow: "waves" },
};

/** The stages of a phrase: the mark is busy with it and plays nothing else. */
const BUSY: ReadonlySet<MascotState> = new Set(["listening", "saving", "transcribing", "parsing", "sending"]);

/** The work of an open ball of Пульс: the dot is that ball's thing for as long as the card is open. */
const JOBS: ReadonlySet<MascotState> = new Set(["checking", "chatting", "announcing", "tuned", "scheduling", "serving"]);

/**
 * Whether an act called on purpose plays on when the face turns to `to` (D-82): it does — the wave
 * of waking plays over whatever the face wakes into, the employee's «есть!» over the stack it now
 * carries — unless the face turns to a ball's work or a stage of the phrase. The dot is one: the
 * new thing is shown at once, not after somebody else's gesture.
 */
export function actSurvives(to: MascotState): boolean {
  return !BUSY.has(to) && !JOBS.has(to);
}
