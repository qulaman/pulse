import { gripsOf, holdsHands, planHands, type HandPlan } from "@/components/brand/hands";
import type { MascotAct, MascotState } from "@/components/brand/Mascot";
import type { MascotSeason } from "@/lib/mascot/season";

/*
 * What the assistant's face («Капля», components/brand/Mascot.tsx) does in each state and act — its
 * colours, its motions — and the pose drawn from its props: how open the eyes are, where they look,
 * which hand an act takes, what the ground shadow answers. Pure: no React, no DOM.
 */

/**
 * The blue the face wears while it sleeps. The dream orbiting the board is drawn in the
 * same one (components/pulse/DreamOrbit.tsx), so it reads as coming out of this face.
 */
export const SLEEP_COLOR = "color-mix(in srgb, var(--accent) 72%, var(--surface-2))";

export const COLOR: Record<MascotState, string> = {
  calm: "var(--accent)",
  listening: "var(--accent)",
  saving: "var(--accent)",
  transcribing: "var(--warn)",
  parsing: "var(--warn)",
  sending: "var(--accent)",
  offering: "var(--accent)",
  thinking: "var(--warn)",
  speaking: "var(--accent)",
  happy: "var(--gold)",
  sleeping: SLEEP_COLOR,
  processing: "var(--accent)",
  calling: "var(--warn)",
  // the body keeps its own colour: the amber is the light over the head alone (D-149)
  alert: "var(--accent)",
  nervous: "var(--warn)",
  panicking: "var(--danger)",
  checking: "var(--accent)",
  chatting: "var(--accent)",
  announcing: "var(--accent)",
  scheduling: "var(--accent)",
  serving: "var(--accent)",
  celebrating: "var(--gold)",
  working: "var(--accent)",
  awaiting: "var(--accent)",
  tuned: "var(--accent)",
};

/**
 * The things the face holds for a ball wear the ball's own colour (OrbitBalls), so the eye
 * links the prop to the ball that was tapped; the body keeps the assistant's colour — its
 * colour is the mood (D-45), and opening a panel is not a mood.
 */
export const TONE = {
  tasks: "var(--accent)",
  messages: "var(--warn)",
  ether: "var(--gold)",
  calendar: "var(--accent)",
  secretary: "var(--gold)",
} as const;

/**
 * Every state that has no pose of its own still arrives instead of cutting in: the blob
 * settles for 220 ms on the entrance curve. The pipeline (saving → transcribing → parsing
 * → sending) is one character doing one job, so the eye must keep tracking the same object.
 */
export const SETTLE = "mascot-settle 0.22s cubic-bezier(0.16, 1, 0.3, 1) both";

/** One-shot pose on entering the state (outer group, keeps its end frame). */
export const POSE: Record<MascotState, string> = {
  calm: SETTLE,
  listening: "mascot-lean 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  saving: SETTLE,
  transcribing: "mascot-tilt-read 0.5s var(--ease-out) both",
  parsing: SETTLE,
  sending: SETTLE,
  offering: SETTLE,
  thinking: SETTLE,
  speaking: SETTLE,
  happy: SETTLE,
  sleeping: SETTLE,
  calling: "mascot-lean 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  alert: "mascot-alert-pose 0.5s cubic-bezier(0.34, 1.35, 0.64, 1) both",
  // the whole take lives in the pose: read, lock, hop, report
  processing: "mascot-process 1.9s both",
  nervous: SETTLE,
  panicking: "mascot-panic-pose 0.36s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  // leans over the clipboard it has just taken out
  checking: "mascot-check-pose 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  chatting: SETTLE,
  // draws itself up to speak to the whole company
  announcing: "mascot-announce-pose 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  // turns to the calendar over its shoulder
  scheduling: "mascot-schedule-pose 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  // a small bow, the way a cup is brought in
  serving: "mascot-bow 0.8s cubic-bezier(0.34, 1.2, 0.64, 1) both",
  celebrating: "mascot-cheer-pose 0.9s both",
  working: SETTLE,
  awaiting: SETTLE,
  // turns an ear to the word to everyone, the way `listening` turns it to the director
  tuned: "mascot-lean 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
};

