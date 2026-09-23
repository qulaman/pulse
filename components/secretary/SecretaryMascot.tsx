import type { CSSProperties, ReactNode } from "react";

import type { DeskPhase, DeskScene } from "@/lib/errands/scene";

import "./secretary-mascot.css";

/**
 * The secretary's colour: the brand's deeper teal, the one the small face at the director's
 * desk wears (D-86) — another character of the same family, never a status colour (DESIGN §1.3).
 */
export const SECRETARY_TONE = "color-mix(in srgb, var(--accent-2) 82%, var(--surface-2))";

/** The headset and the bow tie: dark on the teal body, so the character reads at a glance. */
const GEAR = "color-mix(in srgb, var(--bg) 72%, var(--surface-2))";
const EDGE = "color-mix(in srgb, var(--border) 70%, var(--text-muted))";
const COFFEE = "color-mix(in srgb, var(--gold) 36%, #3b2415)";
const TEA = "color-mix(in srgb, var(--gold) 70%, #8a3d10)";
/** A hand held in front of the body: the body's colour, a shade lighter and outlined. */
const HAND = "color-mix(in srgb, var(--accent-2) 70%, white 12%)";

const EYE_RX = 6.6;
const EYE_RY = 7;
const LOOK_EASE = "transform 420ms cubic-bezier(0.34, 1.45, 0.64, 1)";
const SHAPE_EASE = "transform 160ms var(--ease-out)";
const PROP_IN = "smc-env-in 0.45s cubic-bezier(0.34, 1.3, 0.64, 1) both";

type Look = { x: number; y: number; loop?: string };

/** Where the eyes are while the job runs: on the machine, on the cup, on the door, on you. */
const LOOK: Record<DeskScene, Look> = {
  coffee: { x: -3.4, y: -0.6 },
  tea: { x: -3, y: 1.6 },
  dnd: { x: 1.2, y: 0.2 },
  guest: { x: 0, y: 0, loop: "smc-guest-look 4.2s ease-in-out infinite" },
  doctor: { x: 1.4, y: -0.6 },
  come: { x: -3.2, y: 0 },
  other: { x: 2.2, y: 2.2 },
};

/** The body's own motion under each job. */
const BODY: Record<DeskScene, string> = {
  coffee: "mascot-serve 3.2s ease-in-out infinite",
  tea: "smc-pour-body 3.2s ease-in-out infinite",
  dnd: "smc-guard 4.2s ease-in-out infinite",
  guest: "smc-invite 4.2s ease-in-out infinite",
  doctor: "mascot-talk 1.1s ease-in-out infinite",
  come: "smc-walk 0.56s ease-in-out infinite",
  other: "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
};

/**
 * The secretary's own face (D-87): the same soft blob as «Капля», in the secretary's deeper
 * teal, with a headset and a bow tie — the receptionist of the family. Its body shows the
 * director's request in hand, so the person at the desk reads the job without a caption:
 *   rest    nobody asks: typing at a laptop, a look up now and then
 *   asked   a request nobody took: the headset rings, the face hops, the request floats
 *           over the head as a picture (a cup, a teapot, the sign, a door)
 *   doing   the job — coffee: a finger on the machine, the stream, steam off the cup;
 *           tea: the pot tips over the cup; dnd: the «не беспокоить» sign held up, a finger
 *           on the lips, «тсс»; guest: the door opens, the guest steps in, a bow with the
 *           hand out; doctor: a call on the headset; come: off to the director with a
 *           notepad; other: a note is taken
 *   done    the cheer after «Готово»: a squint, a smile, a tick over the head
 * `bare` drops the room and the job (the face is talking while the balls are out).
 * Perf contract of the mascot: one SVG, transform and opacity only, CSS keyframes
 * (./secretary-mascot.css and app/globals.css).
 */
