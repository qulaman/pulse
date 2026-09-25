import type { CSSProperties, ReactNode } from "react";

import type { Daypart, DeskScene } from "@/lib/errands/scene";

/**
 * The drawings of the secretary's face (D-87, D-97): the room at the desk, the props of each
 * job, the pictures of the requests. Every one is drawn in the face's own 64×64 box (the
 * body spans x 5–59, y 4–60) and may reach out of it — the svg is `overflow: visible`.
 * Motion lives in ./secretary-mascot.css; transform and opacity only.
 */

/**
 * The secretary's colour: the brand's deeper teal, the one the small face at the director's
 * desk wears (D-86) — another character of the same family, never a status colour (DESIGN §1.3).
 */
export const SECRETARY_TONE = "color-mix(in srgb, var(--accent-2) 82%, var(--surface-2))";
/** The headset and the bow tie: dark on the teal body, so the character reads at a glance. */
export const GEAR = "color-mix(in srgb, var(--bg) 72%, var(--surface-2))";
export const EDGE = "color-mix(in srgb, var(--border) 70%, var(--text-muted))";
export const COFFEE = "color-mix(in srgb, var(--gold) 36%, #3b2415)";
export const TEA = "color-mix(in srgb, var(--gold) 70%, #8a3d10)";
export const WATER = "color-mix(in srgb, var(--accent) 45%, #9fd8ff)";
/** A hand held in front of the body: the body's colour, a shade lighter and outlined. */
export const HAND = "color-mix(in srgb, var(--accent-2) 70%, white 12%)";
const DESK = "color-mix(in srgb, var(--surface-2) 80%, white 7%)";
const KRAFT = "color-mix(in srgb, var(--gold) 55%, #7a5534)";

export const PROP_IN = "smc-env-in 0.45s cubic-bezier(0.34, 1.3, 0.64, 1) both";
const box = (origin: string, animation: string): CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin, animation });

/** An arm out of the body — drawn before the body, so the body covers its root. */
export function Arm({ d, hand, style }: { d: string; hand?: { cx: number; cy: number; rx?: number; ry?: number }; style?: CSSProperties }) {
  const end = d.trim().split(/\s+/).slice(-2).map(Number) as [number, number];
  const at = { cx: hand?.cx ?? end[0], cy: hand?.cy ?? end[1], rx: hand?.rx ?? 3.4, ry: hand?.ry ?? 3 };
  return (
    <g style={style}>
      <path d={d} fill="none" stroke={SECRETARY_TONE} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx={at.cx} cy={at.cy} rx={at.rx} ry={at.ry} fill={SECRETARY_TONE} />
    </g>
  );
}

/** A mitten held in front of the body: lighter, outlined, so it reads over the teal. */
export function Mitten({ cx, cy, rx = 3.4, ry = 2.8, style }: { cx: number; cy: number; rx?: number; ry?: number; style?: CSSProperties }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={HAND} stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" style={style} />;
}

export function Steam({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round">
      <path d={`M${x - 2} ${y} q-1.3 -2.2 0 -4.4`} style={{ ...box("50% 100%", "mascot-steam 2.2s ease-out infinite"), opacity: 0 }} />
      <path d={`M${x + 1.6} ${y} q1.3 -2.2 0 -4.4`} style={{ ...box("50% 100%", "mascot-steam 2.2s ease-out 1.1s infinite"), opacity: 0 }} />
    </g>
  );
}

// ---- the desk (rest) -------------------------------------------------------------------

/** Behind the body: the window with the time of day, the clock on the wall. */
export function RoomBack({ daypart, clockAct }: { daypart: Daypart; clockAct: boolean }) {
  const sky =
    daypart === "night"
      ? "color-mix(in srgb, var(--accent-2) 10%, var(--bg))"
      : daypart === "evening"
        ? "color-mix(in srgb, var(--warn) 24%, var(--bg))"
        : "color-mix(in srgb, var(--accent) 16%, var(--bg))";
  return (
    <g style={{ animation: "smc-fade-in 0.5s ease-out both" }}>
      {/* the window, top right */}
      <rect x="62" y="-4" width="24" height="22" rx="2.5" fill={sky} stroke={EDGE} strokeWidth="1.1" />
      {daypart === "night" ? (
        <g>
          <circle cx="78" cy="3.5" r="3.6" fill="#f4f1dc" />
          <circle cx="79.8" cy="2.4" r="3.2" fill={sky} />
          {[
            { x: 67, y: 3, d: 0 },
            { x: 71, y: 12, d: 0.9 },
            { x: 82, y: 12.5, d: 1.7 },
          ].map((star) => (
            <circle key={star.x} cx={star.x} cy={star.y} r="0.8" fill="#ffffff" style={{ animation: `smc-twinkle 2.6s ease-in-out ${star.d}s infinite` }} />
          ))}
        </g>
      ) : daypart === "evening" ? (
        <g>
          <circle cx="74" cy="15" r="5" fill="var(--warn)" opacity="0.9" />
          <rect x="62.6" y="15" width="22.8" height="2.4" fill={sky} />
        </g>
      ) : (
        <g>
          <circle cx={daypart === "morning" ? 68 : 79} cy={daypart === "morning" ? 13 : 3.5} r="3.6" fill="var(--gold)" />
          <g style={{ animation: "smc-cloud 9s ease-in-out infinite" }}>
            <ellipse cx="71" cy="7" rx="4" ry="1.8" fill="#ffffff" opacity="0.55" />
            <ellipse cx="73.5" cy="5.8" rx="2.6" ry="1.8" fill="#ffffff" opacity="0.55" />
          </g>
        </g>
      )}
      <path d="M74 -4 V18 M62 7 H86" stroke={EDGE} strokeWidth="0.8" />

      {/* the clock on the wall, top left: the minute hand sweeps a minute a turn */}
      <circle cx="-7" cy="5" r="6.2" fill="var(--surface)" stroke={EDGE} strokeWidth="1.1" />
      <path d="M-7 5 L-7 1.6" stroke="var(--text)" strokeWidth="1.1" strokeLinecap="round" style={{ transformOrigin: "-7px 5px", transform: "rotate(-60deg)" }} />
      <path
        d="M-7 5 L-7 0.2"
        stroke="var(--text-muted)"
        strokeWidth="0.8"
        strokeLinecap="round"
        style={{ transformOrigin: "-7px 5px", animation: clockAct ? "smc-spin 1.1s cubic-bezier(0.4, 0, 0.2, 1) 0.4s 2" : "smc-spin 60s linear infinite" }}
      />
      <circle cx="-7" cy="5" r="0.8" fill="var(--text)" />
    </g>
  );
}