/** Looping body motion (inner group). */
export const BODY: Record<MascotState, string> = {
  calm: "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  listening: "mascot-nod 1.15s ease-in-out infinite",
  saving: "mascot-tuck 1.4s ease-in-out infinite",
  transcribing: "mascot-read-body 2.4s ease-in-out infinite",
  parsing: "mascot-sort-body 2.4s ease-in-out infinite",
  sending: "mascot-throw 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  offering: "mascot-offer 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  thinking: "mascot-ponder 2.6s ease-in-out infinite",
  speaking: "mascot-talk 1.1s ease-in-out infinite",
  happy: "mascot-happy 3.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  sleeping: "mascot-sleep 7s ease-in-out infinite",
  // under the take the body keeps breathing, so the face is alive once the report is done
  processing: "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  calling: "mascot-call 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite",
  alert: "mascot-alert 4.6s ease-in-out infinite",
  nervous: "mascot-nervous 1.35s ease-in-out infinite",
  panicking: "mascot-panic 1.92s ease-in-out infinite",
  checking: "mascot-check 3.6s ease-in-out infinite",
  chatting: "mascot-chat 3.2s ease-in-out infinite",
  announcing: "mascot-announce 1.4s ease-in-out infinite",
  scheduling: "mascot-schedule 3s ease-in-out infinite",
  serving: "mascot-serve 3.2s ease-in-out infinite",
  celebrating: "mascot-happy 3.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  working: "mascot-work 6.4s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  awaiting: "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  tuned: "mascot-nod 1.8s ease-in-out infinite",
};

/**
 * Secondary motion: the eyes are carried by the body, so they arrive a beat after it and
 * settle after it stops. Only the states that name a drag pay for it — the group is there
 * for everyone, but without an animation it costs nothing.
 */
export const DRAG: Partial<Record<MascotState, string>> = {
  calm: "mascot-drag-breath 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  listening: "mascot-drag-nod 1.15s ease-in-out infinite",
  happy: "mascot-happy-look 3.8s infinite",
  speaking: "mascot-drag-nod 1.1s ease-in-out infinite",
  thinking: "mascot-drag-breath 2.6s ease-in-out infinite",
  serving: "mascot-drag-breath 3.2s ease-in-out infinite",
  celebrating: "mascot-happy-look 3.8s infinite",
  working: "mascot-drag-breath 6.4s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  awaiting: "mascot-drag-breath 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  tuned: "mascot-drag-nod 1.8s ease-in-out infinite",
};

/** Eyes as a pair. */
const EYES: Record<MascotState, string> = {
  calm: "mascot-glance 9s ease-in-out infinite",
  listening: "mascot-attend 3.2s ease-in-out infinite",
  saving: "mascot-track-down 1.4s ease-in-out infinite",
  transcribing: "mascot-read 1.3s ease-in-out infinite",
  parsing: "mascot-look-cards 2.4s ease-in-out infinite",
  sending: "mascot-follow 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  offering: "mascot-offer-eyes 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  // it looks the person in the eye between the hops, not around the room
  calling: "mascot-attend 3.2s ease-in-out infinite",
  alert: "mascot-beacon-look 4.6s ease-in-out infinite",
  thinking: "mascot-wander 2.6s ease-in-out infinite",
  speaking: "mascot-speak-look 2.2s ease-in-out infinite",
  happy: "none",
  sleeping: "none",
  processing: "mascot-code-look 1.9s both",
  nervous: "mascot-nervous-look 1.35s ease-in-out infinite",
  panicking: "mascot-panic-look 1.92s ease-in-out infinite",
  checking: "mascot-check-look 3.6s infinite",
  chatting: "mascot-chat-look 3.2s infinite",
  announcing: "mascot-announce-look 1.4s ease-in-out infinite",
  scheduling: "mascot-schedule-look 3s infinite",
  serving: "mascot-serve-look 3.2s infinite",
  celebrating: "none",
  working: "mascot-work-look 6.4s infinite",
  awaiting: "mascot-await-look 5s infinite",
  tuned: "mascot-attend 3.2s ease-in-out infinite",
};

