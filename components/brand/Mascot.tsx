import { Linger, SHRINK_OUT } from "@/components/brand/Linger";
import { Carry, MascotFace } from "@/components/brand/MascotFace";
import { MascotOverlays } from "@/components/brand/MascotOverlays";
import { Beacon, PropsBehind, PropsBehindBody, PropsOnBody } from "@/components/brand/MascotStateProps";
import { MIRROR, type BoardAct, type ErrorAct, type WorkAct } from "@/components/brand/MascotWork";
import { BODY, COLOR, LOOK_EASE, mascotPose, POSE } from "@/lib/mascot/pose";
import type { MascotSeason } from "@/lib/mascot/season";

/**
 * The assistant character «Капля» (D-45, docs/DESIGN.md §3): one soft blob, two eyes.
 * The director's, the employee's and the wall's faces. Each state is its own choreography — a
 * one-shot pose on entry (lean in, wind up), a looping body motion, the eyes as a pair,
 * and a small prop around the blob — so the director reads what the assistant is doing
 * at a glance, without a caption:
 *   calm         breathing, a rare glance
 *   listening    leans in and offers an ear; nods with the voice; sound waves enter the ear
 *   saving       tucks the note away: a card sinks into the head, a satisfied squash
 *   transcribing reads: bars of sound turn into lines of text, the eyes scan left → right
 *   parsing      sorts: cards appear over the head one by one and slide into a stack
 *   sending      winds up and throws the card itself: it shows up in the hand on the wind-up,
 *                leaves at the release and flies up and away; the eyes follow it
 *   offering     holds the parsed cards and asks to be tapped: presses itself down and pops
 *                back like a button, a ring ripples out, the stack lifts with the pop
 *   thinking     generic pondering — a tilt, wandering eyes, three dots
 *   speaking     the mouth moves with the words, small nods (D-49)
 *   happy        golden, squint and blush, a slow breath with sparks
 *   sleeping     eyes shut, the slowest breath, z-s drifting up — the screen before the first tap
 *                (what he dreams of is drawn outside the head: components/pulse/DreamOrbit.tsx)
 *   alert        «насторожен»: straightens up and holds still, the eyes sweep the room, stop at
 *                the edges and go up to a small amber light over the head — the director's face
 *                never gets angry, it watches
 *   calling      «обрати внимание!»: leans in, hops twice like a dog at the door, an «!»
 *                pops over its head — the employee has an order nobody has opened yet
 *   processing   reads the data and reports: plugs into the store, the eyes run glyphs,
 *                then a hop and the tick of the new status (D-65)
 * What the face does while a ball of Пульс is open (D-82) — the ball's own job, done by hand:
 *   checking     «Задачи»: holds a clipboard and ticks it off row by row, the eyes go down the list
 *   chatting     «Сообщения»: a bubble comes in with the typing dots, the face turns and answers
 *   announcing   «Эфир»: a megaphone at the mouth, the body pumps, the words go out in arcs
 *   scheduling   «Календарь»: a tear-off calendar over the shoulder, a page flips and falls
 *   serving      «Секретарь»: a cup on a saucer held with care, steam rising, a small bow
 *   celebrating  the batch has flown: a jump and a burst of confetti
 * The employee's face carries the work the director hands out (D-110, components/brand/MascotWork.tsx):
 *   calling      the «!» is the new order itself — a card with a «!» badge over the head
 *   nervous      the unread word of the director — an envelope bobs by the head
 *   working      orders in work: holds the stack of cards (`carry`), glances down at it
 *   awaiting     everything handed over: an hourglass runs, the eyes go up to the director
 *   tuned        «Эфир» from the listener's side: an ear up, gold arcs come into it
 * An `act` is a one-shot over any of them (D-82): the small things a face does while nothing
 * is asked of it — a yawn, a snore bubble, rolling over, a wave, a wink (see MascotAct) — and,
 * on the employee's face, what has just happened to the work: a card caught, «есть!», a hand
 * up, a shrug, the card thrown up to the director, a medal, the card back to redo (D-110).
 * Two hands, never three: whatever the face holds is held by a hand you can see (a thumb over the
 * edge, a mitten under the saucer, a fist on the grip), and a gesture takes the hand that is free —
 * the employee's stack is in the right hand, so a wave, a shrug or a wiped brow uses the left.
 * Perf contract: a single SVG, animation on transform and opacity only, CSS keyframes
 * (app/globals.css), nothing on filter or box-shadow. Pass `level` (0..1, from the
 * microphone) while listening — the blob swells and nods harder with the voice.
 * The drawing goes in paint order: the props of a state (MascotStateProps.tsx) behind the face,
 * behind the body and on it, the eyes and mouths (MascotFace.tsx), then what is drawn over
 * everything (MascotOverlays.tsx); what the props make of the face — lib/mascot/pose.ts.
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

/**
 * The small one-shots of a face at rest (D-82): played over the state, never instead of it,
 * so the barometer still reads — a sleeping face yawns and stays asleep. The waiting screen
 * picks them (components/pulse/useMascotActs.ts); the screen can also call one on purpose — a
 * wave when the face wakes, a yawn when it dozes off again.
 */