/**
 * In front of the body: the desk, the monitor typing, the keyboard, the mug, the papers and
 * the plant. `act` moves the thing the idle act is about — always in a hand (TypingHands takes
 * the hand off the keys for it); `asleep` turns the screen off. While an act has the hands, the
 * keys stop lighting and the text on the screen stops where it was.
 */
export function RoomFront({ act, asleep }: { act: string | null; asleep: boolean }) {
  const typing = act === null;
  return (
    <g>
      {/* the plant, far left, and the watering can of its act */}
      <g>
        <path d="M-22 43 H-12 L-13.2 50 H-20.8 Z" fill={KRAFT} />
        <g style={{ transformOrigin: "-17px 43px", animation: act === "plant" ? "smc-leaves 2.8s ease-in-out both" : "smc-sway 5s ease-in-out infinite" }}>
          <ellipse cx="-20" cy="37.5" rx="2.4" ry="5.4" transform="rotate(-28 -20 37.5)" fill="color-mix(in srgb, var(--ok) 70%, var(--bg))" />
          <ellipse cx="-14.2" cy="37" rx="2.4" ry="5.6" transform="rotate(26 -14.2 37)" fill="color-mix(in srgb, var(--ok) 80%, var(--bg))" />
          <ellipse cx="-17" cy="35" rx="2.2" ry="6" fill="color-mix(in srgb, var(--ok) 62%, var(--bg))" />
        </g>
        {act === "plant" ? (
          // the can comes in the left hand and tips about it, the spout over the leaves
          <g style={{ transformOrigin: "0.4px 27px", animation: "smc-can 2.8s ease-in-out both", opacity: 0 }}>
            <path d="M-11 24 H-2 V30.5 A2 2 0 0 1 -4 32.5 H-9 A2 2 0 0 1 -11 30.5 Z" fill="var(--accent-2)" />
            <path d="M-11 26 L-17 22" stroke="var(--accent-2)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M-2 25.5 a2.6 2.6 0 0 1 0 5.2" fill="none" stroke="var(--accent-2)" strokeWidth="1.2" />
            {[0, 0.2, 0.4].map((d, i) => (
              <circle key={d} cx={-17.5 - i * 0.8} cy={24 + i} r="0.8" fill={WATER} style={{ animation: `smc-drop 0.6s ease-in ${1 + d}s 2`, opacity: 0 }} />
            ))}
            <Mitten cx={0.2} cy={28.1} rx={3.4} ry={2.8} />
          </g>
        ) : null}
      </g>

      {/* the desk top and its front — it hides the body from the chest down */}
      <rect x="-26" y="49.5" width="116" height="3.4" rx="1.7" fill={DESK} />
      <rect x="-24" y="52.9" width="112" height="10" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.8" />

      {/* the papers, and their act: picked up and squared with two taps on the desk */}
      <g style={{ animation: act === "papers" ? "smc-papers 2s ease-in-out both" : "none" }}>
        <rect x="3.5" y="46" width="11" height="3.5" rx="0.6" fill="var(--surface)" stroke={EDGE} strokeWidth="0.7" transform="rotate(-4 9 47.7)" />
        <rect x="4" y="44.2" width="11" height="3.5" rx="0.6" fill="var(--surface)" stroke={EDGE} strokeWidth="0.7" transform="rotate(3 9.5 46)" />
      </g>

      {/* the mug on the left, steaming; its act lifts it to the mouth by the handle */}
      <g style={{ transformOrigin: "-1.65px 45.5px", animation: act === "sip" ? "smc-sip 2.6s ease-in-out both" : "none" }}>
        <path d="M-7 41 H1.5 V47.4 A2.6 2.6 0 0 1 -1.1 50 H-4.4 A2.6 2.6 0 0 1 -7 47.4 Z" fill="var(--surface)" stroke={EDGE} strokeWidth="1.1" />
        <path d="M1.5 42.6 a2.2 2.2 0 0 1 0 4.4" fill="none" stroke={EDGE} strokeWidth="1.1" />
        <rect x="-5.8" y="43.4" width="6" height="2" rx="1" fill="var(--accent-2)" opacity="0.8" />
        {act === "sip" ? (
          <Mitten cx={3.2} cy={45.2} rx={3.5} ry={2.6} style={{ animation: "smc-held-sip 2.6s linear both", opacity: 0 }} />
        ) : (
          <Steam x={-2.6} y={39.4} />
        )}
      </g>

      {/* the monitor, right, facing us — the work types on it */}
      <path d="M64 44.5 H71 L72.6 49.6 H62.4 Z" fill={EDGE} />
      <rect x="54" y="22" width="28" height="22.5" rx="3" fill="var(--surface)" stroke={SECRETARY_TONE} strokeWidth="1.4" />
      {asleep ? (
        <circle cx="79" cy="42" r="0.8" fill="var(--warn)" style={{ animation: "smc-glow 3s ease-in-out infinite" }} />
      ) : (
        // the text only runs while the hands type; the morning screen wakes up once somebody sits
        <g style={{ animation: act === "arrive" ? "smc-screen-on 2.6s ease-out both" : "none" }}>
          {[
            { y: 28, w: 18, d: 0 },
            { y: 33, w: 13, d: 0.45 },
            { y: 38, w: 8, d: 0.9 },
          ].map((line) => (
            <path
              key={line.y}
              d={`M58.5 ${line.y} h${line.w}`}
              stroke="var(--accent)"
              strokeWidth="1.7"
              strokeLinecap="round"
              style={{ ...box("0% 50%", `sec-line 2.8s ease-out ${line.d}s infinite`), animationPlayState: typing ? "running" : "paused" }}
            />
          ))}
          <rect x="68" y="36.4" width="1.7" height="3.4" rx="0.5" fill="var(--accent)" style={{ animation: "sec-cursor 0.9s steps(1) infinite" }} />
        </g>
      )}

      {/* the keyboard in front of the body, its keys lighting as they are pressed */}
      <rect x="17" y="46.4" width="30" height="3.6" rx="1.2" fill="color-mix(in srgb, var(--surface-2) 70%, white 10%)" stroke={EDGE} strokeWidth="0.7" />
      {asleep
        ? null
        : [0, 1, 2, 3, 4].map((key) => (
            <rect
              key={key}
              x={19.6 + key * 5.4}
              y="47.4"
              width="3.2"
              height="1.5"
              rx="0.4"
              fill="var(--accent)"
              style={{ animation: typing ? `sec-key 0.84s ease-in-out ${(key * 0.19).toFixed(2)}s infinite` : "none", opacity: 0.3 }}
            />
          ))}
    </g>
  );
}