/** An act moves the whole body over whatever the state is doing (outermost motion group). */
const ACT_BODY: Record<MascotAct, string> = {
  yawn: "mascot-act-yawn 2.2s ease-in-out both",
  snore: "mascot-act-snore 2.8s ease-in-out both",
  turn: "mascot-act-turn 2.6s ease-in-out both",
  doze: "mascot-act-doze 2.4s both",
  mumble: "mascot-act-mumble 2.6s ease-in-out both",
  smile: "mascot-act-content 3.2s ease-in-out both",
  kick: "mascot-act-kick 1.6s ease-in-out both",
  wave: "mascot-act-wave-body 1.8s ease-in-out both",
  wink: "mascot-act-wink-body 1.3s ease-in-out both",
  hop: "mascot-act-hop 1s both",
  spin: "mascot-act-spin 1.3s both",
  whistle: "mascot-act-whistle 2.8s ease-in-out both",
  heart: "mascot-act-heart-body 2.4s ease-in-out both",
  orbit: "mascot-act-orbit-body 3.6s ease-in-out both",
  peek: "mascot-act-peek 2.8s ease-in-out both",
  tiptoe: "mascot-act-tiptoe 2.2s ease-in-out both",
  // the work (D-110)
  catch: "mascot-act-catch 1.5s both",
  insist: "mascot-act-catch 1.5s both",
  nod: "mascot-act-nod 1.2s ease-in-out both",
  raise: "mascot-act-raise 1.8s ease-in-out both",
  shrug: "mascot-act-shrug 1.8s both",
  poof: "mascot-act-poof 1.8s ease-in-out both",
  handover: "mascot-throw 1.2s cubic-bezier(0.4, 0, 0.2, 1) both",
  medal: "mascot-act-medal-body 2.4s both",
  boomerang: "mascot-act-sigh 2.2s both",
  relief: "mascot-act-relief 1.8s ease-in-out both",
  letter: "mascot-act-turn-to 1.5s ease-in-out both",
  read: "mascot-act-nod 1.4s ease-in-out both",
  listen: "mascot-act-lean-in 2s cubic-bezier(0.34, 1.2, 0.64, 1) both",
  thumb: "mascot-act-proud 1.3s ease-in-out both",
  watch: "mascot-act-watch 1.8s ease-in-out both",
  wipe: "mascot-act-wipe 1.8s ease-in-out both",
  shuffle: "mascot-act-content 1.4s ease-in-out both",
  coin: "mascot-act-gulp 1.6s both",
  // the director's face answers the board (tasks/020)
  tick: "mascot-act-tick-nod 1.2s ease-in-out both",
  receive: "mascot-act-receive 1.6s ease-in-out both",
  hmm: "mascot-act-hmm 1.8s ease-in-out both",
  puzzle: "mascot-act-puzzle 1.6s ease-in-out both",
  stamp: "mascot-act-stamp 1.8s both",
  flick: "mascot-act-flick 1.4s both",
  crumple: "mascot-act-crumple 1.7s both",
  push: "mascot-act-push-body 1.6s both",
  clock: "mascot-act-clock 1.8s ease-in-out both",
  reply: "mascot-act-reply 2s ease-in-out both",
  ear: "mascot-act-ear-tilt 1.8s ease-in-out both",
  scratch: "mascot-act-scratch 1.8s ease-in-out both",
  pinch: "mascot-act-pinch 1.6s ease-in-out both",
  nomic: "mascot-act-nomic 2s ease-in-out both",
  signal: "mascot-act-tiptoe 2.2s ease-in-out both",
};

