import type { CSSProperties, ReactNode } from "react";

import { CONFETTI } from "@/components/brand/confetti";
import { SeasonWear } from "@/components/brand/MascotSeason";
import { Bit } from "@/components/brand/mark/glyphs";
import { GlyphSwap } from "@/components/brand/mark/GlyphSwap";
import { ACT_LOOK, FULL_PX, LITE_PX, STATE_LOOK } from "@/components/brand/mark/look";
import type { MascotSeason } from "@/lib/mascot/season";

/**
 * The mascot of the product (D-205, docs/DESIGN.md §3): a dot inside a ring, light and waves round
 * the ring. The director's, the employee's and the wall's face. Three figures and nothing else: the
 * dot is a pupil — it looks about, blinks, looks where the screen tells it; the ring breathes, opens
 * into three arcs, turns; the light pulses, takes the voice, throws a wave. A thing of the product
 * is never held beside the mark: the dot turns into it — a card, an envelope, a cup, a medal — and
 * back. Each state is its own choreography, read at a glance without a caption:
 *   calm         the pulse: two beats and two waves, a look about, a blink
 *   listening    the ring opens into three arcs, the dot is three bars of the voice, a wave trembles round
 *   saving       the recording is put away: a note sinks into the ring
 *   transcribing the voice becomes text: three lines written one by one, a comet runs the ring
 *   parsing      the text is sorted: the arcs step round by thirds, three dots take turns
 *   sending      the dot is thrown up, the ring kicks back, one strong wave; a new dot grows
 *   offering     parsed and waiting for the tap: an arrow up, the mark presses itself like a button
 *   thinking     pondering, loading, «не разобрал»: the arcs drift, three dots
 *   speaking     the dot beats with the words, a small wave goes with each (D-49)
 *   happy        gold, the eye smiles, sparks
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
  | "wipe"
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

/** How long each act takes: the screen clears it after this, the one-shots of the act last exactly this. */
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

/**
 * The mark is drawn once, in a 240-box, and scaled to the size asked for: one transform, not a new
 * drawing. The ring's outer width in that drawing, and the share of the screen's box it takes — what
 * the blob of «Капля» took.
 */
const RING = 107;
const FILL = 0.84;

/** A third of the ring, at the top; the other two are this one turned. Round ends, radius 50. */
const ARC = "M -43.301 -25 A 50 50 0 0 1 43.301 -25";
/** A rim light on the ring's upper left, along its outer edge — the side the dot's glint is on. */
const SHINE = "M -46.49 -21.68 A 51.3 51.3 0 0 1 -19.22 -47.56";

/** A ring that waves: two of them turning against each other read as a trembling wave. */
const WAVY = (() => {
  const lobes = 14;
  const points = 224;
  let d = "";
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = 86 + 2.6 * Math.sin(angle * lobes);
    d += `${i === 0 ? "M" : "L"}${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`;
  }
  return `${d}Z`;
})();

/**
 * The three pills of the dot: where each stands in a row, how tall it is as a silent bar, how long
 * as a line of text (the last one is short and starts at the same left edge), how much of the
 * voice it takes and how late — the side bars follow the middle one.
 */
const PILLS = [
  { i: -1, rest: 14, len: 150, lx: "0px", voice: 0.68, lag: "160ms" },
  { i: 0, rest: 26, len: 150, lx: "0px", voice: 1, lag: "90ms" },
  { i: 1, rest: 14, len: 86, lx: "-7px", voice: 0.68, lag: "160ms" },
];

/** The looks of the pupil a state names. */
const LOOKS = {
  wander: "bk-wander 13s var(--ease-out) infinite",
  sweep: "bk-sweep 4.6s var(--ease-in-out) infinite",
  follow: "bk-follow 1.15s linear infinite",
};
const BLINK = "bk-blink 7.3s linear infinite";

/** Sparks of a happy face: where each stands round the ring and when it lights. */
const SPARKS = [
  { x: -68, y: -40, delay: "0s" },
  { x: 70, y: -22, delay: "0.8s" },
  { x: 48, y: 62, delay: "1.6s" },
];
/** The dust of a card taken back. */
const PUFFS = [
  { x: -46, y: -30 },
  { x: 44, y: -34 },
  { x: -52, y: 22 },
  { x: 50, y: 26 },
  { x: 0, y: -54 },
];

