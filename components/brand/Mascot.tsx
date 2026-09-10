/**
 * The assistant character «Капля» (D-45, docs/DESIGN.md §3): one soft blob, two eyes.
 * Director-facing neutral states only in the pilot: calm / listening / thinking / happy.
 * Perf contract: a single SVG, animation on transform and colour only, CSS keyframes
 * (app/globals.css), nothing on filter or box-shadow. Pass `level` (0..1, from the
 * microphone) while listening — the blob swells with the voice.
 */
export type MascotState = "calm" | "listening" | "thinking" | "happy";

const COLOR: Record<MascotState, string> = {
  calm: "var(--accent)",
  listening: "var(--accent)",
  thinking: "var(--warn)",
  happy: "var(--gold)",
};

/** Body animation per state: breathing at rest, faster while listening, a bounce when happy. */
const BODY: Record<MascotState, string> = {
  calm: "mascot-breathe 6s ease-in-out infinite",
  listening: "mascot-breathe 1.1s ease-in-out infinite",
  thinking: "mascot-breathe 2.2s ease-in-out infinite",
  happy: "mascot-bounce 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite",
};

/** Eye animation per state: blink always; thinking glances sideways; listening looks up. */
const EYES: Record<MascotState, string> = {
  calm: "mascot-blink 4.6s infinite",
  listening: "mascot-blink 3.2s infinite, mascot-look-up 1.1s ease-in-out infinite",
  thinking: "mascot-blink 4.6s infinite, mascot-think 3.2s ease-in-out infinite",
  happy: "none",
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
  const swell = state === "listening" ? 1 + Math.min(1, Math.max(0, level)) * 0.18 : 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      style={{ overflow: "visible", display: "block" }}
    >
      {/* ground shadow: a static ellipse, no filters */}
      <ellipse cx="32" cy="61" rx="16" ry="2.5" fill="var(--bg)" opacity="0.5" />
      <g
        style={{
          transformOrigin: "32px 60px",
          transform: `scale(${swell.toFixed(3)})`,
          transition: "transform 90ms linear",
        }}
      >
        <g
          style={{
            transformOrigin: "32px 40px",
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
          <g fill="var(--bg)" style={{ transformOrigin: "32px 33px", animation: EYES[state] }}>
            <g style={{ transformOrigin: "24px 33px", animation: squint ? "none" : "mascot-blink 4.6s infinite" }}>
              <ellipse cx="24" cy="33" rx="3.4" ry={squint ? 1.5 : 3.6} />
            </g>
            <g style={{ transformOrigin: "40px 33px", animation: squint ? "none" : "mascot-blink 4.6s 0.15s infinite" }}>
              <ellipse cx="40" cy="33" rx="3.4" ry={squint ? 1.5 : 3.6} />
            </g>
            {squint ? (
              // a tiny smile only when happy — still no mouth in every other state
              <path d="M26 43 Q32 48 38 43" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
            ) : null}
          </g>
        </g>
      </g>
    </svg>
  );
}