export type MascotAct =
  | "yawn"
  | "snore"
  | "turn"
  | "doze"
  | "mumble"
  | "smile"
  | "kick"
  | "wave"
  | "wink"
  | "hop"
  | "spin"
  | "whistle"
  | "heart"
  | "orbit"
  | "peek"
  | "tiptoe"
  | WorkAct
  | BoardAct
  | ErrorAct;

/** How long each act takes: the screen clears it after this, the keyframes are cut to it. */
export const ACT_MS: Record<MascotAct, number> = {
  // the director's face answers the board (tasks/020)
  tick: 1200,
  receive: 1600,
  hmm: 1800,
  puzzle: 1600,
  stamp: 1800,
  flick: 1400,
  crumple: 1700,
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
  poof: 1800,
  handover: 1300,
  medal: 2400,
  boomerang: 2200,
  relief: 1800,
  letter: 1500,
  read: 1400,
  listen: 2000,
  thumb: 1300,
  watch: 1800,
  wipe: 1800,
  shuffle: 1400,
  coin: 1600,
  yawn: 2200,
  snore: 2800,
  turn: 2600,
  doze: 2400,
  mumble: 2600,
  smile: 3200,
  kick: 1600,
  wave: 1800,
  wink: 1300,
  hop: 1000,
  spin: 1300,
  whistle: 2800,
  heart: 2400,
  orbit: 3600,
  peek: 2800,
  tiptoe: 2200,
};

/**
 * The moment an act lands, for a phone that can answer it in the hand (Android; iOS has no
 * vibration API): the card caught, the harder «!!», the medal on the chest, the card back on the
 * crown — [ms into the act, vibration pattern]. The screen that plays the act schedules it.
 */
export const ACT_TOUCH: Partial<Record<MascotAct, [number, number | number[]]>> = {
  catch: [570, 18],
  insist: [570, [18, 60, 24]],
  medal: [720, [14, 50, 22]],
  boomerang: [700, 22],
};

export { SLEEP_COLOR } from "@/lib/mascot/pose";