export function SecretaryMascot({
  scene,
  phase,
  size = 128,
  talking = false,
  bare = false,
}: {
  scene: DeskScene | null;
  phase: DeskPhase;
  size?: number;
  talking?: boolean;
  bare?: boolean;
}) {
  // below avatar size the room and the props are noise: the body and the headset still read
  const detailed = size >= 40;
  const job: DeskScene | null = !bare && phase === "doing" ? scene : null;
  const asked = !bare && phase === "asked";
  const done = !bare && phase === "done";
  const rest = !bare && phase === "rest";
  const show = (what: DeskScene) => detailed && job === what;

  const look: Look = bare || talking ? { x: 0, y: 0 } : rest ? { x: 0, y: 2.6, loop: "smc-type-look 7s ease-in-out infinite" } : job ? LOOK[job] : { x: 0, y: 0 };
  // how the eye is open: wide on a call, soft on the door, a squint of joy after «Готово»
  const eye = done ? "scale(0.85, 0.42)" : asked ? "scale(1.1, 1.14)" : job === "dnd" ? "scale(0.95, 0.6)" : "scale(1, 1)";
  const blink = done ? "none" : "mascot-blink 9.2s infinite";
  const body = talking ? "mascot-talk 1.1s ease-in-out infinite" : asked ? "mascot-call 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite" : done ? "mascot-happy 3.8s cubic-bezier(0.45, 0, 0.55, 1) infinite" : job ? BODY[job] : rest ? "smc-type 0.84s ease-in-out infinite" : "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite";
  const lightTone = asked ? "var(--warn)" : talking || job === "doctor" ? "var(--ok)" : "var(--accent)";
  const lightLoop = asked ? "smc-light 0.6s steps(1) infinite" : talking || job === "doctor" ? "smc-light 1.1s steps(1) infinite" : "smc-glow 3.4s ease-in-out infinite";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      data-secretary
      data-scene={scene ?? "none"}
      data-phase={bare ? "bare" : phase}
      style={{ overflow: "visible", display: "block" }}
    >
      <ellipse cx="32" cy="61" rx="16" ry="2.5" fill="var(--bg)" opacity="0.5" />

      {/* ---- the room behind the body ---- */}
      {show("coffee") ? <CoffeeMachine /> : null}
      {show("guest") ? <Door /> : null}
      {show("tea") ? <TeaCup /> : null}
      {show("dnd") ? <Sign /> : null}

      {/* asked: the headset rings — arcs go out of the left ear */}
      {asked && detailed ? (
        <g fill="none" stroke="var(--warn)" strokeWidth="1.4" strokeLinecap="round">
          {["M0 25.5 Q-3.5 31 0 36.5", "M-4.2 22 Q-9.4 31 -4.2 40"].map((d, i) => (
            <path key={d} d={d} style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: `smc-ring 1.2s ease-out ${i * 0.3}s infinite`, opacity: 0 }} />
          ))}
        </g>
      ) : null}

      {/* the body: every motion rides this group, the props in hand ride with it */}
      <g style={{ transformOrigin: "32px 52px", animation: asked ? "mascot-settle 0.22s cubic-bezier(0.16, 1, 0.3, 1) both" : "none" }}>
        <g key={`${bare ? "bare" : phase}-${job ?? ""}`} style={{ transformOrigin: "32px 44px", animation: body }}>
          {/* arms drawn before the body, so the body covers their roots */}
          {show("coffee") ? (
            <g style={{ animation: "smc-press 2.6s ease-in-out infinite" }}>
              <path d="M10 35 Q2 28 -3.5 24" fill="none" stroke={SECRETARY_TONE} strokeWidth="5" strokeLinecap="round" />
              <ellipse cx="-5.5" cy="23" rx="3.6" ry="3" fill={SECRETARY_TONE} />
            </g>
          ) : null}
          {show("tea") ? <Arm d="M10 38 Q3 34 -1 31" /> : null}
          {show("dnd") ? <Arm d="M52 41 Q60 39 63 31.5" /> : null}
          {show("guest") ? <Arm d="M10 41 Q4 45 -1 43.5" hand={{ cx: -2.8, cy: 43, rx: 3.6, ry: 2.6 }} /> : null}

          <path d="M32 4 C47 4 59 16 59 31 C59 47 47 60 32 60 C17 60 5 49 5 33 C5 18 17 4 32 4 Z" fill={SECRETARY_TONE} />
          <ellipse cx="24" cy="18" rx="9" ry="5" fill="#ffffff" opacity="0.14" />

          {/* the bow tie: the receptionist's sign, under the chin */}
          <g fill={GEAR}>
            <path d="M32 54.5 L25.6 51.2 Q24.6 54.5 25.6 57.8 Z" />
            <path d="M32 54.5 L38.4 51.2 Q39.4 54.5 38.4 57.8 Z" />
            <rect x="30.2" y="52.7" width="3.6" height="3.6" rx="1.2" />
          </g>

          {/* the headset: a band over the crown, two cups, the boom down to the mouth */}
          <path d="M8.6 29 C8.6 14.5 19 6.8 32 6.8 C45 6.8 55.4 14.5 55.4 29" fill="none" stroke={GEAR} strokeWidth="2.6" strokeLinecap="round" />
          <rect x="2.6" y="24.5" width="8" height="13" rx="3.4" fill={GEAR} stroke={EDGE} strokeWidth="0.7" />
          <rect x="53.4" y="24.5" width="8" height="13" rx="3.4" fill={GEAR} stroke={EDGE} strokeWidth="0.7" />
          <path d="M6.6 36.5 C7.6 45.5 13 49.6 21.5 49.2" fill="none" stroke={GEAR} strokeWidth="1.7" strokeLinecap="round" />
          <ellipse cx="23.2" cy="49.1" rx="2.6" ry="2" fill={GEAR} />
          <circle cx="6.6" cy="29" r="1.25" fill={lightTone} style={{ animation: lightLoop }} />

          {done ? (
            <g fill="#ffffff" opacity="0.22">
              <ellipse cx="16" cy="41" rx="4" ry="2" />
              <ellipse cx="48" cy="41" rx="4" ry="2" />
            </g>
          ) : null}

          {/* the eyes: one geometry, reshaped and moved by transform only */}
          <g style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: LOOK_EASE }}>
            <g style={{ transformOrigin: "32px 33px", animation: look.loop ?? "none" }}>
              <g fill="var(--bg)">
                {[24, 40].map((cx) => (
                  <g key={cx} style={{ transformOrigin: `${cx}px 33px`, animation: blink }}>
                    <g style={{ transformOrigin: `${cx}px 33px`, transform: eye, transition: SHAPE_EASE }}>
                      <ellipse cx={cx} cy="33" rx={EYE_RX} ry={EYE_RY} />
                      {/* a gleam in each eye: the secretary's own mark, and the eyes stay lively
                          instead of reading as two dark holes */}
                      {done ? null : <circle cx={cx + 2.3} cy="30.2" r="1.8" fill="#ffffff" opacity="0.92" />}
                    </g>
                  </g>
                ))}
              </g>
            </g>
          </g>

          <Mouth talking={talking || job === "doctor"} asked={asked} done={done} job={job} />

          {/* ---- what is held in front of the body ---- */}
          {show("dnd") ? <Hush /> : null}
          {show("come") ? <Notepad x={50} y={37} tilt={10} /> : null}
          {show("other") ? <Writing /> : null}
        </g>
      </g>

      {/* rest: the laptop in front, the hands on the keys */}
      {rest && detailed ? <Laptop /> : null}

      {/* the teapot rides outside the body's sway: the pour needs a steady hand */}
      {show("tea") ? <Teapot /> : null}

      {/* doctor: the call goes out of the microphone */}
      {show("doctor") ? (
        <>
          <g fill="none" stroke="var(--ok)" strokeWidth="1.3" strokeLinecap="round">
            {["M15 51 Q12 54 15 57", "M11 49 Q6.5 54 11 59"].map((d, i) => (
              <path key={d} d={d} style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: `smc-ring 1.1s ease-out ${i * 0.28}s infinite`, opacity: 0 }} />
            ))}
          </g>
          <Bubble tone="var(--danger)" still>
            <Glyph scene="doctor" />
          </Bubble>
        </>
      ) : null}

      {/* come: speed lines behind, dust from the steps */}
      {show("come") ? (
        <g stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round">
          {[22, 30, 38].map((y, i) => (
            <path key={y} d={`M62 ${y} h6`} style={{ animation: `smc-speed 0.56s ease-out ${i * 0.12}s infinite`, opacity: 0 }} />
          ))}
          <g fill="var(--text-muted)" stroke="none">
            {[
              { x: 50, y: 59, d: 0 },
              { x: 56, y: 60, d: 0.28 },
            ].map((puff) => (
              <circle key={puff.x} cx={puff.x} cy={puff.y} r="1.8" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `mascot-act-dust 0.56s ease-out ${puff.d}s infinite`, opacity: 0 }} />
            ))}
          </g>
        </g>
      ) : null}

      {/* asked: the request over the head, as a picture, hopping with the face */}
      {asked && detailed ? (
        <Bubble tone="var(--warn)">
          <Glyph scene={scene ?? "other"} />
        </Bubble>
      ) : null}

      {/* done: a tick over the head, and two sparks */}
      {done && detailed ? (
        <>
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "smc-pop 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both" }}>
            <circle cx="54" cy="6" r="7" fill="var(--ok)" />
            <path d="M50.6 6.2 l2.4 2.4 L57.6 3.6" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <path d="M8 10 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 Z" fill="var(--gold)" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-spark 3.8s infinite", opacity: 0 }} />
          <path d="M60 22 l1 2.2 l2.2 1 l-2.2 1 l-1 2.2 l-1 -2.2 l-2.2 -1 l2.2 -1 Z" fill="var(--gold)" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-spark 3.8s 1.9s infinite", opacity: 0 }} />
        </>
      ) : null}
    </svg>
  );
}

