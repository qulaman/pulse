import type { ReactNode } from "react";

import { Blend, EYE_BLEND, SETTLE_LEAD } from "@/components/brand/Blend";
import type { MascotAct, MascotState } from "@/components/brand/Mascot";
import { DRAG, LOOK_EASE, SETTLE, type MascotPose } from "@/lib/mascot/pose";

/** What the eyes run while reading: a left and a right column of a terminal. */
const GLYPHS_LEFT = ["0", "1", "{", "<"];
const GLYPHS_RIGHT = ["1", "0", "}", ">"];
/** One glyph holds for a quarter of the roll; the rolls fill the reading beat. */
const GLYPH_STEP = 0.055;
const GLYPH_ROLLS = 4;

/**
 * The eye's drawn geometry; every state is a scale away from it (never a new rx/ry).
 * This pair is the whole expressiveness dial of the face: a wide-open eye carries the
 * mood, a small one reads as a dot. ~20% of the figure: the face carries expression at a
 * glance, and at avatar sizes the eyes are still eyes (DESIGN §3 asks for ≥12% at ≤28px).
 */
const EYE_RX = 6.6;
const EYE_RY = 7;

/**
 * A motion group of a face big enough to be watched carries its pose across a change (Blend): a state
 * turned, an act started or cut, a look taken. An avatar has no mid-pose worth carrying and pays for
 * no wrappers.
 */
export function Carry({ on, k, origin, eyes = false, mirrored, children }: { on: boolean; k: string; origin: string; eyes?: boolean; mirrored?: boolean; children: ReactNode }) {
  return on ? (
    <Blend k={k} origin={origin} timing={eyes ? EYE_BLEND : undefined} lead={k === SETTLE ? SETTLE_LEAD : undefined} mirrored={mirrored}>
      {children}
    </Blend>
  ) : (
    <>{children}</>
  );
}

/**
 * The eyes and the mouths of the assistant's face: the held look, the drag behind the body, the
 * state's own look, an act's look, the lids, the reading glyphs and every mouth a state or an act
 * puts on. Drawn over the body and its props.
 */