export function Mascot({
  state = "calm",
  size = 64,
  level = 0,
  act = null,
  gaze = null,
  carry = null,
  season = null,
}: {
  state?: MascotState;
  size?: number;
  level?: number;
  /** a one-shot over the state (D-82); the screen clears it after ACT_MS */
  act?: MascotAct | null;
  /**
   * The employee's orders in work, held as a stack of cards (D-110): how many, and whether one
   * of them is due within the hour. null or zero — empty hands.
   */
  carry?: { count: number; hot?: boolean } | null;
  /** a holiday of the company's calendar to dress for (D-119, lib/mascot/useSeason.ts) */
  season?: MascotSeason | null;
  /**
   * Where the face is looking, as a direction from its middle (−1..1 on each axis): the eyes
   * go there and hold, the head leans a little the same way (D-84 — the person the director
   * has just tapped). null — the state's own look.
   */
  gaze?: { x: number; y: number } | null;
}) {
  const pose = mascotPose({ state, size, level, act, carry, season, gaze });
  const { acting, actBody, beacon, detailed, flip, lean, shadow, voiceTransform } = pose;
  const side = flip ? MIRROR : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      data-state={state}
      data-act={act ?? undefined}
      style={{ overflow: "visible", display: "block" }}
    >
      {/* ground shadow mirrors the larger idle motions; no filters */}
      <ellipse
        cx="32"
        cy="61"
        rx="16"
        ry="2.5"
        fill="var(--bg)"
        opacity="0.5"
        style={{ transformOrigin: "32px 61px", animation: shadow }}
      />

      <PropsBehind state={state} pose={pose} side={side} />

      {/* voice: swell and dip follow the microphone (one transform, no re-layout) */}
      <g
        data-face
        style={{
          transformOrigin: "32px 60px",
          transform: voiceTransform,
          transition: "transform 90ms linear",
          // the only transform JS rewrites frame by frame; promoted while it does, released after
          willChange: state === "listening" ? "transform" : "auto",
        }}
      >
        {/* the lean towards whoever the face is looking at (D-84) — a transition, not a loop */}
        <g data-gaze={gaze ? "on" : undefined} style={{ transformOrigin: "32px 60px", transform: lean, transition: LOOK_EASE }}>
        {/* act: a one-shot over whatever the state is doing — the yawn, the roll, the hop (D-82); an
            act cut short (the face got busy) goes back to rest from where it was, not in one frame.
            An act drawn on the other side leans the other way: its motion is mirrored around the
            middle of the face, and what it carries is mirrored back */}
        <g transform={side}>
        <Carry on={detailed} k={actBody} origin="32px 58px" mirrored={flip}>
        <g style={{ transformOrigin: "32px 58px", animation: actBody }}>
        <g transform={side}>
          {/* alert: the light over the head (D-149). It goes where an act takes the head — up on tiptoe,
              out to peek, over to the ear — but not with the breath, so it hangs in the air instead of
              sitting on the crown; for an act that draws right under it the light steps aside */}
          <Linger show={beacon} out={SHRINK_OUT} origin="50% 50%">
            {beacon ? <Beacon detailed={detailed} /> : null}
          </Linger>
          {/* pose: one-shot on entry — it starts from the pose the last state left (the lean to the ear) */}
          <Carry on={detailed} k={POSE[state]} origin="32px 52px">
          <g style={{ transformOrigin: "32px 52px", animation: POSE[state] }}>
            {/* loop: the body's own motion — taken over from wherever the last loop was */}
            <Carry on={detailed} k={BODY[state]} origin="32px 44px">
            <g style={{ transformOrigin: "32px 44px", animation: BODY[state] }}>
              <PropsBehindBody state={state} pose={pose} side={side} />
              <path
                d="M32 4 C47 4 59 16 59 31 C59 47 47 60 32 60 C17 60 5 49 5 33 C5 18 17 4 32 4 Z"
                fill={COLOR[state]}
                style={{ transition: "fill var(--t-screen) var(--ease-out)" }}
              />
              {/* highlight: a lighter lens, colour only */}
              <ellipse
                cx="24"
                cy="18"
                rx="9"
                ry="5"
                fill="#ffffff"
                opacity="0.14"
                // 7.3s against the body's 5.8s: the gleam drifts through the breath instead of riding it
                style={{ transformOrigin: "24px 18px", animation: detailed ? "mascot-glint 7.3s ease-in-out infinite" : "none" }}
              />

              <PropsOnBody state={state} pose={pose} side={side} carry={carry} season={season} blushMs={acting ? ACT_MS[acting] : 0} />

              <MascotFace state={state} act={act} pose={pose} side={side} />
            </g>
            </Carry>
          </g>
          </Carry>
        </g>
        </g>
        </Carry>
        </g>
        </g>
      </g>

      <MascotOverlays state={state} pose={pose} side={side} />
    </svg>
  );
}