function Arm({ d, hand }: { d: string; hand?: { cx: number; cy: number; rx: number; ry: number } }) {
  // the hand sits where the arm ends: the last pair of numbers of the path
  const end = d.trim().split(/\s+/).slice(-2).map(Number) as [number, number];
  const at = hand ?? { cx: end[0], cy: end[1], rx: 3.4, ry: 3 };
  return (
    <g>
      <path d={d} fill="none" stroke={SECRETARY_TONE} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx={at.cx} cy={at.cy} rx={at.rx} ry={at.ry} fill={SECRETARY_TONE} />
    </g>
  );
}

function Mouth({ talking, asked, done, job }: { talking: boolean; asked: boolean; done: boolean; job: DeskScene | null }) {
  if (talking) {
    return <ellipse cx="32" cy="45" rx="3.8" ry="2.8" fill="var(--bg)" style={{ transformOrigin: "32px 45px", animation: "mascot-mouth 0.9s ease-in-out infinite" }} />;
  }
  // an eager open smile — «да-да, слушаю»
  if (asked) return <path d="M27.6 43.6 Q32 44.6 36.4 43.6 Q35.6 49 32 49 Q28.4 49 27.6 43.6 Z" fill="var(--bg)" />;
  if (done) return <path d="M26 43 Q32 48.6 38 43" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />;
  // the finger covers the lips; walking is a set mouth; any other job is a small smile
  if (job === "dnd") return null;
  if (job === "come") return <path d="M29 45 H35" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />;
  if (job) return <path d="M27.5 43.8 Q32 47.2 36.5 43.8" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />;
  return null;
}