/**
 * The two hands of the secretary at the desk, [left, right], while an act takes them off the
 * keys: the left one sets the headset right, takes the mug, squares the papers, fetches the
 * can; both go up for the stretch; neither is on the keys before the morning arrival is over.
 * The thing in hand draws its own hand where the two meet (the mug, the can), so the hand the
 * eye follows never doubles and never stays behind on the keys.
 */
const HANDS_IN_ACT: Record<string, [string, string]> = {
  headset: ["smc-hand-ear 2.2s ease-in-out both", "none"],
  sip: ["smc-hand-sip 2.6s ease-in-out both", "none"],
  papers: ["smc-hand-papers 2s ease-in-out both", "none"],
  plant: ["smc-hand-plant 2.8s ease-in-out both", "none"],
  stretch: ["smc-hand-lift 2.4s ease-in-out both", "smc-hand-lift 2.4s ease-in-out both"],
  arrive: ["smc-hand-arrive 2.6s ease-out both", "smc-hand-arrive 2.6s ease-out both"],
};

/** The hands on the keys — typing, still under any other act, resting while the secretary dozes. */
export function TypingHands({ asleep, act = null }: { asleep: boolean; act?: string | null }) {
  const busy = act ? HANDS_IN_ACT[act] : undefined;
  return (
    <g>
      {[
        { cx: 22, d: "0s" },
        { cx: 42, d: "0.21s" },
      ].map((hand, i) => (
        <Mitten
          key={hand.cx}
          cx={hand.cx}
          cy={47.2}
          rx={3.5}
          ry={2.6}
          style={{ animation: busy ? busy[i] : asleep || act ? "none" : `smc-tap 0.42s ease-in-out ${hand.d} infinite` }}
        />
      ))}
    </g>
  );
}

// ---- the jobs --------------------------------------------------------------------------