/** Where an act sends the gaze — both eyes together, on top of the state's own look. */
const ACT_GAZE: Partial<Record<MascotAct, string>> = {
  orbit: "mascot-act-orbit-eyes 3.6s linear both",
  // turned round in the air, it shows its back: no eyes while the body is past edge-on
  spin: "mascot-act-spin-eyes 1.3s linear both",
  peek: "mascot-act-peek-eyes 2.8s ease-in-out both",
  tiptoe: "mascot-act-tiptoe-eyes 2.2s ease-in-out both",
  heart: "mascot-act-look-up 2.4s ease-in-out both",
  catch: "mascot-act-catch-eyes 1.5s ease-in-out both",
  insist: "mascot-act-catch-eyes 1.5s ease-in-out both",
  raise: "mascot-act-look-hand 1.8s ease-in-out both",
  poof: "mascot-act-look-up 1.8s ease-in-out both",
  handover: "mascot-follow 1.2s cubic-bezier(0.4, 0, 0.2, 1) both",
  medal: "mascot-act-medal-eyes 2.4s ease-in-out both",
  boomerang: "mascot-act-boomerang-eyes 2.2s ease-in-out both",
  letter: "mascot-act-look-letter 1.5s ease-in-out both",
  read: "mascot-act-look-letter 1.4s ease-in-out both",
  listen: "mascot-act-attend 2s ease-in-out both",
  watch: "mascot-act-watch-eyes 1.8s ease-in-out both",
  shuffle: "mascot-act-shuffle-eyes 1.4s ease-in-out both",
  coin: "mascot-act-look-up 1.6s ease-in-out both",
  tick: "mascot-act-tick-eyes 1.2s ease-in-out both",
  receive: "mascot-act-receive-eyes 1.6s both",
  hmm: "mascot-act-hmm-eyes 1.8s ease-in-out both",
  puzzle: "mascot-act-puzzle-eyes 1.6s ease-in-out both",
  stamp: "mascot-act-stamp-eyes 1.8s ease-in-out both",
  flick: "mascot-act-flick-eyes 1.4s ease-in-out both",
  crumple: "mascot-act-crumple-eyes 1.7s ease-in-out both",
  push: "mascot-act-push-eyes 1.6s ease-in-out both",
  clock: "mascot-act-clock-eyes 1.8s ease-in-out both",
  reply: "mascot-act-reply-eyes 2s ease-in-out both",
  ear: "mascot-act-ear-eyes 1.8s ease-in-out both",
  scratch: "mascot-act-scratch-eyes 1.8s ease-in-out both",
  pinch: "mascot-act-pinch-eyes 1.6s ease-in-out both",
  nomic: "mascot-act-nomic-eyes 2s ease-in-out both",
  signal: "mascot-act-signal-eyes 2.2s ease-in-out both",
};
/** On «Задачи» the card of these acts lies on the clipboard, on the right: the eyes go there instead. */
const ACT_GAZE_ON_BOARD: Partial<Record<MascotAct, string>> = {
  stamp: "mascot-act-look-board 1.8s ease-in-out both",
  reply: "mascot-act-look-board 2s ease-in-out both",
};

/** How an act shapes each eye: [left, right]. A wink is the one act that tells them apart. */
const ACT_LIDS: Partial<Record<MascotAct, [string, string]>> = {
  yawn: ["mascot-act-squeeze 2.2s ease-in-out both", "mascot-act-squeeze 2.2s ease-in-out both"],
  // the sleeper half-opens its eyes on the jerk, sees nothing is wrong, and shuts them again
  doze: ["mascot-act-peep 2.4s both", "mascot-act-peep 2.4s both"],
  wave: ["mascot-act-glad 1.8s ease-in-out both", "mascot-act-glad 1.8s ease-in-out both"],
  wink: ["mascot-act-half 1.3s ease-in-out both", "mascot-act-wink 1.3s both"],
  whistle: ["mascot-act-relax 2.8s ease-in-out both", "mascot-act-relax 2.8s ease-in-out both"],
  heart: ["mascot-act-glad 2.4s ease-in-out both", "mascot-act-glad 2.4s ease-in-out both"],
  nod: ["mascot-act-glad 1.2s ease-in-out both", "mascot-act-glad 1.2s ease-in-out both"],
  shrug: ["mascot-act-relax 1.8s ease-in-out both", "mascot-act-relax 1.8s ease-in-out both"],
  medal: ["mascot-act-glad 2.4s ease-in-out both", "mascot-act-glad 2.4s ease-in-out both"],
  boomerang: ["mascot-act-sigh-lids 2.2s ease-in-out both", "mascot-act-sigh-lids 2.2s ease-in-out both"],
  relief: ["mascot-act-relax 1.8s ease-in-out both", "mascot-act-relax 1.8s ease-in-out both"],
  thumb: ["mascot-act-glad 1.3s ease-in-out both", "mascot-act-glad 1.3s ease-in-out both"],
  wipe: ["mascot-act-squeeze 1.8s ease-in-out both", "mascot-act-squeeze 1.8s ease-in-out both"],
  tick: ["mascot-act-glad 1.2s ease-in-out both", "mascot-act-glad 1.2s ease-in-out both"],
  // one slow blink while it thinks it over
  hmm: ["mascot-act-hmm-lids 1.8s both", "mascot-act-hmm-lids 1.8s both"],
  // «вот столечко»: one eye narrowed at the gap between the fingers
  pinch: ["none", "mascot-act-squint 1.6s ease-in-out both"],
};