export function MascotFace({ state, act, pose, side }: { state: MascotState; act: MascotAct | null; pose: MascotPose; side: string | undefined }) {
  const {
    actGaze,
    actSmile,
    blink,
    content,
    detailed,
    eyeLoop,
    eyeShape,
    flatMouth,
    flip,
    gazeBlink,
    gazeKey,
    gazeShift,
    lids,
    reading,
    shouting,
    squint,
    talking,
  } = pose;
  return (
    <g style={{ transform: gazeShift, transition: LOOK_EASE }}>
    <g style={{ transformOrigin: "32px 33px", animation: DRAG[state] ?? "none" }}>
      {/* the state's own look; off for a held look — the eyes leave it quickly, not in one frame */}
      <Carry on={detailed} k={eyeLoop} origin="32px 33px" eyes>
      <g fill="var(--bg)" style={{ transformOrigin: "32px 33px", animation: eyeLoop }}>
        {/* where an act sends the gaze, over the state's own look — to the other side with
            an act drawn there; the eyes and the mouth themselves are mirrored back */}
        <g transform={side}>
        <Carry on={detailed} k={actGaze} origin="32px 33px" eyes mirrored={flip}>
        <g data-front style={{ transformOrigin: "32px 33px", animation: actGaze }}>
        <g transform={side}>
          {/* The eye keeps one geometry and changes shape by transform: animating rx/ry
              would re-run layout and paint of the SVG on every frame of the change. */}
          <g key={`l-${gazeKey}`} style={{ transformOrigin: "24px 33px", animation: gazeBlink }}>
          <g style={{ transformOrigin: "24px 33px", animation: blink }}>
            <Carry on={detailed} k={lids?.[0] ?? "none"} origin="24px 33px" eyes>
            <g style={{ transformOrigin: "24px 33px", animation: lids?.[0] ?? "none" }}>
              <g style={{ transformOrigin: "24px 33px", transform: eyeShape, transition: "transform 120ms var(--ease-out)" }}>
                <ellipse cx="24" cy="33" rx={EYE_RX} ry={EYE_RY} style={{ animation: reading ? "mascot-eye-return 1.9s both" : undefined }} />
              </g>
            </g>
            </Carry>
          </g>
          </g>
          {/* both lids on one animation, no offset: a face blinks with both eyes at once */}
          <g key={`r-${gazeKey}`} style={{ transformOrigin: "40px 33px", animation: gazeBlink }}>
          <g style={{ transformOrigin: "40px 33px", animation: blink }}>
            <Carry on={detailed} k={lids?.[1] ?? "none"} origin="40px 33px" eyes>
            <g style={{ transformOrigin: "40px 33px", animation: lids?.[1] ?? "none" }}>
              <g style={{ transformOrigin: "40px 33px", transform: eyeShape, transition: "transform 120ms var(--ease-out)" }}>
                <ellipse cx="40" cy="33" rx={EYE_RX} ry={EYE_RY} style={{ animation: reading ? "mascot-eye-return 1.9s both" : undefined }} />
              </g>
            </g>
            </Carry>
          </g>
          </g>
          {reading ? (
            // the eyes run glyphs: each holds its quarter of the roll and cuts to the next,
            // the way a terminal does — the right column is half a step behind the left
            <g
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fontWeight="700"
              fontSize="13"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {GLYPHS_LEFT.map((glyph, index) => (
                <text
                  key={`l-${glyph}`}
                  x="24"
                  y="33.5"
                  style={{ opacity: 0, animation: `mascot-glyph ${(GLYPH_STEP * 4).toFixed(2)}s ${(index * GLYPH_STEP).toFixed(2)}s ${GLYPH_ROLLS} forwards` }}
                >
                  {glyph}
                </text>
              ))}
              {GLYPHS_RIGHT.map((glyph, index) => (
                <text
                  key={`r-${glyph}`}
                  x="40"
                  y="33.5"
                  style={{ opacity: 0, animation: `mascot-glyph ${(GLYPH_STEP * 4).toFixed(2)}s ${(GLYPH_STEP / 2 + index * GLYPH_STEP).toFixed(3)}s ${GLYPH_ROLLS} forwards` }}
                >
                  {glyph}
                </text>
              ))}
            </g>
          ) : null}
          {squint || content ? (
            // a tiny smile when happy, celebrating or carrying a cup — no mouth in every other state
            <path d="M26 43 Q32 48 38 43" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
          ) : null}
          {talking ? (
            // speaking: the mouth opens and closes in the rhythm of a phrase (scale only)
            <ellipse
              cx="32"
              cy="45"
              rx="4.2"
              ry="3"
              style={{ transformOrigin: "32px 45px", animation: "mascot-mouth 0.9s ease-in-out infinite" }}
            />
          ) : null}
          {state === "chatting" ? (
            // shut while the other side types, moving while it answers
            <ellipse cx="32" cy="45" rx="3.6" ry="2.7" style={{ transformOrigin: "32px 45px", animation: "mascot-chat-mouth 3.2s ease-in-out infinite" }} />
          ) : null}
          {shouting ? (
            // the shout into the megaphone: a round mouth that opens on the beat
            <ellipse cx="34.5" cy="47" rx="3.2" ry="3.4" style={{ transformOrigin: "34.5px 47px", animation: "mascot-shout-mouth 1.4s ease-in-out infinite" }} />
          ) : null}
          {/* the mouths of the acts: a yawn, a sleepy mumble, a whistle, a dreamy smile */}
          {act === "yawn" ? (
            <ellipse cx="32" cy="46" rx="3.6" ry="4.6" style={{ transformOrigin: "32px 44px", animation: "mascot-act-yawn-mouth 2.2s ease-in-out both" }} />
          ) : null}
          {act === "mumble" ? (
            <ellipse cx="32" cy="45.5" rx="2.6" ry="2" style={{ transformOrigin: "32px 45.5px", animation: "mascot-act-mumble-mouth 2.6s ease-in-out both" }} />
          ) : null}
          {act === "whistle" ? (
            <ellipse cx="34.5" cy="45.5" rx="1.9" ry="2.2" style={{ transformOrigin: "34.5px 45.5px", animation: "mascot-act-pucker 2.8s ease-in-out both" }} />
          ) : null}
          {actSmile && !squint && !content ? (
            <path
              d="M27 44 Q32 48.5 37 44"
              fill="none"
              stroke="var(--bg)"
              strokeWidth="2.1"
              strokeLinecap="round"
              style={{ transformOrigin: "32px 46px", animation: actSmile }}
            />
          ) : null}
          {/* the work's own mouths (D-110): a flat «эх» for a no or a card taken back,
              a round «фух» when the deadline moves away */}
          {flatMouth && !squint && !content ? (
            <path d="M27.6 45.6 Q32 44.4 36.4 45.6" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: "32px 45px", animation: flatMouth }} />
          ) : null}
          {act === "relief" ? (
            <ellipse cx="32" cy="46" rx="2.2" ry="2.6" style={{ transformOrigin: "32px 46px", animation: "mascot-act-phew 1.8s ease-in-out both" }} />
          ) : null}
        </g>
        </g>
        </Carry>
        </g>
      </g>
      </Carry>
    </g>
    </g>
  );
}