const at = (x: number, y: number) => ({ "--x": `${x}px`, "--y": `${y}px` }) as CSSProperties;

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
}) {
  const tier = size < LITE_PX ? "lite" : size < FULL_PX ? "mid" : "full";
  const look = STATE_LOOK[state];
  // an avatar plays no acts and wears nothing: it only tells the state
  const doing = tier === "lite" ? null : act;
  const part = doing ? ACT_LOOK[doing] : null;
  const once = (name: string | undefined, easing = "var(--ease-in-out)") => (doing && name ? `${name} ${ACT_MS[doing]}ms ${easing} both` : undefined);

  const glyph = part?.glyph ?? look.glyph ?? null;
  const ring = part?.ring ?? look.ring ?? "whole";
  const lookAnim = once(part?.lookAnim) ?? (gaze || !look.look ? undefined : LOOKS[look.look]);
  const lidAnim = once(part?.lidAnim) ?? (look.blink ? BLINK : undefined);
  const clamped = Math.min(1, Math.max(0, level));

  const root = { width: size, height: size, color: part?.color ?? look.color } as CSSProperties;
  const mark = {
    transform: `scale(${((size * FILL) / RING).toFixed(4)})`,
    // an ancestor may paint the voice itself (the lever does, 20 times a second): a prop of zero must not hide it
    ...(clamped > 0 ? { "--mascot-level": clamped.toFixed(3) } : null),
    ...(gaze ? { "--bk-gx": gaze.x.toFixed(3), "--bk-gy": gaze.y.toFixed(3) } : null),
    ...(look.wave ? { "--bk-wave": look.wave } : null),
  } as CSSProperties;

  return (
    <span className="mascot" data-state={state} data-act={doing ?? undefined} aria-hidden style={root}>
      <span
        className="bk"
        data-tier={tier}
        data-ring={ring}
        data-core={look.core ?? "dot"}
        data-glow={look.glow ?? "quiet"}
        data-spin={look.spin}
        data-comet={look.comet ? "" : undefined}
        data-glyph={glyph ?? undefined}
        data-act-glow={part?.glow}
        data-gaze={gaze ? "" : undefined}
        style={mark}
      >
        <Part className="bk-all" anim={look.all}>
          <Part className="bk-all-act" anim={once(part?.all)}>
            <span className="bk-p bk-halos">
              <span className="bk-p bk-halo" style={look.halo ? { animation: look.halo } : undefined} />
              <span className="bk-p bk-aura" />
            </span>
            <span className="bk-p bk-waves">
              <span className="bk-p bk-wave bk-wave-1" />
              <span className="bk-p bk-wave bk-wave-2" />
              <span className="bk-p bk-inwave" />
              <span className="bk-p bk-burst" />
              <span className="bk-p bk-awave" />
              <span className="bk-p bk-aburst" />
              <span className="bk-p bk-echo" />
              <span className="bk-p bk-wavy-wrap">
                <span className="bk-p bk-wavy bk-wavy-a">
                  <Wavy />
                </span>
                <span className="bk-p bk-wavy bk-wavy-b">
                  <Wavy />
                </span>
              </span>
            </span>

            <span className="bk-p bk-ring">
              <span className="bk-p bk-ring-gaze">
                <Part className="bk-ring-act" anim={once(part?.ringAnim)}>
                  <Part className="bk-ring-live" anim={look.ringAnim}>
                    <span className="bk-p bk-glow" />
                    <span className="bk-p bk-iris">
                      <svg viewBox="-60 -60 120 120" aria-hidden>
                        <circle r="38.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.6 6.463" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="bk-p bk-arcs">
                      <span className="bk-p bk-spin-step">
                        <span className="bk-p bk-spin-drift">
                          <span className="bk-p bk-spin-fast">
                            {[0, 120, 240].map((turn) => (
                              <span key={turn} className="bk-p" style={{ transform: `rotate(${turn}deg)` }}>
                                <span className="bk-p bk-arc-split">
                                  <span className="bk-p bk-arc-level">
                                    <svg viewBox="-60 -60 120 120" aria-hidden>
                                      <path d={ARC} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
                                    </svg>
                                  </span>
                                </span>
                              </span>
                            ))}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="bk-p bk-shine">
                      <svg viewBox="-60 -60 120 120" aria-hidden>
                        <path d={SHINE} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="bk-p bk-comet" />
                  </Part>
                </Part>
              </span>
            </span>

            {/* the holiday on the ring (D-119), drawn in the 64-box «Капля» had: its crown is the ring's top */}
            {season && tier !== "lite" ? (
              <span className="bk-p bk-wear">
                <svg viewBox="0 0 64 64" width="127" height="127" aria-hidden>
                  <SeasonWear season={season} />
                </svg>
              </span>
            ) : null}

            <span className="bk-p bk-ghost bk-ghost-2" />
            <span className="bk-p bk-ghost bk-ghost-1" />

            <Part className="bk-core" anim={look.coreAnim}>
              <Part className="bk-look" anim={lookAnim}>
                <span className="bk-p bk-gaze">
                  <span className="bk-p bk-dot">
                    <Part className="bk-dot-act" anim={once(part?.coreAnim)}>
                      <Part className="bk-blink" anim={lidAnim}>
                        {PILLS.map((pill) => (
                          <span
                            key={pill.i}
                            className="bk-p bk-pill"
                            style={
                              {
                                "--i": pill.i,
                                "--b": pill.rest,
                                "--len": pill.len,
                                "--lx": pill.lx,
                                "--bk-lv": pill.voice === 1 ? "var(--mascot-level, 0)" : `calc(var(--mascot-level, 0) * ${pill.voice})`,
                                "--bk-lag": pill.lag,
                              } as CSSProperties
                            }
                          >
                            <span className="bk-p bk-pill-hop">
                              <i className="bk-p bk-cap bk-cap-a" />
                              <i className="bk-body" />
                              <i className="bk-p bk-cap bk-cap-b" />
                            </span>
                          </span>
                        ))}
                        <span className="bk-p bk-shade">
                          <i className="bk-glint" />
                        </span>
                      </Part>
                    </Part>
                  </span>
                  <GlyphSwap id={glyph} count={carry?.count ?? 1} hot={carry?.hot ?? false} anim={once(part?.glyphAnim)} />
                </span>
              </Part>
            </Part>

            {tier === "lite" ? null : (
              <>
                {look.extra === "zzz" ? (
                  <>
                    <span className="bk-bit bk-z">
                      <Bit id="z" />
                    </span>
                    <span className="bk-bit bk-z bk-z-2">
                      <Bit id="z" />
                    </span>
                  </>
                ) : null}
                {look.extra === "sparks"
                  ? SPARKS.map((spark) => (
                      <span key={spark.delay} className="bk-bit bk-spark" style={{ ...at(spark.x, spark.y), animationDelay: spark.delay }}>
                        <Bit id="spark" />
                      </span>
                    ))
                  : null}
                {look.extra === "light" ? <span className="bk-light" data-prop="light" /> : null}
                {look.extra === "confetti"
                  ? CONFETTI.map((bit, n) => (
                      <span
                        key={n}
                        className="bk-confetto"
                        style={{ ...at(bit.x * 3.4, bit.y * 3.4 - 26), "--r": `${bit.r}deg`, background: bit.color, borderRadius: bit.round ? "50%" : undefined, animationDelay: `${(n % 5) * 0.07}s` } as CSSProperties}
                      />
                    ))
                  : null}

                {part?.extra === "spark" ? (
                  <span className="bk-bit" style={{ ...at(44, -50), animation: once("bk-a-spark") }}>
                    <Bit id="spark" />
                  </span>
                ) : null}
                {part?.extra === "tunes" ? (
                  <>
                    <span className="bk-bit" style={{ animation: once("bk-a-tune") }}>
                      <Bit id="tune" />
                    </span>
                    <span className="bk-bit" style={{ animation: once("bk-a-tune2") }}>
                      <Bit id="tune" />
                    </span>
                  </>
                ) : null}
                {part?.extra === "drop" ? (
                  <span className="bk-bit" style={{ animation: once("bk-a-drop") }}>
                    <Bit id="drop" />
                  </span>
                ) : null}
                {part?.extra === "bubble" ? <span className="bk-bubble" style={{ animation: once("bk-a-bubble") }} /> : null}
                {part?.extra === "moon" ? (
                  <span className="bk-p bk-moon-path" style={{ animation: once("bk-a-moon", "linear") }}>
                    <i className="bk-moon" />
                  </span>
                ) : null}
                {part?.extra === "dust" ? PUFFS.map((puff) => <span key={`${puff.x}${puff.y}`} className="bk-puff" style={{ ...at(puff.x, puff.y), animation: once("bk-a-dust") }} />) : null}
              </>
            )}
          </Part>
        </Part>
      </span>
    </span>
  );
}

/** A part of the mark that may carry a motion of its own: a loop of the state, a one-shot of an act. */
function Part({ className, anim, children }: { className: string; anim?: string; children: ReactNode }) {
  return (
    <span className={`bk-p ${className}`} style={anim ? { animation: anim } : undefined}>
      {children}
    </span>
  );
}

function Wavy() {
  return (
    <svg viewBox="-100 -100 200 200" width="200" height="200" aria-hidden>
      <path d={WAVY} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