/** The acts that warm the cheeks. */
const ACT_BLUSH: Partial<Record<MascotAct, true>> = { smile: true, heart: true, wave: true, wink: true, medal: true, thumb: true, coin: true };

/** The acts whose mouth is a flat «эх»: a no, a card taken away, a card back to redo. */
const FLAT_MOUTH: Partial<Record<MascotAct, string>> = {
  shrug: "mascot-act-flat-mouth 1.8s ease-in-out both",
  poof: "mascot-act-flat-mouth 1.8s ease-in-out both",
  boomerang: "mascot-act-flat-mouth 2.2s ease-in-out both",
};
/** The acts that smile for their length: a medal, a thumb up, points in. */
const ACT_SMILE: Partial<Record<MascotAct, string>> = {
  medal: "mascot-act-smile 2.4s ease-in-out both",
  thumb: "mascot-act-smile 1.3s ease-in-out both",
  coin: "mascot-act-smile 1.6s ease-in-out both",
  nod: "mascot-act-smile 1.2s ease-in-out both",
  tick: "mascot-act-smile 1.2s ease-in-out both",
  stamp: "mascot-act-smile 1.8s ease-in-out both",
};

/**
 * The prop of a ball's job comes into the hand a beat after the face takes the job: whatever that hand
 * held before (the stack of orders, the prop of the last ball, the envelope by the head) has left it
 * by then — two things never sit in one hand. The cup has always waited this long.
 */
export const PROP_DELAY = "0.15s";
/** The prop of a ball's job coming into the hand: up from below, a little overshoot, after PROP_DELAY. */
export const PROP_IN = `mascot-prop-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) ${PROP_DELAY} both`;

/** Acts that put something right under the light — the tick, the crossed-out ear: it steps aside for them. */
const BEACON_STEPS_ASIDE = new Set<MascotAct>(["tick", "nomic"]);

/**
 * The holiday wear steps aside for whatever comes to its place and is back after it (D-119): the New
 * Year hat leaves the crown to a card, a coin or a heart over the head; the Nauryz tulip at the left
 * temple leaves it to a raised left hand, the clock, the «?», the envelope and the calendar. The two
 * bubbles of «Сообщения» take both sides over the head: the hat's pompom and the tulip go for them.
 */
const WEAR_ASIDE: Record<MascotSeason, { states: ReadonlySet<MascotState>; acts: ReadonlySet<MascotAct> }> = {
  new_year: {
    states: new Set(["calling", "chatting"]),
    acts: new Set(["catch", "insist", "boomerang", "shrug", "nod", "poof", "handover", "coin", "heart", "puzzle", "ear"]),
  },
  nauryz: {
    states: new Set(["nervous", "scheduling", "chatting"]),
    acts: new Set(["wave", "raise", "signal", "clock", "relief", "scratch", "letter", "read", "puzzle", "ear"]),
  },
};

/** A held look travels as a springy saccade, not a slide; the head's lean follows on the same curve. */
export const LOOK_EASE = "transform 420ms cubic-bezier(0.34, 1.45, 0.64, 1)";

/** What a face is asked to be: the props of <Mascot>. */
export type MascotProps = {
  state: MascotState;
  size: number;
  level: number;
  act: MascotAct | null;
  carry: { count: number; hot?: boolean } | null;
  season: MascotSeason | null;
  gaze: { x: number; y: number } | null;
};