/** A bubble over the head, on the right — the request (asked) or the call's subject (doctor). */
function Bubble({ tone, still = false, children }: { tone: string; still?: boolean; children: ReactNode }) {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "30% 100%", animation: "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both" }}>
      <g style={{ transformBox: "fill-box", transformOrigin: "30% 100%", animation: still ? "none" : "smc-bubble 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite" }}>
        <rect x="41" y="-19" width="24" height="19" rx="8" fill="var(--surface)" stroke={tone} strokeWidth="1.3" />
        <circle cx="45" cy="3.2" r="2" fill="var(--surface)" stroke={tone} strokeWidth="1.1" />
        <circle cx="41.6" cy="7" r="1.2" fill="var(--surface)" stroke={tone} strokeWidth="1" />
        <g transform="translate(53 -9.5)">{children}</g>
      </g>
    </g>
  );
}

/** The request as a small picture, drawn round (0, 0) in a box about 14 across. */
function Glyph({ scene }: { scene: DeskScene }) {
  switch (scene) {
    case "coffee":
      return (
        <g>
          <path d="M-5.5 -2 H4 V2 A3.5 3.5 0 0 1 0.5 5.5 H-2 A3.5 3.5 0 0 1 -5.5 2 Z" fill={COFFEE} />
          <path d="M4 -0.8 a2 2 0 0 1 0 3.8" fill="none" stroke={COFFEE} strokeWidth="1.3" />
          <path d="M-3 -4 q-1 -1.6 0 -3.2 M0.5 -4 q1 -1.6 0 -3.2" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    case "tea":
      return (
        <g>
          <path d="M-5.5 -1 H4.5 V2 A3.5 3.5 0 0 1 1 5.5 H-2 A3.5 3.5 0 0 1 -5.5 2 Z" fill="var(--surface-2)" stroke={TEA} strokeWidth="1.2" />
          <ellipse cx="-0.5" cy="-0.8" rx="4.6" ry="0.9" fill={TEA} />
          <path d="M3 -1 L5.5 -5" stroke="var(--text-muted)" strokeWidth="0.7" />
          <rect x="4.2" y="-7.6" width="3" height="3" rx="0.5" fill="var(--gold)" />
        </g>
      );
    case "dnd":
      return (
        <g>
          <circle r="5.8" fill="var(--danger)" />
          <rect x="-3.8" y="-1.1" width="7.6" height="2.2" rx="1.1" fill="#ffffff" />
        </g>
      );
    case "guest":
      return (
        <g>
          <rect x="-6" y="-6.5" width="8.5" height="13" rx="1" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.9" />
          <circle cx="0.6" cy="0.4" r="0.8" fill="var(--gold)" />
          <circle cx="5" cy="-2.6" r="2" fill="var(--text-muted)" />
          <path d="M2 6.5 C2 1.6 8 1.6 8 6.5 Z" fill="var(--text-muted)" />
        </g>
      );
    case "doctor":
      return (
        <g>
          <rect x="-5.5" y="-5.5" width="11" height="11" rx="2.6" fill="#ffffff" />
          <path d="M0 -3.4 V3.4 M-3.4 0 H3.4" stroke="var(--danger)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );
    case "come":
      return (
        <g>
          <rect x="-1" y="-6.5" width="7.5" height="13" rx="1" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.9" />
          <path d="M-7 0 H-1.6 M-4 -2.6 L-1.4 0 L-4 2.6" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    default:
      return <path d="M0 -5.5 V1.5 M0 4.8 V5" stroke="var(--warn)" strokeWidth="2.6" strokeLinecap="round" />;
  }
}

function Laptop() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-prop-in 0.4s cubic-bezier(0.34, 1.3, 0.64, 1) both" }}>
      {/* the back of the lid, facing us, with a glowing mark */}
      <rect x="16.5" y="41" width="31" height="14.5" rx="2.2" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1" />
      <circle cx="32" cy="48.2" r="1.9" fill="var(--accent)" style={{ animation: "smc-glow 2.6s ease-in-out infinite" }} />
      <rect x="13" y="55" width="38" height="3" rx="1.5" fill={EDGE} />
      {/* the hands on the keys, in turn */}
      {[
        { cx: 18.5, d: "0s" },
        { cx: 45.5, d: "0.21s" },
      ].map((hand) => (
        <ellipse
          key={hand.cx}
          cx={hand.cx}
          cy="54.2"
          rx="3.5"
          ry="2.6"
          fill={SECRETARY_TONE}
          stroke="var(--bg)"
          strokeOpacity="0.3"
          strokeWidth="0.8"
          style={{ animation: `smc-tap 0.42s ease-in-out ${hand.d} infinite` }}
        />
      ))}
    </g>
  );
}

function CoffeeMachine() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "100% 100%", animation: PROP_IN }}>
      <rect x="-27" y="18" width="22" height="40" rx="3.5" fill="var(--surface)" stroke={EDGE} strokeWidth="1.3" />
      <rect x="-27" y="18" width="22" height="9" rx="3.5" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1.3" />
      <circle cx="-16" cy="22.5" r="1.5" fill={EDGE} />
      <circle cx="-10" cy="22.5" r="1.6" fill="var(--ok)" style={{ animation: "smc-light 1.3s steps(1) infinite" }} />
      {/* the alcove, the spout, the stream */}
      <rect x="-24" y="30.5" width="16" height="22" rx="2" fill="var(--bg)" opacity="0.55" />
      <rect x="-18" y="30.5" width="4" height="3" rx="1" fill={EDGE} />
      <rect x="-16.6" y="33.5" width="1.2" height="12.5" fill={COFFEE} style={{ transformBox: "fill-box", transformOrigin: "50% 0%", animation: "smc-stream 2.6s ease-in-out infinite" }} />
      {/* the cup under it, filling */}
      <path d="M-21 46 H-11 V49.6 A3.6 3.6 0 0 1 -14.6 53.2 H-17.4 A3.6 3.6 0 0 1 -21 49.6 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.1" />
      <path d="M-11 47.2 a2 2 0 0 1 0 4" fill="none" stroke="var(--text-muted)" strokeWidth="1.1" />
      <ellipse cx="-16" cy="46.6" rx="4.4" ry="0.9" fill={COFFEE} style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "smc-fill 2.6s ease-out infinite" }} />
      <rect x="-25" y="53.5" width="18" height="2" rx="1" fill={EDGE} />
      <Steam x={-16} y={44} />
    </g>
  );
}