export function CoffeeMachine() {
  return (
    <g style={box("100% 100%", PROP_IN)}>
      <rect x="-27" y="18" width="22" height="40" rx="3.5" fill="var(--surface)" stroke={EDGE} strokeWidth="1.3" />
      <rect x="-27" y="18" width="22" height="9" rx="3.5" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1.3" />
      <circle cx="-16" cy="22.5" r="1.5" fill={EDGE} />
      <circle cx="-10" cy="22.5" r="1.6" fill="var(--ok)" style={{ animation: "smc-light 1.3s steps(1) infinite" }} />
      <rect x="-24" y="30.5" width="16" height="22" rx="2" fill="var(--bg)" opacity="0.55" />
      <rect x="-18" y="30.5" width="4" height="3" rx="1" fill={EDGE} />
      <rect x="-16.6" y="33.5" width="1.2" height="12.5" fill={COFFEE} style={box("50% 0%", "smc-stream 2.6s ease-in-out infinite")} />
      <path d="M-21 46 H-11 V49.6 A3.6 3.6 0 0 1 -14.6 53.2 H-17.4 A3.6 3.6 0 0 1 -21 49.6 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.1" />
      <path d="M-11 47.2 a2 2 0 0 1 0 4" fill="none" stroke="var(--text-muted)" strokeWidth="1.1" />
      <ellipse cx="-16" cy="46.6" rx="4.4" ry="0.9" fill={COFFEE} style={box("50% 50%", "smc-fill 2.6s ease-out infinite")} />
      <rect x="-25" y="53.5" width="18" height="2" rx="1" fill={EDGE} />
      <Steam x={-16} y={44} />
    </g>
  );
}

/** The cup on its saucer at the left, under the pot (tea) or the carafe (water). */
export function PourCup({ liquid, tag }: { liquid: string; tag: boolean }) {
  return (
    <g style={box("50% 100%", PROP_IN)}>
      <ellipse cx="-21" cy="57.6" rx="9.5" ry="1.9" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1" />
      {tag ? (
        <path d="M-27 48 H-15 V51.4 A4.4 4.4 0 0 1 -19.4 55.8 H-22.6 A4.4 4.4 0 0 1 -27 51.4 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.1" />
      ) : (
        // a glass for water: straight sides, a little narrower at the foot
        <path d="M-26.5 45 H-15.5 L-16.6 56 H-25.4 Z" fill="color-mix(in srgb, var(--surface) 70%, transparent)" stroke="var(--text-muted)" strokeWidth="1" />
      )}
      {tag ? <path d="M-15 49.4 a2.2 2.2 0 0 1 0 4.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.1" /> : null}
      <ellipse cx="-21" cy={tag ? 48.6 : 47.5} rx={tag ? 5.4 : 5.1} ry="1" fill={liquid} style={box("50% 50%", "smc-fill 3.2s ease-out infinite")} />
      {tag ? (
        <g style={{ transformOrigin: "-17px 48px", animation: "smc-tag 2.4s ease-in-out infinite" }}>
          <path d="M-17 48 L-13.6 52.6" stroke="var(--text-muted)" strokeWidth="0.6" />
          <rect x="-15" y="52.4" width="3.2" height="3.6" rx="0.6" fill="var(--gold)" />
        </g>
      ) : null}
      {tag ? <Steam x={-21} y={46} /> : null}
    </g>
  );
}

/** The pot (tea) or the carafe (water) in the left hand: it tips to pour and rights itself. */
export function Pourer({ kind }: { kind: "teapot" | "carafe" }) {
  const liquid = kind === "teapot" ? TEA : WATER;
  return (
    <g transform="translate(-2 30)">
      <g style={{ transformOrigin: "0px 0px", animation: "smc-teapot 3.2s ease-in-out infinite" }}>
        <g style={box("100% 50%", PROP_IN)}>
          {kind === "teapot" ? (
            <>
              <path d="M-15 0.5 L-21 -4.5" fill="none" stroke="var(--text-muted)" strokeWidth="2.4" strokeLinecap="round" />
              <ellipse cx="-9" cy="0" rx="7.5" ry="6" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.2" />
              <path d="M-15.6 1.5 H-2.4" stroke={TEA} strokeWidth="1.6" />
              <ellipse cx="-9" cy="-6" rx="3.8" ry="1.3" fill="var(--surface-2)" stroke="var(--text-muted)" strokeWidth="0.9" />
              <circle cx="-9" cy="-8" r="1.2" fill="var(--text-muted)" />
              <path d="M-2.2 -3 Q2 -1 -2.2 3.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" />
            </>
          ) : (
            <>
              {/* a glass carafe: a round belly, a narrow neck, water inside */}
              <path d="M-19 -5.5 L-14 -3.4" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M-13.5 -7 H-6.5 V-3 C-1.5 -1.5 -1 7 -6 8 H-14 C-19 7 -18.5 -1.5 -13.5 -3 Z" fill="color-mix(in srgb, var(--surface) 60%, transparent)" stroke="var(--text-muted)" strokeWidth="1.1" />
              <path d="M-17.4 2 C-17 5.8 -15.4 7 -14 7 H-6 C-4.6 7 -3 5.8 -2.6 2 Z" fill={WATER} opacity="0.85" />
              <path d="M-2 -3 Q1.6 -0.6 -2.4 3" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" />
            </>
          )}
        </g>
      </g>
      <rect x="-20.2" y="9" width="1.4" height="9" rx="0.7" fill={liquid} style={box("50% 0%", "smc-tea-stream 3.2s ease-in-out infinite")} />
      <ellipse cx="-0.6" cy="0.6" rx="3.3" ry="2.9" fill={SECRETARY_TONE} />
    </g>
  );
}

