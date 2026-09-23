/**
 * The assistant character «Капля» (D-45, docs/DESIGN.md §3): one soft blob, two eyes.
 * Director-facing states only in the pilot. Each state is its own choreography — a
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
 *   alert        «насторожен»: straightens up and holds still, the eyes sweep the room and
 *                stop at the edges — the director's face never gets angry, it watches
 *   calling      «обрати внимание!»: leans in, hops twice like a dog at the door, an «!»
 *                pops over its head — the employee has an order nobody has opened yet
 *   surprised    woken by a thought: a startle, wide eyes turned up to the bubble, a small round mouth
 *   processing   reads the data and reports: plugs into the store, the eyes run glyphs,
 *                then a hop and the tick of the new status (D-65)
 * Perf contract: a single SVG, animation on transform and opacity only, CSS keyframes
 * (app/globals.css), nothing on filter or box-shadow. Pass `level` (0..1, from the
 * microphone) while listening — the blob swells and nods harder with the voice.
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
  | "surprised"
  | "processing"
  | "calling"
  | "alert"
  | "angry"
  | "nervous"
  | "bored"
  | "panicking"
  | "swearing";

/**
 * The blue the face wears while it sleeps. The dream orbiting the board is drawn in the
 * same one (components/pulse/DreamOrbit.tsx), so it reads as coming out of this face.
 */
export const SLEEP_COLOR = "color-mix(in srgb, var(--accent) 72%, var(--surface-2))";

const COLOR: Record<MascotState, string> = {
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
  surprised: "var(--accent)",
  processing: "var(--accent)",
  calling: "var(--warn)",
  alert: "var(--warn)",
  angry: "var(--danger)",
  nervous: "var(--warn)",
  bored: "color-mix(in srgb, var(--accent) 58%, var(--surface-2))",
  panicking: "var(--danger)",
  swearing: "var(--danger)",
};

/**
 * Every state that has no pose of its own still arrives instead of cutting in: the blob
 * settles for 220 ms on the entrance curve. The pipeline (saving → transcribing → parsing
 * → sending) is one character doing one job, so the eye must keep tracking the same object.
 */
const SETTLE = "mascot-settle 0.22s cubic-bezier(0.16, 1, 0.3, 1) both";

/** One-shot pose on entering the state (outer group, keeps its end frame). */
const POSE: Record<MascotState, string> = {
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
  surprised: "mascot-startle 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  calling: "mascot-lean 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  alert: "mascot-alert-pose 0.5s cubic-bezier(0.34, 1.35, 0.64, 1) both",
  // the whole take lives in the pose: read, lock, hop, report
  processing: "mascot-process 1.9s both",
  angry: "mascot-angry-pose 0.38s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  nervous: SETTLE,
  bored: SETTLE,
  panicking: "mascot-panic-pose 0.36s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  swearing: "mascot-angry-pose 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) both",
};

/** Looping body motion (inner group). */
const BODY: Record<MascotState, string> = {
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
  surprised: "mascot-alert 2.8s ease-in-out infinite",
  // under the take the body keeps breathing, so the face is alive once the report is done
  processing: "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  calling: "mascot-call 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite",
  alert: "mascot-alert 4.6s ease-in-out infinite",
  angry: "mascot-angry 0.82s ease-in-out infinite",
  nervous: "mascot-nervous 1.35s ease-in-out infinite",
  bored: "mascot-bored 4.4s ease-in-out infinite",
  panicking: "mascot-panic 0.48s ease-in-out infinite",
  swearing: "mascot-swear 0.72s ease-in-out infinite",
};

/**
 * Secondary motion: the eyes are carried by the body, so they arrive a beat after it and
 * settle after it stops. Only the states that name a drag pay for it — the group is there
 * for everyone, but without an animation it costs nothing.
 */
