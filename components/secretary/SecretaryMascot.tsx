import type { GlyphId } from "@/components/brand/mark/glyphs";
import type { ActLook, StateLook } from "@/components/brand/mark/look";
import { LITE_PX } from "@/components/brand/mark/look";
import { Mark } from "@/components/brand/mark/Mark";
import type { Daypart, DeskPhase, DeskScene, Urgency } from "@/lib/errands/scene";
import type { MascotSeason } from "@/lib/mascot/season";

/** The secretary's own colour: the brand's deeper teal. */
export const SECRETARY_TONE = "color-mix(in srgb, var(--accent-2) 82%, var(--surface-2))";
/** The mark itself is drawn brighter than the tone of the desk: it has to carry a thing inside it. */
const TONE = "var(--accent-2)";

/**
 * The one-shots of the secretary's face (D-97): «есть!» on «Принял», the small things done at
 * the desk while nobody asks, the morning arrival, the director's «спасибо».
 */
export type SecretaryAct =
  | "accept"
  | "sip"
  | "headset"
  | "headsetRight"
  | "stretch"
  | "stretchSide"
  | "clock"
  | "papers"
  | "plant"
  | "arrive"
  | "thanks";

/** How long each act takes: the screen clears it after this, the one-shots of the act last exactly this. */
export const SEC_ACT_MS: Record<SecretaryAct, number> = {
  accept: 900,
  sip: 2600,
  headset: 2200,
  // the same small things another way: the other side, a stretch to the side — so a day at the
  // desk does not repeat one take
  headsetRight: 2200,
  stretch: 2400,
  stretchSide: 2400,
  clock: 2200,
  papers: 2000,
  plant: 2800,
  arrive: 2600,
  thanks: 2600,
};

/** How long the finish after «Готово» plays: the tick stands this long. */
export const FINISH_MS = 2_200;

/** What the dot is for each errand (lib/errands/scene.ts): the thing asked for. */
export const SCENE_GLYPH: Record<DeskScene, GlyphId> = {
  coffee: "cup",
  tea: "tea",
  water: "glass",
  dnd: "dnd",
  security: "shield",
  guest: "guest",
  meeting: "meeting",
  doctor: "medic",
  come: "go",
  taxi: "car",
  print: "printer",
  lunch: "lunch",
  courier: "box",
  other: "lines",
};

const ACTS: Record<SecretaryAct, ActLook> = {
  accept: { glyph: "check", glyphAnim: "bk-a-g-pop", all: "bk-a-nod" },
  sip: { glyph: "cup", glyphAnim: "bk-a-g-bob" },
  headset: { wearAnim: "bk-a-wear-fix", lookAnim: "bk-a-lookup" },
  headsetRight: { wearAnim: "bk-a-wear-fix-r", lookAnim: "bk-a-lookup" },
  stretch: { ringAnim: "bk-a-inhale", lidAnim: "bk-a-rest" },
  stretchSide: { ringAnim: "bk-a-lean", lidAnim: "bk-a-rest" },
  clock: { glyph: "clock", glyphAnim: "bk-a-g-bob" },
  papers: { glyph: "stack", glyphAnim: "bk-a-g-shuffle" },
  plant: { glyph: "plant", glyphAnim: "bk-a-g-pop", extra: "drop" },
  arrive: { all: "bk-a-hop2", glow: "waves" },
  thanks: { glyph: "heart", glyphAnim: "bk-a-g-beat", extra: "spark" },
};

const BREATH = "bk-breath 3.4s var(--ease-in-out) infinite";
const CALM = "bk-calm 4.6s var(--ease-in-out) infinite";
const RING = "bk-ring-ring 1.1s linear infinite";

/** What the three figures do for a request in a phase — the secretary's own table over the mark's language. */
function lookOf({
  scene,
  phase,
  bare,
  talking,
  urgency,
  asleep,
  still,
  cheer,
  mini,
}: {
  scene: DeskScene | null;
  phase: DeskPhase;
  bare: boolean;
  talking: boolean;
  urgency: Urgency;
  asleep: boolean;
  still: boolean;
  cheer: boolean;
  /** the small secretary beside the director's face: no headset to ring, awake and looking about at rest */
  mini: boolean;
}): StateLook {
  const party = cheer ? ({ extra: "confetti" } as const) : null;
  // the face is talking while the balls are out: no request in it
  if (talking) return { color: TONE, glow: "talk", blink: true, coreAnim: "bk-talk 0.9s var(--ease-in-out) infinite", ringAnim: CALM, ...party };
  if (bare) return { color: TONE, glow: "pulse", look: "wander", blink: true, ringAnim: BREATH, ...party };
  const alarm = scene === "security";
  if (phase === "asked" && scene) {
    // a request nobody took: the headset rings, the thing asked for hops; the longer it waits, the harder
    return {
      color: alarm || urgency === 2 ? "var(--danger)" : urgency === 1 ? "var(--warn)" : TONE,
      glyph: SCENE_GLYPH[scene],
      glow: "fast",
      all: urgency === 2 ? "bk-shake 0.3s linear infinite" : `bk-call ${urgency === 1 ? "1.3s" : "1.8s"} var(--ease-in-out) infinite`,
      ...(mini ? null : { wearAnim: RING }),
      ...(alarm ? ({ ring: "dim", comet: true } as const) : null),
      ...party,
    };
  }
  if (phase === "doing" && scene) {
    // the job: its thing in the ring, at work; the guards are called under a red light going round
    return alarm
      ? { color: "var(--danger)", ring: "dim", comet: true, glyph: "shield", glow: "fast", ...party }
      : { color: TONE, glyph: SCENE_GLYPH[scene], glow: "quiet", ringAnim: CALM, ...party };
  }
  if (phase === "done") {
    return { color: TONE, glyph: "check", glow: "pulse", ringAnim: BREATH, halo: "bk-halo-beat 3.4s var(--ease-in-out) infinite", ...party };
  }
  // at rest: at night it dozes; on a screen nobody has touched it sits still; else it is at its desk
  if (asleep) return { color: TONE, glyph: "shut", glow: "sleep", extra: "zzz", all: "bk-sleep 5.8s var(--ease-in-out) infinite", halo: "bk-sleep-halo 5.8s var(--ease-in-out) infinite" };
  if (still) return { color: TONE, glow: "quiet", ...party };
  return { color: TONE, glow: "pulse", look: mini ? "wander" : "desk", blink: true, ringAnim: BREATH, ...party };
}