/** Where the hand holds the sign up: its bottom edge, clear of the headset cup. */
export const SIGN_GRIP = { x: 67.5, y: 30.2 };

/**
 * The «не беспокоить» sign held up on the right — a no-entry circle on a door hanger. It sways
 * about the hand that holds it (SignArm, drawn over it inside the body).
 */
export function Sign({ away = false }: { away?: boolean }) {
  return (
    <g style={{ transformOrigin: `${SIGN_GRIP.x}px ${SIGN_GRIP.y}px`, animation: away ? "smc-sign-away 1.2s ease-in both" : "smc-sign 2.8s ease-in-out infinite" }}>
      <g style={box("50% 100%", PROP_IN)}>
        <rect x="58.5" y="3" width="18" height="26" rx="4" fill="var(--surface)" stroke="var(--danger)" strokeWidth="1.4" />
        <circle cx="67.5" cy="8.2" r="2.3" fill="var(--bg)" />
        <circle cx="67.5" cy="19.5" r="6" fill="var(--danger)" />
        <rect x="63.4" y="18.4" width="8.2" height="2.2" rx="1.1" fill="#ffffff" />
      </g>
    </g>
  );
}

/** The right arm up to the sign's bottom edge — the hand over the sign, the root under the body. */
export function SignArm({ style }: { style?: CSSProperties }) {
  return <Arm d={`M52 41 Q63 40 ${SIGN_GRIP.x - 0.5} ${SIGN_GRIP.y + 1}`} hand={{ cx: SIGN_GRIP.x, cy: SIGN_GRIP.y + 0.6, rx: 3.6, ry: 3 }} style={style} />;
}

/** The director's door behind the secretary, shut: the one being guarded (dnd). */
export function ShutDoor() {
  return (
    <g style={box("100% 100%", PROP_IN)}>
      <rect x="-27" y="7" width="24" height="52" rx="2" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1.2" />
      <rect x="-23" y="12" width="16" height="17" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
      <rect x="-23" y="33" width="16" height="21" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
      <circle cx="-7.2" cy="34" r="1.4" fill="var(--gold)" />
      {/* the lamp over the door, lit */}
      <rect x="-20" y="1.6" width="10" height="3.6" rx="1.8" fill="var(--danger)" style={{ animation: "smc-glow 2.4s ease-in-out infinite" }} />
    </g>
  );
}

/** «вызови охрану» (D-99): a police light on the crown, its beams turning, the dome blinking. */
export function Siren() {
  return (
    <g>
      <g style={{ transformOrigin: "32px 0px", animation: "smc-spin 0.9s linear infinite" }}>
        <path d="M32 0 L12 -9 L12 -3 Z" fill="var(--danger)" opacity="0.4" />
        <path d="M32 0 L52 9 L52 3 Z" fill="var(--danger)" opacity="0.4" />
      </g>
      <rect x="25.5" y="0.6" width="13" height="3.4" rx="1.2" fill={GEAR} />
      <path d="M27.4 1 Q27.4 -6.4 32 -6.4 Q36.6 -6.4 36.6 1 Z" fill="var(--danger)" style={{ animation: "smc-light 0.5s steps(1) infinite" }} />
      <ellipse cx="30.4" cy="-3" rx="1.1" ry="1.7" fill="#ffffff" opacity="0.6" />
    </g>
  );
}

/** A finger on the lips and «тсс» floating off them. */
export function Hush() {
  return (
    <>
      <Mitten cx={33.5} cy={51.6} rx={4.4} ry={3.3} />
      <ellipse cx="33" cy="45.4" rx="1.9" ry="4.6" fill={HAND} stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" />
      <text x="-9" y="30" fontSize="6.4" fontWeight="700" fill="var(--text-muted)" style={{ animation: "smc-shh 2.8s ease-out infinite", opacity: 0 }}>
        тсс
      </text>
    </>
  );
}

/** The door for the guest: it opens on its hinge, the guest steps in, it shuts (`closing` — the finish). */
export function GuestDoor({ closing = false }: { closing?: boolean }) {
  return (
    <g style={box("100% 100%", PROP_IN)}>
      <rect x="-27" y="7" width="24" height="52" rx="2" fill="var(--bg)" stroke={EDGE} strokeWidth="1.3" />
      {closing ? null : (
        <g opacity="0" style={{ animation: "smc-guest 4.2s ease-in-out infinite" }}>
          <circle cx="-15" cy="27" r="5" fill="var(--text-muted)" />
          <path d="M-23 50 C-23 37.5 -7 37.5 -7 50 V58 H-23 Z" fill="var(--text-muted)" />
        </g>
      )}
      <g style={{ transformOrigin: "-26px 33px", animation: closing ? "smc-door-close 1.2s ease-in-out both" : "smc-door 4.2s ease-in-out infinite" }}>
        <rect x="-26" y="8" width="22" height="50" rx="1.5" fill="var(--surface-2)" stroke={EDGE} strokeWidth="1" />
        <rect x="-23" y="12" width="16" height="17" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
        <rect x="-23" y="33" width="16" height="21" rx="1" fill="none" stroke={EDGE} strokeWidth="0.8" />
        <circle cx="-7.2" cy="34" r="1.4" fill="var(--gold)" />
      </g>
    </g>
  );
}