const DRAG: Partial<Record<MascotState, string>> = {
  calm: "mascot-drag-breath 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
  listening: "mascot-drag-nod 1.15s ease-in-out infinite",
  happy: "mascot-happy-look 3.8s infinite",
  speaking: "mascot-drag-nod 1.1s ease-in-out infinite",
  thinking: "mascot-drag-breath 2.6s ease-in-out infinite",
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
  alert: "mascot-scan 4.6s ease-in-out infinite",
  thinking: "mascot-wander 2.6s ease-in-out infinite",
  speaking: "mascot-speak-look 2.2s ease-in-out infinite",
  happy: "none",
  sleeping: "none",
  surprised: "mascot-look-up 2.4s ease-in-out infinite",
  processing: "mascot-code-look 1.9s both",
  angry: "mascot-angry-look 0.82s ease-in-out infinite",
  nervous: "mascot-nervous-look 1.35s ease-in-out infinite",
  bored: "mascot-bored-look 4.4s ease-in-out infinite",
  panicking: "mascot-panic-look 0.48s ease-in-out infinite",
  swearing: "mascot-swear-look 0.72s ease-in-out infinite",
};

/**
 * The eye's drawn geometry; every state is a scale away from it (never a new rx/ry).
 * This pair is the whole expressiveness dial of the face: a wide-open eye carries the
 * mood, a small one reads as a dot. ~20% of the figure: the face carries expression at a
 * glance, and at avatar sizes the eyes are still eyes (DESIGN §3 asks for ≥12% at ≤28px).
 */
/** What the eyes run while reading: a left and a right column of a terminal. */
const GLYPHS_LEFT = ["0", "1", "{", "<"];
const GLYPHS_RIGHT = ["1", "0", "}", ">"];
/** One glyph holds for a quarter of the roll; the rolls fill the reading beat. */
const GLYPH_STEP = 0.055;
const GLYPH_ROLLS = 4;

const EYE_RX = 6.6;
const EYE_RY = 7;