/** The pose of a face: everything the drawing reads from its props, worked out once per render. */
export type MascotPose = {
  /** the happy squint (happy, celebrating) — dropped for an act's flat «эх» */
  squint: boolean;
  talking: boolean;
  asleep: boolean;
  anxious: boolean;
  /** a cup in the hands: softened eyes, a small smile */
  content: boolean;
  shouting: boolean;
  /** the swell and the dip of the voice while listening */
  voiceTransform: string;
  /** the eye's shape as a scale of the drawn eye */
  eyeShape: string;
  gazeShift: string;
  lean: string;
  /** remounts the lids per look target, so the eyes blink on the way */
  gazeKey: string;
  gazeBlink: string;
  blink: string;
  /** big enough for the gleam, the ground shadow, the props of a job and of an act */
  detailed: boolean;
  /** processing big enough for its reading scene */
  reading: boolean;
  /** the act whose props are drawn — none at avatar size */
  acting: MascotAct | null;
  beacon: boolean;
  wear: boolean;
  cheeks: boolean;
  /** an act that warms the cheeks for its length (when they are not warm already) */
  actBlush: boolean;
  /** the employee's stack of orders in the hands */
  holding: boolean;
  onBoard: boolean;
  hands: HandPlan;
  /** the act is drawn on the other side (hands.ts) */
  flip: boolean;
  penDown: boolean;
  mittenOff: HandPlan["letGo"];
  lids: [string, string] | undefined;
  actGaze: string;
  actBody: string;
  eyeLoop: string;
  actSmile: string | undefined;
  flatMouth: string | undefined;
  shadow: string;
};

