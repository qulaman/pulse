/**
 * The assistant character «Капля» (D-45, docs/DESIGN.md §3): one soft blob, two eyes.
 * Director-facing neutral states only in the pilot: calm / listening / thinking / happy,
 * plus «speaking» (D-49): the assistant is saying something — the mouth moves with the
 * words, the only state with a mouth besides the smile of «happy».
 * Each state has its own choreography — body, eyes and a small prop around the blob —
 * so the director reads the state at a glance without a caption.
 * Perf contract: a single SVG, animation on transform and opacity only, CSS keyframes
 * (app/globals.css), nothing on filter or box-shadow. Pass `level` (0..1, from the
 * microphone) while listening — the blob swells with the voice.
 */
export type MascotState = "calm" | "listening" | "thinking" | "happy" | "speaking";

const COLOR: Record<MascotState, string> = {
  calm: "var(--accent)",
  listening: "var(--accent)",
  thinking: "var(--warn)",
  happy: "var(--gold)",
  speaking: "var(--accent)",
};

/** Body: breathing at rest, an eager wobble while listening, a slow ponder tilt, a bounce when happy. */
const BODY: Record<MascotState, string> = {
  calm: "mascot-breathe 6s ease-in-out infinite",
  listening: "mascot-listen 0.9s ease-in-out infinite",
  thinking: "mascot-ponder 2.6s ease-in-out infinite",
  happy: "mascot-bounce 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite",
  speaking: "mascot-talk 1.3s ease-in-out infinite",
};

/** Eyes as a pair: a rare glance when calm, looking up while listening, wandering while thinking. */
const EYES: Record<MascotState, string> = {
  calm: "mascot-glance 9s ease-in-out infinite",
  listening: "mascot-look-up 0.9s ease-in-out infinite",
  thinking: "mascot-wander 2.6s ease-in-out infinite",
  happy: "none",
  speaking: "mascot-glance 9s ease-in-out infinite",
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
  const clamped = Math.min(1, Math.max(0, level));
  const swell = state === "listening" ? 1 + clamped * 0.18 : 1;
  const eyeRy = squint ? 1.5 : wide ? 4.3 : 3.6;
  const eyeRx = wide ? 3.7 : 3.4;

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

      {/* listening: sound rings ripple outwards, faster and wider with the voice */}
      {state === "listening" ? (
        <g style={{ transformOrigin: "32px 34px" }}>
          {[0, 1, 2].map((ring) => (
            <circle
              key={ring}
              cx="32"
              cy="34"
              r="30"
              fill="none"
              stroke={COLOR.listening}
              strokeWidth="1.6"
              style={{
                transformOrigin: "32px 34px",
                animation: `mascot-ring ${(1.8 - clamped * 0.6).toFixed(2)}s ease-out ${ring * 0.55}s infinite`,
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

      {/* happy: two sparks pop beside the blob in turn */}
      {state === "happy" ? (
        <g fill={COLOR.happy}>
          <path
            d="M8 16 L9.6 20.4 L14 22 L9.6 23.6 L8 28 L6.4 23.6 L2 22 L6.4 20.4 Z"
            style={{ transformOrigin: "8px 22px", animation: "mascot-spark 1.1s ease-out infinite", opacity: 0 }}
          />
          <path
            d="M56 6 L57.2 9.2 L60.4 10.4 L57.2 11.6 L56 14.8 L54.8 11.6 L51.6 10.4 L54.8 9.2 Z"
            style={{ transformOrigin: "56px 10.4px", animation: "mascot-spark 1.1s ease-out 0.5s infinite", opacity: 0 }}
          />
        </g>
      ) : null}

      <g
        style={{
          transformOrigin: "32px 60px",
          transform: `scale(${swell.toFixed(3)})`,
          transition: "transform 90ms linear",
        }}
      >
        <g
          style={{
            transformOrigin: "32px 44px",
            animation: BODY[state],
          }}
        >
          <path
            d="M32 4 C47 4 59 16 59 31 C59 47 47 60 32 60 C17 60 5 49 5 33 C5 18 17 4 32 4 Z"
            fill={COLOR[state]}
            style={{ transition: "fill var(--t-screen) var(--ease-out)" }}
          />
          {/* highlight: a lighter lens, colour only */}
          <ellipse cx="24" cy="18" rx="9" ry="5" fill="#ffffff" opacity="0.14" />

          {/* happy: a soft blush under the eyes */}
          {squint ? (
            <g fill="#ffffff" opacity="0.22">
              <ellipse cx="17" cy="40" rx="4" ry="2" />
              <ellipse cx="47" cy="40" rx="4" ry="2" />
            </g>
          ) : null}

          <g fill="var(--bg)" style={{ transformOrigin: "32px 33px", animation: EYES[state] }}>
            <g style={{ transformOrigin: "24px 33px", animation: squint ? "none" : "mascot-blink 4.6s infinite" }}>
              <ellipse cx="24" cy="33" rx={eyeRx} ry={eyeRy} style={{ transition: "ry 120ms" }} />
            </g>
            <g style={{ transformOrigin: "40px 33px", animation: squint ? "none" : "mascot-blink 4.6s 0.15s infinite" }}>
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
    </svg>
  );
}