export function Mascot({
  state = "calm",
  size = 64,
  level = 0,
}: {
  state?: MascotState;
  size?: number;
  level?: number;
}) {
  const squint = state === "happy";
  const wide = state === "listening";
  const talking = state === "speaking";
  const lidded = state === "saving"; // eyes half-closed while tucking the note away
  const asleep = state === "sleeping"; // eyes shut, a slow breath, small z-s drifting up
  const startled = state === "surprised"; // woken by a thought: wide eyes up at it, a small round mouth
  const angry = state === "angry" || state === "swearing";
  const anxious = state === "nervous" || state === "panicking";
  const bored = state === "bored";
  const clamped = Math.min(1, Math.max(0, level));
  const swell = state === "listening" ? 1 + clamped * 0.14 : 1;
  // the voice pushes the nod: louder — a deeper dip
  const dip = state === "listening" ? clamped * 2.2 : 0;
  // How far the eye is open, as a share of the drawn eye: the size lives in EYE_RX/EYE_RY
  // alone, so the whole cast grows or shrinks together and no state has to be re-tuned.
  const calling = state === "calling"; // «обрати внимание!»: wide eyes and an «!» over the head
  const watchful = state === "alert"; // «насторожен»: the director's face watches, never scowls
  const open = asleep ? 0.19 : bored ? 0.4 : squint ? 0.42 : lidded ? 0.61 : wide || startled || anxious || calling ? 1.16 : watchful ? 1.08 : 1;
  // a closing eye also shortens: at this size a full-width slit reads as a bar across the face
  const widen = wide ? 1.06 : startled || anxious || calling ? 1.1 : asleep ? 0.8 : squint ? 0.85 : lidded || bored ? 0.92 : 1;
  // the eye is drawn once at EYE_RX/EYE_RY and reshaped by scale — a compositor-only change
  const eyeShape = `scale(${widen}, ${open})`;
  // one cycle now holds a flick, its echo and a later single blink, so the rhythm is not a tick
  const blink = squint || lidded || asleep ? "none" : "mascot-blink 9.2s infinite";
  // at avatar sizes the gleam and the ground shadow are sub-pixel decoration: draw them, do not animate
  const detailed = size >= 40;
  // the glyphs, the store and the tick are a reading scene — below avatar size it is noise,
  // and the hop alone still says «the status moved»
  const reading = state === "processing" && detailed;
  const shadow = !detailed
    ? "none"
    : state === "happy"
      ? "mascot-shadow-hop 3.8s ease-in-out infinite"
      : state === "sleeping"
        ? "mascot-shadow-sleep 7s ease-in-out infinite"
        : state === "calm"
          ? "mascot-shadow-idle 5.8s ease-in-out infinite"
          // the two one-shots big enough for the ground to answer them
          : state === "surprised"
            ? "mascot-shadow-startle 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both"
            : state === "processing"
              ? "mascot-shadow-process 1.9s both"
              : "none";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      data-state={state}
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

      {/* listening: sound waves come in from the right and land on the ear */}
      {state === "listening" ? (
        <g fill="none" stroke={COLOR.listening} strokeWidth="1.7" strokeLinecap="round">
          {[0, 1, 2].map((wave) => (
            <path
              key={wave}
              d={`M${66 + wave * 5} ${17 - wave * 2.5} a${8 + wave * 4} ${8 + wave * 4} 0 0 1 0 ${16 + wave * 5}`}
              style={{
                transformOrigin: "62px 25px",
                animation: `mascot-wave-in ${(1.5 - clamped * 0.5).toFixed(2)}s ease-out ${wave * 0.28}s infinite`,
                opacity: 0,
              }}
            />
          ))}
        </g>
      ) : null}

      {/* thinking: three dots come and go above the head, like a message being typed */}
      {state === "thinking" ? (
        <g fill={COLOR.thinking}>
          {[0, 1, 2].map((dot) => (
            <circle
              key={dot}
              cx={44 + dot * 6}
              cy={8 - dot * 2}
              r={2 + dot * 0.4}
              style={{
                transformOrigin: `${44 + dot * 6}px ${8 - dot * 2}px`,
                animation: `mascot-dot 2.6s ${dot * 0.22}s infinite`,
                opacity: 0,
              }}
            />
          ))}
        </g>
      ) : null}

      {/* nervous and panicking: sweat flicks away from the head at different tempos */}
      {anxious ? (
        <g fill="var(--surface)" stroke={COLOR[state]} strokeWidth="1.25">
          <path d="M54 17 C57 21 57 24 54 24 C51 24 51 21 54 17 Z" style={{ transformOrigin: "54px 21px", animation: `mascot-sweat ${state === "panicking" ? "0.48s" : "1.35s"} ease-out infinite` }} />
          {state === "panicking" ? <path d="M9 25 C12 29 12 32 9 32 C6 32 6 29 9 25 Z" style={{ transformOrigin: "9px 29px", animation: "mascot-sweat 0.48s ease-out 0.18s infinite" }} /> : null}
        </g>
      ) : null}

      {/* swearing: the cloud keeps the reaction expressive without putting words in the UI */}
      {state === "swearing" ? (
        <g style={{ transformOrigin: "49px 10px", animation: "mascot-swear-cloud 0.72s ease-in-out infinite" }}>
          <path d="M42 11 C41 6 45 3 49 5 C52 1 58 4 57 8 C61 10 59 15 55 15 L45 15 C41 15 39 13 42 11 Z" fill="var(--surface)" stroke={COLOR.swearing} strokeWidth="1.2" />
          <path d="M45 15 L43 18 L48 15" fill="var(--surface)" stroke={COLOR.swearing} strokeWidth="1.2" strokeLinejoin="round" />
          <text x="44.2" y="12.2" fill={COLOR.swearing} fontSize="7" fontWeight="800">!#</text>
        </g>
      ) : null}

      {/* saving: a note sinks into the head and is gone — tucked away safely */}
      {state === "saving" ? (
        <g style={{ transformOrigin: "32px -2px", animation: "mascot-tuck-note 1.4s ease-in-out infinite", opacity: 0 }}>
          <rect x="24" y="-9" width="16" height="12" rx="2.5" fill="var(--surface)" stroke={COLOR.saving} strokeWidth="1.5" />
          <path d="M27 -4.5h10M27 -1.5h6" stroke={COLOR.saving} strokeWidth="1.3" strokeLinecap="round" />
        </g>
      ) : null}

      {/* transcribing: bars of sound turn, one after another, into lines of text */}
      {state === "transcribing" ? (
        <g fill={COLOR.transcribing}>
          {/* the voice: four bars that breathe, then go quiet */}
          {[0, 1, 2, 3].map((bar) => (
            <rect
              key={`bar-${bar}`}
              x={-9 + bar * 4}
              y={22 - [4, 7, 5, 3][bar]!}
              width="2.2"
              height={[8, 14, 10, 6][bar]}
              rx="1.1"
              style={{
                transformOrigin: `${-8 + bar * 4}px 22px`,
                animation: `mascot-bar-fade 2.4s ease-in-out ${bar * 0.12}s infinite`,
              }}
            />
          ))}
          {/* the words: three lines type in on the right, one under another */}
          {[0, 1, 2].map((line) => (
            <rect
              key={`line-${line}`}
              x="65"
              y={15 + line * 5.5}
              width={[13, 9, 11][line]}
              height="2.4"
              rx="1.2"
              style={{
                transformOrigin: "65px 16px",
                animation: `mascot-line-type 2.4s ease-out ${0.7 + line * 0.3}s infinite`,
                opacity: 0,
              }}
            />
          ))}
        </g>
      ) : null}

      {/* parsing: cards appear over the head one by one and slide into a stack on the right */}
      {state === "parsing" ? (
        <g>
          {[0, 1, 2].map((card) => (
            <g
              key={card}
              style={{
                transformOrigin: `${20 + card * 14}px -4px`,
                animation: `mascot-sort-card 2.4s ease-in-out ${card * 0.3}s infinite`,
                opacity: 0,
              }}
            >
              <rect x={12 + card * 14} y="-9" width="13" height="10" rx="2.5" fill="var(--surface)" stroke={COLOR.parsing} strokeWidth="1.4" />
              <path d={`M${15 + card * 14} -5h7M${15 + card * 14} -2h4`} stroke={COLOR.parsing} strokeWidth="1.1" strokeLinecap="round" />
            </g>
          ))}
        </g>
      ) : null}

      {/* offering: the parsed cards wait in hand — a ring ripples out of the blob and the
          stack lifts every time it pops back, so the face itself says «tap me» */}
      {state === "offering" ? (
        <>
          <g fill="none" stroke={COLOR.offering} strokeWidth="1.6">
            {[0, 1].map((ring) => (
              <circle
                key={ring}
                cx="32"
                cy="32"
                r="27"
                style={{ transformOrigin: "32px 32px", animation: `mascot-tap-ring 1.6s ease-out ${(0.3 + ring * 0.8).toFixed(2)}s infinite`, opacity: 0 }}
              />
            ))}
          </g>
          {detailed ? (
            <g style={{ transformOrigin: "32px -3px", animation: "mascot-offer-card 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}>
              <rect x="20" y="-11" width="15" height="11" rx="2.5" fill="var(--surface)" stroke={COLOR.offering} strokeWidth="1.4" opacity="0.7" transform="rotate(-6 27.5 -5.5)" />
              <rect x="25" y="-9" width="15" height="11" rx="2.5" fill="var(--surface)" stroke={COLOR.offering} strokeWidth="1.4" />
              <path d="M28 -5h9M28 -1.5h5" stroke={COLOR.offering} strokeWidth="1.1" strokeLinecap="round" />
            </g>
          ) : null}
        </>
      ) : null}

      {/* calling: «!» over the head, popping in time with the hops — the order is waiting */}
      {state === "calling" ? (
        <g style={{ transformOrigin: "46px 2px", animation: "mascot-call-mark 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite", opacity: 0 }}>
          <path d="M46 -9 L46 -1" stroke={COLOR.calling} strokeWidth="4.4" strokeLinecap="round" />
          <circle cx="46" cy="3.4" r="2.2" fill={COLOR.calling} />
        </g>
      ) : null}

      {/* sleeping: two small z-s drift up from the head, one after the other */}
      {asleep ? (
        <g fill="var(--text-muted)" fontFamily="var(--font-display), system-ui, sans-serif" fontWeight="700">
          <text x="50" y="12" fontSize="8" style={{ transformOrigin: "52px 12px", animation: "mascot-zzz 3.5s ease-out infinite", opacity: 0 }}>
            z
          </text>
          <text x="56" y="4" fontSize="6" style={{ transformOrigin: "58px 4px", animation: "mascot-zzz 3.5s ease-out 1.75s infinite", opacity: 0 }}>
            z
          </text>
        </g>
      ) : null}

      {/* processing: the store the assistant plugs into, and the data crossing into the head */}
      {reading ? (
        <>
          <g style={{ transformOrigin: "-5px 17px", animation: "mascot-store 1.9s both", opacity: 0 }}>
            <path d="M-12 13 V21 A7 2.6 0 0 0 2 21 V13 Z" fill="var(--surface)" stroke={COLOR.processing} strokeWidth="1.4" />
            <ellipse cx="-5" cy="13" rx="7" ry="2.6" fill="var(--surface)" stroke={COLOR.processing} strokeWidth="1.4" />
            <path d="M-12 17.4 A7 2.6 0 0 0 2 17.4" fill="none" stroke={COLOR.processing} strokeWidth="1.1" opacity="0.65" />
          </g>
          {[0, 1, 2].map((bit) => (
            <circle
              key={bit}
              cx="1"
              cy="17"
              r="1.6"
              fill={COLOR.processing}
              style={{ transformOrigin: "1px 17px", animation: `mascot-data-bit 0.3s ${(0.06 + bit * 0.1).toFixed(2)}s 2 forwards`, opacity: 0 }}
            />
          ))}
        </>
      ) : null}

      {/* happy: two sparks pop beside the blob in turn */}
      {state === "happy" ? (
        <g fill={COLOR.happy}>
          <path
            d="M8 16 L9.6 20.4 L14 22 L9.6 23.6 L8 28 L6.4 23.6 L2 22 L6.4 20.4 Z"
            style={{ transformOrigin: "8px 22px", animation: "mascot-spark 3.8s infinite", opacity: 0 }}
          />
          <path
            d="M56 6 L57.2 9.2 L60.4 10.4 L57.2 11.6 L56 14.8 L54.8 11.6 L51.6 10.4 L54.8 9.2 Z"
            style={{ transformOrigin: "56px 10.4px", animation: "mascot-spark 3.8s 1.9s infinite", opacity: 0 }}
          />
        </g>
      ) : null}

      {/* voice: swell and dip follow the microphone (one transform, no re-layout) */}
      <g
        data-face
        style={{
          transformOrigin: "32px 60px",
          transform: `translateY(${dip.toFixed(2)}px) scale(${swell.toFixed(3)})`,
          transition: "transform 90ms linear",
          // the only transform JS rewrites frame by frame; promoted while it does, released after
          willChange: state === "listening" ? "transform" : "auto",
        }}
      >
        {/* pose: one-shot on entry */}
        <g style={{ transformOrigin: "32px 52px", animation: POSE[state] }}>
          {/* loop: the body's own motion */}
          <g style={{ transformOrigin: "32px 44px", animation: BODY[state] }}>
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

            {/* listening: the ear pricks up on the right and twitches now and then */}
            {state === "listening" ? (
              <g style={{ transformOrigin: "53px 26px", animation: "mascot-ear-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both" }}>
                <g style={{ transformOrigin: "53px 26px", animation: "mascot-ear-twitch 3.2s ease-in-out 1s infinite" }}>
                  {/* a proper ear: a rounded lobe standing out of the head, with a darker hollow */}
                  <path d="M52 16 C58 8 69 12 68 22 C67.5 29 61 33 55 31 C53 30 51.5 28 52 26 Z" fill={COLOR.listening} />
                  <path d="M56 19 C60 15.5 65.5 18.5 64.5 24 C64 27.5 60 29.5 57.5 27.5 C56 26.5 55.5 24.5 56.5 23 Z" fill="var(--bg)" opacity="0.26" />
                </g>
              </g>
            ) : null}

            {/* alert: one small ear up on the crown — the animal sign of «насторожился»,
                without a single angry line on the face (D-70) */}
            {state === "alert" ? (
              <g style={{ transformOrigin: "44px 12px", animation: "mascot-ear-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both" }}>
                <g style={{ transformOrigin: "44px 12px", animation: "mascot-alert-ear 4.6s ease-in-out infinite" }}>
                  <path d="M41 12 C42 2 50 -1 52 5 C53.5 10 50 15 46 15 C43.5 15 41.5 14 41 12 Z" fill={COLOR.alert} />
                  <path d="M43.5 11 C44 5.5 48 3.5 49.5 7 C50.5 10 48.5 12.5 46 12.5 C44.5 12.5 43.6 12 43.5 11 Z" fill="var(--bg)" opacity="0.26" />
                </g>
              </g>
            ) : null}

            {/* happy: a soft blush under the eyes */}
            {squint ? (
              <g fill="#ffffff" opacity="0.22" style={{ animation: "mascot-blush 3.8s infinite" }}>
                <ellipse cx="17" cy="40" rx="4" ry="2" />
                <ellipse cx="47" cy="40" rx="4" ry="2" />
              </g>
            ) : null}

            <g style={{ transformOrigin: "32px 33px", animation: DRAG[state] ?? "none" }}>
              <g fill="var(--bg)" style={{ transformOrigin: "32px 33px", animation: EYES[state] }}>
                {/* The eye keeps one geometry and changes shape by transform: animating rx/ry
                    would re-run layout and paint of the SVG on every frame of the change. */}
                <g style={{ transformOrigin: "24px 33px", animation: blink }}>
                  <g style={{ transformOrigin: "24px 33px", transform: eyeShape, transition: "transform 120ms var(--ease-out)" }}>
                    <ellipse cx="24" cy="33" rx={EYE_RX} ry={EYE_RY} style={{ animation: reading ? "mascot-eye-return 1.9s both" : undefined }} />
                  </g>
                </g>
                {/* both lids on one animation, no offset: a face blinks with both eyes at once */}
                <g style={{ transformOrigin: "40px 33px", animation: blink }}>
                  <g style={{ transformOrigin: "40px 33px", transform: eyeShape, transition: "transform 120ms var(--ease-out)" }}>
                    <ellipse cx="40" cy="33" rx={EYE_RX} ry={EYE_RY} style={{ animation: reading ? "mascot-eye-return 1.9s both" : undefined }} />
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
                {squint ? (
                  // a tiny smile only when happy — still no mouth in every other state
                  <path d="M26 43 Q32 48 38 43" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
                ) : null}
                {startled ? (
                  // a small «o»: the face has just noticed something
                  <ellipse cx="32" cy="46.5" rx="2.6" ry="3" />
                ) : null}
                {angry ? (
                  <>
                    {/* the brows sit just above the enlarged lid — on it they merge with the eye into one dark visor */}
                    <path d="M17.6 23.4 L29.4 27.6" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M46.4 23.4 L34.6 27.6" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M27 45 Q32 42 37 45" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
                  </>
                ) : null}
                {bored ? <path d="M27 45 Q32 43.8 37 45" fill="none" stroke="var(--bg)" strokeWidth="1.7" strokeLinecap="round" /> : null}
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
              </g>
            </g>
          </g>
        </g>
      </g>

      {/* processing: the new status itself — the tick lands with the top of the hop, and it
          is drawn last so the badge sits on the face instead of under it */}
      {reading ? (
        <g style={{ transformOrigin: "55px 9px", animation: "mascot-check-pop 1.9s both", opacity: 0 }}>
          <circle cx="55" cy="9" r="7.5" fill="var(--ok)" />
          <path d="M51.4 9.4 l2.5 2.5 L58.8 6.4" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
      {/* sending: the card in the hand leaves at the throw (timed to mascot-throw) and flies
          up and away — the message the director just gave, going to its addressee */}
      {state === "sending" && detailed ? (
        <g style={{ transformOrigin: "42px 12px", animation: "mascot-throw-card 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) infinite", opacity: 0 }}>
          <rect x="34" y="5" width="17" height="12" rx="3" fill="var(--surface)" stroke={COLOR.sending} strokeWidth="1.5" />
          <path d="M37.5 9.5h10M37.5 13h6" stroke={COLOR.sending} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ) : null}

    </svg>
  );
}