export function mascotPose({ state, size, level, act, carry, season, gaze }: MascotProps): MascotPose {
  // a no, a card taken back or sent back to redo is not met with a grin: the flat «эх» of the
  // act drops the happy squint for its length (D-110)
  const squint = (state === "happy" || state === "celebrating") && !(act && FLAT_MOUTH[act]);
  const wide = state === "listening";
  const talking = state === "speaking";
  const lidded = state === "saving"; // eyes half-closed while tucking the note away
  const asleep = state === "sleeping"; // eyes shut, a slow breath, small z-s drifting up
  const anxious = state === "nervous" || state === "panicking";
  const content = state === "serving"; // a cup in the hands: the eyes soften, a small smile
  const shouting = state === "announcing";
  const clamped = Math.min(1, Math.max(0, level));
  // The voice swells the blob and pushes the nod: louder — bigger and a deeper dip. The level
  // is read from `--mascot-level` when an ancestor paints it (the lever writes it straight into
  // the DOM — twenty board renders a second otherwise, D-126), from the prop when it does not.
  const voice = `var(--mascot-level, ${clamped.toFixed(3)})`;
  const voiceTransform =
    state === "listening" ? `translateY(calc(${voice} * 2.2px)) scale(calc(1 + ${voice} * 0.14))` : "translateY(0px) scale(1)";
  // How far the eye is open, as a share of the drawn eye: the size lives in EYE_RX/EYE_RY
  // alone, so the whole cast grows or shrinks together and no state has to be re-tuned.
  const calling = state === "calling"; // «обрати внимание!»: wide eyes and an «!» over the head
  const watchful = state === "alert"; // «насторожен»: the director's face watches, never scowls
  const open = asleep ? 0.19 : squint ? 0.42 : lidded ? 0.61 : content ? 0.72 : wide || anxious || calling ? 1.16 : watchful || shouting ? 1.08 : 1;
  // a closing eye also shortens: at this size a full-width slit reads as a bar across the face
  const widen = wide ? 1.06 : anxious || calling ? 1.1 : asleep ? 0.8 : squint ? 0.85 : lidded || content ? 0.92 : 1;
  // the eye is drawn once at EYE_RX/EYE_RY and reshaped by scale — a compositor-only change
  const eyeShape = `scale(${widen}, ${open})`;
  // a held look: the eyes travel to the side (a springy saccade, not a slide) and the head
  // tips towards it; the state's own roaming eyes are switched off so the look stays put
  const gx = gaze ? Math.max(-1, Math.min(1, gaze.x)) : 0;
  const gy = gaze ? Math.max(-1, Math.min(1, gaze.y)) : 0;
  const gazeShift = `translate(${(gx * 4.8).toFixed(2)}px, ${(gy * 3.8).toFixed(2)}px)`;
  const lean = `translateX(${(gx * 2).toFixed(2)}px) rotate(${(gx * 9).toFixed(2)}deg)`;
  // eyes that jump to somebody new blink on the way — the key remounts the lid group per target
  const gazeKey = gaze ? `${Math.round(gx * 3)}:${Math.round(gy * 3)}` : "own";
  const gazeBlink = gaze ? "mascot-blink-once 0.24s ease-in-out both" : "none";
  // one cycle now holds a flick, its echo and a later single blink, so the rhythm is not a tick
  const blink = squint || lidded || asleep ? "none" : "mascot-blink 9.2s infinite";
  // at avatar sizes the gleam and the ground shadow are sub-pixel decoration: draw them, do not animate
  const detailed = size >= 40;
  // the glyphs, the store and the tick are a reading scene — below avatar size it is noise,
  // and the hop alone still says «the status moved»
  const reading = state === "processing" && detailed;
  // the props of a held job and of an act are drawn for a face big enough to see them;
  // at avatar size the body motion alone still plays
  const acting = detailed ? act : null;
  const beacon = state === "alert" && !(acting && BEACON_STEPS_ASIDE.has(acting));
  const wear = season != null && detailed && !WEAR_ASIDE[season].states.has(state) && !(acting && WEAR_ASIDE[season].acts.has(acting));
  const cheeks = squint || content;
  // the stack of orders in the hands (D-110); a held job of a ball keeps the hands for itself
  const holding = detailed && carry !== null && carry.count > 0 && !holdsHands(state);
  const flatMouth = act ? FLAT_MOUTH[act] : undefined;
  // Two hands, never three (components/brand/hands.ts): an act whose hand the job holds is drawn on
  // the free side — the hand, the lean of the body and the look, all mirrored together — or the job
  // puts down what it can for the act's length: the pencil of «Задачи», the mitten under the saucer
  const onBoard = state === "checking";
  const hands = planHands(acting, gripsOf(state, holding), onBoard);
  const flip = hands.mirror;
  const penDown = onBoard && hands.letGo === "left";
  const mittenOff = state === "serving" ? hands.letGo : null;
  // a wink or a squint of the act goes with it to the other eye
  const lidsDrawn = act ? ACT_LIDS[act] : undefined;
  const lids: [string, string] | undefined = lidsDrawn && flip ? [lidsDrawn[1], lidsDrawn[0]] : lidsDrawn;
  const actGaze = act ? ((onBoard ? ACT_GAZE_ON_BOARD[act] : undefined) ?? ACT_GAZE[act] ?? "none") : "none";
  const actBody = act ? ACT_BODY[act] : "none";
  const eyeLoop = gaze ? "none" : EYES[state];
  const actSmile = act === "smile" ? "mascot-act-smile 3.2s ease-in-out both" : act ? ACT_SMILE[act] : undefined;
  // the jumps of an act leave the ground too, and while they do the ground answers them
  // instead of the state's breath
  const actShadow = act === "hop" ? "mascot-shadow-act-hop 1s both" : act === "spin" ? "mascot-shadow-act-spin 1.3s both" : null;
  const shadow = !detailed
    ? "none"
    : actShadow
      ? actShadow
      : state === "happy"
        ? "mascot-shadow-hop 3.8s ease-in-out infinite"
        : state === "sleeping"
          ? "mascot-shadow-sleep 7s ease-in-out infinite"
          : state === "calm" || state === "awaiting"
            ? "mascot-shadow-idle 5.8s ease-in-out infinite"
            // the one-shots big enough for the ground to answer them
            : state === "processing"
                ? "mascot-shadow-process 1.9s both"
                : state === "celebrating"
                  ? "mascot-shadow-cheer 0.9s both"
                  : "none";
  const actBlush = acting !== null && ACT_BLUSH[acting] === true && !cheeks;
  return {
    squint,
    talking,
    asleep,
    anxious,
    content,
    shouting,
    voiceTransform,
    eyeShape,
    gazeShift,
    lean,
    gazeKey,
    gazeBlink,
    blink,
    detailed,
    reading,
    acting,
    beacon,
    wear,
    cheeks,
    actBlush,
    holding,
    onBoard,
    hands,
    flip,
    penDown,
    mittenOff,
    lids,
    actGaze,
    actBody,
    eyeLoop,
    actSmile,
    flatMouth,
    shadow,
  };
}