/** A notepad, its corner at (x, y); `grip` — a hand on its lower edge, the pad is held, not floating. */
export function Notepad({ x, y, tilt, grip = false }: { x: number; y: number; tilt: number; grip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <g style={box("50% 100%", PROP_IN)}>
        <rect x="0" y="0" width="13" height="16" rx="1.6" fill="var(--surface)" stroke={EDGE} strokeWidth="1" />
        <rect x="3" y="-1.4" width="7" height="2.6" rx="1" fill={EDGE} />
        <path d="M2.6 5 h7.6 M2.6 8.4 h6 M2.6 11.8 h7" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" />
        {grip ? <Mitten cx={3.4} cy={15.4} rx={3.2} ry={2.6} /> : null}
      </g>
    </g>
  );
}

/**
 * other: a note taken on the pad in front of the chest — the left hand holds the pad, the right
 * one writes, both below the eyes and off the headset.
 */
export function Writing() {
  return (
    <>
      <Notepad x={41} y={42} tilt={-8} />
      <Mitten cx={42.2} cy={51.5} rx={2.6} ry={3.2} />
      <g style={{ animation: "smc-write 1.6s ease-in-out infinite" }}>
        <path d="M44.6 47.4 L50.6 41.4" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
        <Mitten cx={49.6} cy={43} rx={3} ry={2.6} />
      </g>
    </>
  );
}

/** taxi: the yellow car rolls up from the left and stops; `leave` drives it off (the finish). */
export function Car({ motion = "arrive" }: { motion?: "arrive" | "leave" | "still" }) {
  const animation =
    motion === "leave" ? "smc-car-leave 1.6s ease-in both" : motion === "arrive" ? "smc-car-arrive 3.4s cubic-bezier(0.2, 0.7, 0.3, 1) infinite" : "none";
  return (
    <g style={{ animation }}>
      <path d="M-34 52 V47 Q-34 45 -32 45 H-28 L-25 40.5 Q-24.4 39.6 -23.2 39.6 H-14.4 Q-13.2 39.6 -12.6 40.5 L-9.6 45 H-6 Q-4 45 -4 47 V52 Z" fill="var(--gold)" />
      <path d="M-26.4 44.8 L-24 41.4 H-19.6 V44.8 Z M-18.4 44.8 V41.4 H-14 L-11.6 44.8 Z" fill="color-mix(in srgb, var(--bg) 70%, var(--accent-2))" />
      <rect x="-21.6" y="37.4" width="5" height="2.4" rx="0.6" fill="var(--surface)" />
      <circle cx="-27" cy="52.6" r="3" fill="var(--bg)" stroke={EDGE} strokeWidth="0.8" />
      <circle cx="-11" cy="52.6" r="3" fill="var(--bg)" stroke={EDGE} strokeWidth="0.8" />
      <circle cx="-5.2" cy="47.6" r="0.9" fill="#fff6c9" />
    </g>
  );
}

/** print: the printer on the left, a sheet coming out of it into the tray, again and again. */
export function Printer() {
  return (
    <g style={box("100% 100%", PROP_IN)}>
      <rect x="-26" y="34" width="22" height="14" rx="2.4" fill="var(--surface)" stroke={EDGE} strokeWidth="1.2" />
      <rect x="-22" y="30.5" width="14" height="4" rx="1" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.9" />
      <rect x="-23" y="38.4" width="16" height="1.6" rx="0.8" fill="var(--bg)" />
      <circle cx="-7.5" cy="44.6" r="1" fill="var(--ok)" style={{ animation: "smc-light 0.8s steps(1) infinite" }} />
      {/* the tray under the slot */}
      <path d="M-25 49.5 H-5 L-7 52 H-23 Z" fill={EDGE} />
      <g style={{ animation: "smc-sheet 2.2s ease-in-out infinite" }}>
        <rect x="-21.5" y="38.8" width="13" height="11" rx="0.6" fill="#ffffff" />
        <path d="M-19.5 42 h9 M-19.5 44.4 h7 M-19.5 46.8 h8" stroke="var(--text-muted)" strokeWidth="0.7" />
      </g>
    </g>
  );
}

/** meeting: a table on the left with two chairs; a glass is set on it, again. */
export function MeetingTable() {
  return (
    <g style={box("100% 100%", PROP_IN)}>
      {/* the chairs behind the table */}
      <rect x="-31" y="38" width="7" height="12" rx="2" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.8" />
      <rect x="-15" y="38" width="7" height="12" rx="2" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.8" />
      <rect x="-33" y="46" width="30" height="3" rx="1.4" fill={DESK} />
      <path d="M-30 49 V58 M-6 49 V58" stroke={EDGE} strokeWidth="1.4" strokeLinecap="round" />
      {/* a notepad already there, and the glass being set down */}
      <rect x="-28" y="44" width="8" height="2" rx="0.5" fill="var(--surface)" stroke={EDGE} strokeWidth="0.6" />
      <g style={{ animation: "smc-place 2.6s ease-in-out infinite" }}>
        <path d="M-15 39.5 H-9.4 L-10 46 H-14.4 Z" fill="color-mix(in srgb, var(--surface) 60%, transparent)" stroke="var(--text-muted)" strokeWidth="0.8" />
        <rect x="-14.4" y="42" width="4.4" height="3.6" fill={WATER} opacity="0.8" />
      </g>
    </g>
  );
}

