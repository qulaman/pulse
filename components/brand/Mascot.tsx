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
 *   sending      winds up and throws; the eyes follow the card (the card itself is the scene's)
 *   thinking     generic pondering — a tilt, wandering eyes, three dots
 *   speaking     the mouth moves with the words, small nods (D-49)
 *   happy        golden, squint and blush, a slow breath with sparks
 *   sleeping     eyes shut, the slowest breath, z-s drifting up — the screen before the first tap
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
  | "thinking"
  | "speaking"
  | "happy"
  | "sleeping";

const COLOR: Record<MascotState, string> = {
  calm: "var(--accent)",
  listening: "var(--accent)",
  saving: "var(--accent)",
  transcribing: "var(--warn)",
  parsing: "var(--warn)",
  sending: "var(--accent)",
  thinking: "var(--warn)",
  speaking: "var(--accent)",
  happy: "var(--gold)",
  sleeping: "color-mix(in srgb, var(--accent) 72%, var(--surface-2))",
};

/** One-shot pose on entering the state (outer group, keeps its end frame). */
const POSE: Record<MascotState, string> = {
  calm: "none",
  listening: "mascot-lean 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  saving: "none",
  transcribing: "mascot-tilt-read 0.5s var(--ease-out) both",
  parsing: "none",
  sending: "none",
  thinking: "none",
  speaking: "none",
  happy: "none",
  sleeping: "none",
};

/** Looping body motion (inner group). */
const BODY: Record<MascotState, string> = {
  calm: "mascot-breathe 6s ease-in-out infinite",
  listening: "mascot-nod 1.15s ease-in-out infinite",
  saving: "mascot-tuck 1.4s ease-in-out infinite",
  transcribing: "mascot-breathe 3s ease-in-out infinite",
  parsing: "mascot-ponder 2.6s ease-in-out infinite",
  sending: "mascot-throw 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  thinking: "mascot-ponder 2.6s ease-in-out infinite",
  speaking: "mascot-talk 1.3s ease-in-out infinite",
  happy: "mascot-breathe 5s ease-in-out infinite",
  sleeping: "mascot-breathe 8s ease-in-out infinite",
};

/** Eyes as a pair. */
const EYES: Record<MascotState, string> = {
  calm: "mascot-glance 9s ease-in-out infinite",
  listening: "mascot-attend 3.2s ease-in-out infinite",
  saving: "mascot-track-down 1.4s ease-in-out infinite",
  transcribing: "mascot-read 1.3s ease-in-out infinite",
  parsing: "mascot-look-cards 2.4s ease-in-out infinite",
  sending: "mascot-follow 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
  thinking: "mascot-wander 2.6s ease-in-out infinite",
  speaking: "mascot-glance 9s ease-in-out infinite",
  happy: "none",
  sleeping: "none",
};

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
  const clamped = Math.min(1, Math.max(0, level));
  const swell = state === "listening" ? 1 + clamped * 0.14 : 1;
  // the voice pushes the nod: louder — a deeper dip
  const dip = state === "listening" ? clamped * 2.2 : 0;
  const eyeRy = asleep ? 0.7 : squint ? 1.5 : lidded ? 2.2 : wide ? 4.3 : 3.6;
  const eyeRx = wide ? 3.7 : 3.4;
  const blink = squint || lidded || asleep ? "none" : "mascot-blink 4.6s infinite";

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
      {/* ground shadow: a static ellipse, no filters */}
      <ellipse cx="32" cy="61" rx="16" ry="2.5" fill="var(--bg)" opacity="0.5" />

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
                animation: `mascot-dot 1.5s ease-in-out ${dot * 0.22}s infinite`,
                opacity: 0,
              }}
            />
          ))}
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

      {/* sleeping: two small z-s drift up from the head, one after the other */}
      {asleep ? (
        <g fill="var(--text-muted)" fontFamily="var(--font-display), system-ui, sans-serif" fontWeight="700">
          <text x="50" y="12" fontSize="8" style={{ transformOrigin: "52px 12px", animation: "mascot-zzz 3.2s ease-out infinite", opacity: 0 }}>
            z
          </text>
          <text x="56" y="4" fontSize="6" style={{ transformOrigin: "58px 4px", animation: "mascot-zzz 3.2s ease-out 1.1s infinite", opacity: 0 }}>
            z
          </text>
        </g>
      ) : null}

      {/* happy: two sparks pop beside the blob in turn */}
      {state === "happy" ? (
        <g fill={COLOR.happy}>
          <path
            d="M8 16 L9.6 20.4 L14 22 L9.6 23.6 L8 28 L6.4 23.6 L2 22 L6.4 20.4 Z"
            style={{ transformOrigin: "8px 22px", animation: "mascot-spark 2.6s ease-out infinite", opacity: 0 }}
          />
          <path
            d="M56 6 L57.2 9.2 L60.4 10.4 L57.2 11.6 L56 14.8 L54.8 11.6 L51.6 10.4 L54.8 9.2 Z"
            style={{ transformOrigin: "56px 10.4px", animation: "mascot-spark 2.6s ease-out 1.3s infinite", opacity: 0 }}
          />
        </g>
      ) : null}

      {/* voice: swell and dip follow the microphone (one transform, no re-layout) */}
      <g
        style={{
          transformOrigin: "32px 60px",
          transform: `translateY(${dip.toFixed(2)}px) scale(${swell.toFixed(3)})`,
          transition: "transform 90ms linear",
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
            <ellipse cx="24" cy="18" rx="9" ry="5" fill="#ffffff" opacity="0.14" />

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

            {/* happy: a soft blush under the eyes */}
            {squint ? (
              <g fill="#ffffff" opacity="0.22">
                <ellipse cx="17" cy="40" rx="4" ry="2" />
                <ellipse cx="47" cy="40" rx="4" ry="2" />
              </g>
            ) : null}

            <g fill="var(--bg)" style={{ transformOrigin: "32px 33px", animation: EYES[state] }}>
              <g style={{ transformOrigin: "24px 33px", animation: blink }}>
                <ellipse cx="24" cy="33" rx={eyeRx} ry={eyeRy} style={{ transition: "ry 120ms" }} />
              </g>
              <g style={{ transformOrigin: "40px 33px", animation: blink === "none" ? "none" : "mascot-blink 4.6s 0.15s infinite" }}>
                <ellipse cx="40" cy="33" rx={eyeRx} ry={eyeRy} style={{ transition: "ry 120ms" }} />
              </g>
              {squint ? (
                // a tiny smile only when happy — still no mouth in every other state
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
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