function TeaCup() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: PROP_IN }}>
      <ellipse cx="-21" cy="57.6" rx="9.5" ry="1.9" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1" />
      <path d="M-27 48 H-15 V51.4 A4.4 4.4 0 0 1 -19.4 55.8 H-22.6 A4.4 4.4 0 0 1 -27 51.4 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.1" />
      <path d="M-15 49.4 a2.2 2.2 0 0 1 0 4.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.1" />
      <ellipse cx="-21" cy="48.6" rx="5.4" ry="1" fill={TEA} style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "smc-fill 3.2s ease-out infinite" }} />
      {/* the tea bag's tag over the rim, swinging a little */}
      <g style={{ transformOrigin: "-17px 48px", animation: "smc-tag 2.4s ease-in-out infinite" }}>
        <path d="M-17 48 L-13.6 52.6" stroke="var(--text-muted)" strokeWidth="0.6" />
        <rect x="-15" y="52.4" width="3.2" height="3.6" rx="0.6" fill="var(--gold)" />
      </g>
      <Steam x={-21} y={46} />
    </g>
  );
}

/** The pot in the left hand, above the cup: it tips to pour and rights itself. */
function Teapot() {
  return (
    <g transform="translate(-2 30)">
      <g style={{ transformOrigin: "0px 0px", animation: "smc-teapot 3.2s ease-in-out infinite" }}>
        <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: PROP_IN }}>
          <path d="M-15 0.5 L-21 -4.5" fill="none" stroke="var(--text-muted)" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="-9" cy="0" rx="7.5" ry="6" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.2" />
          <path d="M-15.6 1.5 H-2.4" stroke={TEA} strokeWidth="1.6" />
          <ellipse cx="-9" cy="-6" rx="3.8" ry="1.3" fill="var(--surface-2)" stroke="var(--text-muted)" strokeWidth="0.9" />
          <circle cx="-9" cy="-8" r="1.2" fill="var(--text-muted)" />
          <path d="M-2.2 -3 Q2 -1 -2.2 3.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" />
        </g>
      </g>
      {/* the stream, from where the spout's tip lands at the tilt down to the cup */}
      <rect x="-20.2" y="9" width="1.4" height="9" rx="0.7" fill={TEA} style={{ transformBox: "fill-box", transformOrigin: "50% 0%", animation: "smc-tea-stream 3.2s ease-in-out infinite" }} />
      {/* the hand on the handle */}
      <ellipse cx="-0.6" cy="0.6" rx="3.3" ry="2.9" fill={SECRETARY_TONE} />
    </g>
  );
}