// ---- what is carried: the doing of lunch / courier / come, and every finish -------------

/**
 * The thing in hand, held in front on the right: a cup on its saucer, a glass, a paper bag,
 * a box, a sheet, a notepad. The finish carries it out; the director's desk shows it in the
 * small secretary's hands (D-97).
 */
export function Carried({ scene }: { scene: DeskScene }) {
  switch (scene) {
    case "coffee":
    case "tea":
      return (
        <g style={box("50% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
          <ellipse cx="51" cy="57.4" rx="11" ry="2.4" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.2" />
          <path d="M58.6 47 a3.2 3.2 0 0 1 0 6.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" />
          <path d="M43.4 45.6 H58.6 V50.4 A5.6 5.6 0 0 1 53 56 H49 A5.6 5.6 0 0 1 43.4 50.4 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.4" />
          <ellipse cx="51" cy="46" rx="6.8" ry="1.4" fill={scene === "coffee" ? COFFEE : TEA} />
          <Steam x={51} y={43.2} />
          <Mitten cx={40.5} cy={56} rx={3.2} ry={2.6} />
          <Mitten cx={61.5} cy={56} rx={3.2} ry={2.6} />
        </g>
      );
    case "water":
    case "meeting":
      return (
        <g style={box("50% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
          <path d="M45 42 H56 L55 55 H46 Z" fill="color-mix(in srgb, var(--surface) 60%, transparent)" stroke="var(--text-muted)" strokeWidth="1.1" />
          <path d="M45.6 47 H55.4 L55 55 H46 Z" fill={WATER} opacity="0.85" />
          <Mitten cx={50.5} cy={56.6} rx={4} ry={2.6} />
        </g>
      );
    case "lunch":
      return (
        <g style={box("50% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
          <path d="M45.5 37 Q50.5 31 55.5 37" fill="none" stroke={KRAFT} strokeWidth="1.4" />
          <path d="M43 37 H58 L59.5 56 H41.5 Z" fill={KRAFT} />
          <path d="M43 40 H58" stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
          <circle cx="50.5" cy="47" r="3.2" fill="var(--surface)" opacity="0.85" />
          <path d="M49 47 l1.2 1.2 l2.2 -2.4" fill="none" stroke="var(--ok)" strokeWidth="0.9" strokeLinecap="round" />
          <Mitten cx={50.5} cy={36.6} rx={3} ry={2.4} />
        </g>
      );
    case "courier":
      return (
        <g style={box("50% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
          <rect x="40" y="41" width="22" height="18" rx="1.6" fill={KRAFT} />
          <rect x="49.4" y="41" width="3.2" height="18" fill="color-mix(in srgb, var(--gold) 40%, var(--surface))" opacity="0.8" />
          <path d="M42.5 45 h4 M42.5 47.2 h3" stroke="var(--bg)" strokeOpacity="0.4" strokeWidth="0.7" />
          <Mitten cx={38.6} cy={51} rx={2.6} ry={3.4} />
          <Mitten cx={63.4} cy={51} rx={2.6} ry={3.4} />
        </g>
      );
    case "print":
      return (
        <g style={box("50% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
          <rect x="43" y="40" width="15" height="19" rx="0.8" fill="#ffffff" transform="rotate(6 50.5 49.5)" />
          <path d="M45.6 44.6 h9 M45.4 47.4 h7 M45.2 50.2 h8.4 M45 53 h6" stroke="var(--text-muted)" strokeWidth="0.7" transform="rotate(6 50.5 49.5)" />
          <Mitten cx={47} cy={59} rx={3} ry={2.4} />
        </g>
      );
    case "dnd":
      return <Sign />;
    default:
      return <Notepad x={48} y={40} tilt={10} grip />;
  }
}

// ---- the pictures of the requests ------------------------------------------------------

/** A bubble over the head, on the right — the request (asked) or the call's subject (doctor, taxi). */
export function Bubble({ tone, motion, queue = 0, children }: { tone: string; motion: string; queue?: number; children: ReactNode }) {
  return (
    <g style={box("30% 100%", "mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) both")}>
      <g style={box("30% 100%", motion)}>
        <rect x="41" y="-19" width="24" height="19" rx="8" fill="var(--surface)" stroke={tone} strokeWidth="1.3" />
        <circle cx="45" cy="3.2" r="2" fill="var(--surface)" stroke={tone} strokeWidth="1.1" />
        <circle cx="41.6" cy="7" r="1.2" fill="var(--surface)" stroke={tone} strokeWidth="1" />
        <g transform="translate(53 -9.5)">{children}</g>
        {/* more requests waiting behind this one */}
        {queue > 0 ? (
          <g>
            <circle cx="64" cy="-18" r="5.2" fill={tone} stroke="var(--bg)" strokeWidth="1.2" />
            <text x="64" y="-15.9" textAnchor="middle" fontSize="5.8" fontWeight="800" fill="var(--bg)">
              +{queue}
            </text>
          </g>
        ) : null}
      </g>
    </g>
  );
}

/** The request as a small picture, drawn round (0, 0) in a box about 14 across. */
export function Glyph({ scene }: { scene: DeskScene }) {
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
    case "water":
      return (
        <g>
          <path d="M-4.5 -5.5 H4.5 L3.6 5.5 H-3.6 Z" fill="color-mix(in srgb, var(--surface-2) 60%, transparent)" stroke="var(--text-muted)" strokeWidth="1" />
          <path d="M-4.1 -0.5 H4.1 L3.6 5.5 H-3.6 Z" fill={WATER} />
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
    case "meeting":
      return (
        <g>
          <rect x="-7" y="-1" width="14" height="2.4" rx="1" fill={DESK} />
          <path d="M-5 1.4 V6 M5 1.4 V6" stroke={EDGE} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="-4" cy="-4.4" r="2.2" fill="var(--text-muted)" />
          <circle cx="4" cy="-4.4" r="2.2" fill="var(--text-muted)" />
        </g>
      );
    case "security":
      return (
        <text y="2.6" textAnchor="middle" fontSize="8.2" fontWeight="900" fill="var(--danger)" letterSpacing="0.4">
          SOS
        </text>
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
    case "taxi":
      return (
        <g transform="translate(9.5 -23) scale(0.5)">
          <Car motion="still" />
        </g>
      );
    case "print":
      return (
        <g>
          <rect x="-6" y="-2" width="12" height="6.5" rx="1.2" fill="var(--surface-2)" stroke={EDGE} strokeWidth="0.8" />
          <rect x="-3.6" y="-6.5" width="7.2" height="6" rx="0.4" fill="#ffffff" />
          <path d="M-2.4 -4.6 h4.8 M-2.4 -2.8 h3.6" stroke="var(--text-muted)" strokeWidth="0.6" />
        </g>
      );
    case "lunch":
      return (
        <g>
          <path d="M-3 -5 Q0 -8.4 3 -5" fill="none" stroke={KRAFT} strokeWidth="1" />
          <path d="M-5 -5 H5 L6 6 H-6 Z" fill={KRAFT} />
        </g>
      );
    case "courier":
      return (
        <g>
          <rect x="-6.5" y="-5" width="13" height="10.5" rx="1" fill={KRAFT} />
          <rect x="-1" y="-5" width="2" height="10.5" fill="color-mix(in srgb, var(--gold) 40%, var(--surface))" />
        </g>
      );
    default:
      return <path d="M0 -5.5 V1.5 M0 4.8 V5" stroke="var(--warn)" strokeWidth="2.6" strokeLinecap="round" />;
  }
}

/** celebrating a quick job (the game feel, after the D-40 gate): confetti off the crown. */
const CONFETTI = [
  { x: -24, y: -10, r: 220, color: "var(--accent)" },
  { x: -15, y: -20, r: -160, color: "var(--gold)", round: true },
  { x: -6, y: -25, r: 300, color: "var(--ok)" },
  { x: 5, y: -26, r: -240, color: "#ffffff", round: true },
  { x: 14, y: -21, r: 200, color: "var(--accent)" },
  { x: 23, y: -12, r: -280, color: "var(--gold)" },
  { x: -30, y: 2, r: 180, color: "var(--ok)", round: true },
  { x: 30, y: 0, r: -200, color: "var(--warn)" },
];

export function Confetti() {
  return (
    <g>
      {CONFETTI.map((bit, i) => (
        <g key={i} transform="translate(32 8)">
          {bit.round ? (
            <circle r="1.5" fill={bit.color} style={{ ["--cx" as string]: `${bit.x}px`, ["--cy" as string]: `${bit.y}px`, ["--cr" as string]: `${bit.r}deg`, animation: "mascot-confetti 1.6s ease-out both", opacity: 0 }} />
          ) : (
            <rect x="-1.4" y="-0.8" width="2.8" height="1.6" rx="0.4" fill={bit.color} style={{ ["--cx" as string]: `${bit.x}px`, ["--cy" as string]: `${bit.y}px`, ["--cr" as string]: `${bit.r}deg`, animation: "mascot-confetti 1.6s ease-out both", opacity: 0 }} />
          )}
        </g>
      ))}
    </g>
  );
}

/** «спасибо» from the director: hearts go up off the crown (after the D-40 gate). */
export function Hearts() {
  return (
    <g fill="var(--danger)">
      {[
        { x: 22, d: 0, s: 1 },
        { x: 40, d: 0.35, s: 0.8 },
        { x: 31, d: 0.7, s: 1.15 },
      ].map((heart) => (
        <path
          key={heart.x}
          d={`M${heart.x} 4 c-1.6 -2.6 -5.4 -1.2 -4.2 1.6 c0.8 1.8 4.2 4.2 4.2 4.2 c0 0 3.4 -2.4 4.2 -4.2 c1.2 -2.8 -2.6 -4.2 -4.2 -1.6 Z`}
          style={{ ...box("50% 100%", `smc-heart 2.4s ease-out ${heart.d}s both`), opacity: 0, scale: String(heart.s) }}
        />
      ))}
    </g>
  );
}
