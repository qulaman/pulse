/**
 * The assistant character «Капля» (D-45, docs/DESIGN.md §3): one soft blob, two eyes.
 * Director-facing neutral states only in the pilot: calm / listening / thinking / happy.
 * Perf contract: a single SVG, animation on transform and colour only, CSS-driven
 * breathing (keyframes live in app/globals.css), nothing on filter or box-shadow.
 */
export type MascotState = "calm" | "listening" | "thinking" | "happy";

const COLOR: Record<MascotState, string> = {
  calm: "var(--accent)",
  listening: "var(--accent)",
  thinking: "var(--warn)",
  happy: "var(--gold)",
};

const BREATH: Record<MascotState, string> = {
  calm: "6s",
  listening: "1.1s",
  thinking: "2.2s",
  happy: "3s",
};

export function Mascot({ state = "calm", size = 64 }: { state?: MascotState; size?: number }) {
  const squint = state === "happy";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      style={{ overflow: "visible", display: "block" }}
    >
      <g
        style={{
          transformOrigin: "32px 40px",
          animation: `mascot-breathe ${BREATH[state]} ease-in-out infinite`,
        }}
      >
        <path
          d="M32 4 C47 4 59 16 59 31 C59 47 47 60 32 60 C17 60 5 49 5 33 C5 18 17 4 32 4 Z"
          fill={COLOR[state]}
          style={{ transition: "fill var(--t-screen) var(--ease-out)" }}
        />
        <g fill="var(--bg)">
          <g style={{ transformOrigin: "24px 33px", animation: "mascot-blink 4.6s infinite" }}>
            <ellipse cx="24" cy="33" rx="3.4" ry={squint ? 1.6 : 3.6} />
          </g>
          <g style={{ transformOrigin: "40px 33px", animation: "mascot-blink 4.6s 0.15s infinite" }}>
            <ellipse cx="40" cy="33" rx="3.4" ry={squint ? 1.6 : 3.6} />
          </g>
        </g>
      </g>
    </svg>
  );
}