function Sign() {
  return (
    <g style={{ transformOrigin: "63px 31px", animation: "smc-sign 2.8s ease-in-out infinite" }}>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: PROP_IN }}>
        <rect x="54.5" y="3" width="18" height="26" rx="4" fill="var(--surface)" stroke="var(--danger)" strokeWidth="1.4" />
        <circle cx="63.5" cy="8.2" r="2.3" fill="var(--bg)" />
        <circle cx="63.5" cy="19.5" r="6" fill="var(--danger)" />
        <rect x="59.4" y="18.4" width="8.2" height="2.2" rx="1.1" fill="#ffffff" />
      </g>
    </g>
  );
}

/** A finger on the lips and «тсс» floating off them. */
function Hush() {
  return (
    <>
      <ellipse cx="33.5" cy="51.6" rx="4.4" ry="3.3" fill={HAND} stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" />
      <ellipse cx="33" cy="45.4" rx="1.9" ry="4.6" fill={HAND} stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" />
      <text x="-9" y="47" fontSize="6.4" fontWeight="700" fill="var(--text-muted)" style={{ animation: "smc-shh 2.8s ease-out infinite", opacity: 0 }}>
        тсс
      </text>
    </>
  );
}

function Door() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "100% 100%", animation: PROP_IN }}>
      <rect x="-27" y="7" width="24" height="52" rx="2" fill="var(--bg)" stroke={EDGE} strokeWidth="1.3" />
      {/* the guest in the doorway, seen once the door is open */}
      <g opacity="0" style={{ animation: "smc-guest 4.2s ease-in-out infinite" }}>
        <circle cx="-15" cy="27" r="5" fill="var(--text-muted)" />
        <path d="M-23 50 C-23 37.5 -7 37.5 -7 50 V58 H-23 Z" fill="var(--text-muted)" />
      </g>
      {/* the leaf, on its hinge at the left edge */}
      <g style={{ transformOrigin: "-26px 33px", animation: "smc-door 4.2s ease-in-out infinite" }}>
        <rect x="-26" y="8" width="22" height="50" rx="1.5" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1" />
        <rect x="-23" y="12" width="16" height="17" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
        <rect x="-23" y="33" width="16" height="21" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
        <circle cx="-7.2" cy="34" r="1.4" fill="var(--gold)" />
      </g>
    </g>
  );
}