/**
 * What the secretary's ring wears (D-87): a headset — a band over the top, a cup at each side, a
 * microphone on a boom — and a bow tie under it. That is the whole difference from the mascot: the
 * same mark, in the secretary's teal, dressed for the reception. `tieOnly` — the small secretary
 * beside the director's face (D-210): the bow tie alone.
 */
function Headset({ tieOnly = false }: { tieOnly?: boolean }) {
  const light = "color-mix(in srgb, currentColor 30%, #e6f2ef)";
  return (
    <svg viewBox="-80 -80 160 160" aria-hidden data-prop={tieOnly ? "tie" : "headset"}>
      {tieOnly ? null : (
        <>
          <path d="M -58 -12 A 59.5 59.5 0 0 1 58 -12" fill="none" stroke={light} strokeWidth="4.5" strokeLinecap="round" />
          <rect x="-68" y="-16" width="15" height="32" rx="7" fill={light} />
          <rect x="53" y="-16" width="15" height="32" rx="7" fill={light} />
          <path d="M 61 15 Q 64 47 38 54" fill="none" stroke={light} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="34" cy="55" r="6" fill="currentColor" stroke="var(--bg)" strokeWidth="2" />
        </>
      )}
      <path d="M 0 63 L -14 54 V 72 Z M 0 63 L 14 54 V 72 Z" fill={light} stroke={light} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="0" cy="63" r="4" fill="currentColor" stroke="var(--bg)" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * The secretary's own face (D-87, D-97, D-207): the mark of the mascot in the secretary's teal, with
 * a headset and a bow tie — the receptionist of the family. Its dot shows the director's request:
 *   rest    at the desk: eyes on the work with a glance up now and then; a small act once in a
 *           while — a sip, the headset set right, a stretch, a look at the clock, the papers
 *           squared, the plant watered; at night (outside the delivery window) it dozes
 *   asked   a request nobody took: the headset rings, the thing asked for is in the ring and the
 *           mark hops, «+N» at its shoulder for the ones behind; the longer it waits the harder it
 *           calls — faster and amber, then shaking and red
 *   doing   the job: its thing in the ring, at work — a cup steaming, a car on the road, a sheet
 *           out of the printer; the guards are called under a red light going round the ring
 *   done    after «Готово»: a tick
 * `bare` drops the request (the face is talking while the balls are out); `mini` is the small
 * secretary at the director's desk. Drawn by the mark's engine (components/brand/mark/Mark.tsx):
 * transform and opacity only, CSS keyframes.
 */
export function SecretaryMascot({
  scene,
  phase,
  size = 128,
  talking = false,
  bare = false,
  mini = false,
  act = null,
  urgency = 0,
  queue = 0,
  daypart = "day",
  look = null,
  cheer = false,
  still = false,
  season = null,
}: {
  scene: DeskScene | null;
  phase: DeskPhase;
  size?: number;
  talking?: boolean;
  bare?: boolean;
  /** the small secretary beside the director's face (D-210): no headset — the bow tie alone; its own request only, no small acts */
  mini?: boolean;
  act?: SecretaryAct | null;
  urgency?: Urgency;
  queue?: number;
  daypart?: Daypart;
  /** where the pupil goes and holds, −1..1 on each axis (the desk turned to the director's face) */
  look?: { x: number; y: number } | null;
  /** a quick job was just closed — confetti (the caller asks only after the D-40 gate) */
  cheer?: boolean;
  /**
   * The deep rest of a screen nobody has touched for minutes (D-119): the secretary sits still —
   * no waves, no glances. Anything asked of the secretary ends it.
   */
  still?: boolean;
  /** a holiday of the company's calendar to dress for (D-119) — over the headset band */
  season?: MascotSeason | null;
  /** kept for the screens that asked for the room of a job: the mark has no room, the thing is in the ring */
  room?: boolean;
}) {
  const rest = !bare && phase === "rest";
  const asleep = rest && daypart === "night";
  // an avatar plays no acts; neither does a sleeper
  const doing = size < LITE_PX || asleep ? null : act;
  const state = bare ? (talking ? "talking" : "bare") : asleep ? "asleep" : phase;
  const waiting = !bare && phase === "asked" && queue > 0;
  return (
    <Mark
      kind="secretary"
      state={state}
      act={doing}
      size={size}
      look={lookOf({ scene, phase, bare, talking, urgency, asleep, still, cheer, mini })}
      part={doing ? ACTS[doing] : null}
      ms={doing ? SEC_ACT_MS[doing] : 0}
      gaze={look}
      season={season}
      wear={<Headset tieOnly={mini} />}
      badge={waiting ? <span className="nums">+{queue}</span> : null}
    />
  );
}
