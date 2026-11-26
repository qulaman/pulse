import type { CSSProperties, ReactNode } from "react";

import { CONFETTI } from "@/components/brand/confetti";
import { SeasonWear } from "@/components/brand/MascotSeason";
import type { MascotSeason } from "@/lib/mascot/season";

import { Bit } from "./glyphs";
import { GlyphSwap } from "./GlyphSwap";
import { FULL_PX, LITE_PX, type ActLook, type StateLook } from "./look";

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
  desk: "bk-desk-look 7s var(--ease-in-out) infinite",
  ponder: "bk-ponder 5.6s var(--ease-in-out) infinite",
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

/**
 * The drawing of the mark (D-205): a dot inside a ring, light and waves round the ring — the one
 * engine under the mascot (components/brand/Mascot.tsx) and the secretary
 * (components/secretary/SecretaryMascot.tsx). It knows nothing of states: it is handed a look (what
 * the three figures do, `look.ts`) and, for the length of an act, the act's part over it.
 *
 * Drawn by the server; the one client part swaps the thing the dot has turned into. Motion —
 * `mark.css`, on `transform` and `opacity` only.
 */
export function Mark({
  kind = "mascot",
  state,
  act = null,
  size,
  look,
  part = null,
  ms = 0,
  level = 0,
  gaze = null,
  count = 1,
  hot = false,
  season = null,
  wear = null,
  badge = null,
}: {
  /** whose mark: the class the screens and the smokes find it by */
  kind?: "mascot" | "secretary";
  /** the names of what it is doing, for `data-state` and `data-act` */
  state: string;
  act?: string | null;
  size: number;
  look: StateLook;
  /** an act over the look, and how long it lasts */
  part?: ActLook | null;
  ms?: number;
  level?: number;
  gaze?: { x: number; y: number } | null;
  /** the stack the dot is: how many cards, and whether one is due */
  count?: number;
  hot?: boolean;
  season?: MascotSeason | null;
  /** what the ring wears and carries with it: the secretary's headset */
  wear?: ReactNode;
  /** a small sign at the ring's shoulder: «+2» more requests waiting */
  badge?: ReactNode;
}) {
  const tier = size < LITE_PX ? "lite" : size < FULL_PX ? "mid" : "full";
  const once = (name: string | undefined, easing = "var(--ease-in-out)") => (part && name ? `${name} ${ms}ms ${easing} both` : undefined);

  const glyph = part?.glyph ?? look.glyph ?? null;
  const ring = part?.ring ?? look.ring ?? "whole";
  const lookAnim = once(part?.lookAnim) ?? (gaze || !look.look ? undefined : LOOKS[look.look]);
  const lidAnim = once(part?.lidAnim) ?? (look.blink ? BLINK : undefined);
  // The dot is hidden while it is a thing: an act of the lid or of the dot alone — a wink, a sigh, a
  // thump — plays on the thing then, or nobody would see it
  const thingAnim = once(part?.glyphAnim) ?? (glyph ? (once(part?.lidAnim) ?? once(part?.coreAnim)) : undefined) ?? look.glyphAnim;
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
    <span className={kind === "mascot" ? "mascot" : "mascot secretary-mascot"} data-state={state} data-act={act ?? undefined} aria-hidden style={root}>
      <span
        className="bk"
        data-tier={tier}
        data-ring={ring}
        data-core={look.core ?? "dot"}
        data-glow={look.glow ?? "quiet"}
        data-spin={look.spin}
        data-comet={look.comet || part?.comet ? "" : undefined}
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
                    {wear ? (
                      <Part className="bk-wear-own" anim={once(part?.wearAnim) ?? look.wearAnim}>
                        {wear}
                      </Part>
                    ) : null}
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
                    <Part className="bk-dot-act" anim={once(part?.coreAnim) ?? look.dotAnim}>
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
                  <GlyphSwap id={glyph} count={count} hot={hot} anim={thingAnim} leaves={part?.leaves === true} />
                </span>
              </Part>
            </Part>

            {badge && tier !== "lite" ? <span className="bk-badge">{badge}</span> : null}

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