function Notepad({ x, y, tilt }: { x: number; y: number; tilt: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: PROP_IN }}>
        <rect x="0" y="0" width="13" height="16" rx="1.6" fill="var(--surface)" stroke={EDGE} strokeWidth="1" />
        <rect x="3" y="-1.4" width="7" height="2.6" rx="1" fill={EDGE} />
        <path d="M2.6 5 h7.6 M2.6 8.4 h6 M2.6 11.8 h7" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** other: a note in front, a pen going over it. */
function Writing() {
  return (
    <>
      <Notepad x={39} y={39} tilt={-8} />
      <g style={{ animation: "smc-write 1.6s ease-in-out infinite" }}>
        <path d="M45 42 L52 34" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="52.6" cy="33.8" rx="3" ry="2.6" fill={HAND} stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" />
      </g>
    </>
  );
}

function Steam({ x, y }: { x: number; y: number }) {
  const curl = (delay: number): CSSProperties => ({
    transformBox: "fill-box",
    transformOrigin: "50% 100%",
    animation: `mascot-steam 2.2s ease-out ${delay}s infinite`,
    opacity: 0,
  });
  return (
    <g fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round">
      <path d={`M${x - 2} ${y} q-1.3 -2.2 0 -4.4`} style={curl(0)} />
      <path d={`M${x + 1.6} ${y} q1.3 -2.2 0 -4.4`} style={curl(1.1)} />
    </g>
  );
}
