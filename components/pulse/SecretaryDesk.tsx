"use client";

import type { CSSProperties } from "react";

import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import { Glyph, SECRETARY_TONE } from "@/components/secretary/secretaryRoom";
import type { DeskPhase, DeskScene, Urgency } from "@/lib/errands/scene";

/** The desk is drawn in this box; the screen places the box, not its parts. */
export const DESK_W = 100;
export const DESK_H = 72;
/** Where the small face sits inside the box: its middle, for the big face to look at. */
export const DESK_FACE = { x: 30, y: 34 };

const EDGE = "color-mix(in srgb, var(--border) 70%, var(--text-muted))";

/**
 * The secretary on the waiting screen (D-85): not a circle among the idlers and not a ball on
 * the orbit, but a small face of its own at a desk to the right of the big one — typing, the
 * lines running on its monitor, steam rising off the mug. A tap turns it to the big face (and
 * the big face to it), and only then do the errand buttons come out over the head.
 *
 * Three layers, so the face sits between them: the desk, monitor and mug behind, the small
 * face, the keyboard in front of it. Everything moves on transform and opacity; the desk's
 * own motion stops while the secretary is looking at the director's face.
 */
export function SecretaryDesk({
  attending,
  count,
  tone,
  label,
  scene = null,
  phase = "rest",
  urgency = 0,
  onTap,
}: {
  /** turned to the big face: the typing stops, the eyes go left */
  attending: boolean;
  /** errands in the air right now — a small badge on the monitor */
  count: number;
  /** the badge colour: waiting for somebody to take it, or taken */
  tone: string;
  label: string;
  /**
   * What the secretaries are doing about the director's requests right now (D-97): the small
   * secretary holds the job — the cup, the sign — and the monitor shows its picture; after
   * «Готово» it carries the cup over to the big face.
   */
  scene?: DeskScene | null;
  phase?: DeskPhase;
  urgency?: Urgency;
  onTap: () => void;
}) {
  const still = attending ? "sec-paused" : "";
  // the monitor shows the job while there is one; the typing lines otherwise
  const working = (phase === "asked" || phase === "doing") && scene !== null;
  const handing = phase === "done" && !attending;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      aria-pressed={attending}
      data-testid="secretary-desk"
      data-attending={attending ? "1" : "0"}
      className="relative block transition-transform duration-[120ms] active:scale-[0.96]"
      style={{ width: DESK_W, height: DESK_H, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
    >
      {/* behind: the desk, the monitor and the mug */}
      <svg aria-hidden width={DESK_W} height={DESK_H} viewBox={`0 0 ${DESK_W} ${DESK_H}`} className={`absolute inset-0 overflow-visible ${still}`}>
        {/* the desk: a top and two thin legs */}
        <rect x="0" y="52" width="100" height="4" rx="2" fill="color-mix(in srgb, var(--surface-2) 80%, white 7%)" />
        <path d="M8 56 V70 M92 56 V70" stroke={EDGE} strokeWidth="1.6" strokeLinecap="round" />

        {/* the mug, with steam that never stops rising while she works */}
        <path d="M2.5 42.5 H10.5 V49 A3 3 0 0 1 7.5 52 H5.5 A3 3 0 0 1 2.5 49 Z" fill="var(--surface)" stroke={EDGE} strokeWidth="1.2" />
        <path d="M10.5 44.5 a2.2 2.2 0 0 1 0 4.4" fill="none" stroke={EDGE} strokeWidth="1.2" />
        {[0, 1].map((puff) => (
          <path
            key={puff}
            d={puff === 0 ? "M5 40 q-1.4 -2.4 0 -4.8" : "M8 40 q1.4 -2.4 0 -4.8"}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.1"
            strokeLinecap="round"
            style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `sec-steam 2.4s ease-out ${puff * 1.2}s infinite`, opacity: 0 }}
          />
        ))}

        {/* the monitor: a stand, a dark screen, and the work on it */}
        <path d="M71 44 H79 L81 52 H69 Z" fill={EDGE} />
        <rect x="56" y="17" width="38" height="27" rx="4" fill="var(--surface)" stroke={SECRETARY_TONE} strokeWidth="1.6" />
        {working && scene ? (
          // the job on the screen: its picture, and a pulsing frame while nobody has taken it
          <g>
            {phase === "asked" ? (
              <rect
                x="57.5"
                y="18.5"
                width="35"
                height="24"
                rx="3"
                fill="none"
                stroke={urgency === 2 ? "var(--danger)" : "var(--warn)"}
                strokeWidth="1.4"
                style={{ animation: `smc-glow ${urgency === 2 ? "0.6s" : "1.2s"} ease-in-out infinite` }}
              />
            ) : null}
            <g transform="translate(75 30.5) scale(1.25)">
              <Glyph scene={scene} />
            </g>
          </g>
        ) : (
          <>
            {[
              { y: 24, w: 24, d: 0 },
              { y: 30, w: 18, d: 0.45 },
              { y: 36, w: 11, d: 0.9 },
            ].map((line) => (
              <path
                key={line.y}
                d={`M61 ${line.y} h${line.w}`}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: `sec-line 2.8s ease-out ${line.d}s infinite` }}
              />
            ))}
            <rect x="74" y="34" width="2" height="4" rx="0.6" fill="var(--accent)" style={{ animation: "sec-cursor 0.9s steps(1) infinite" }} />
          </>
        )}
      </svg>

      {/* the small face: the secretary's own character (D-87) — headset, bow tie — smaller */}
      <span
        className="absolute block"
        style={{ left: DESK_FACE.x - 20, top: DESK_FACE.y - 20, width: 40, height: 40, "--accent": SECRETARY_TONE } as CSSProperties}
      >
        <span
          className="block"
          style={{
            transformOrigin: "50% 100%",
            // typing; the small hop of turning round to the big face; or, after «Готово», the
            // walk over to the big face with the job in hand and back (D-97)
            animation: attending
              ? "sec-turn 380ms cubic-bezier(0.34, 1.5, 0.64, 1) both"
              : handing
                ? "smc-handoff 2.2s ease-in-out both"
                : working
                  ? "none"
                  : "sec-type 0.95s ease-in-out infinite",
          }}
        >
          <SecretaryMascot
            mini
            size={40}
            scene={attending ? null : scene}
            phase={attending ? "rest" : phase}
            urgency={urgency}
            // looking at the big face, or at the monitor while typing; a job has its own look
            look={attending ? { x: -1, y: -0.2 } : working || handing ? null : { x: 0.95, y: 0.1 }}
          />
        </span>
      </span>

      {/* in front: the keyboard under the small face's hands */}
      <svg aria-hidden width={DESK_W} height={DESK_H} viewBox={`0 0 ${DESK_W} ${DESK_H}`} className={`pointer-events-none absolute inset-0 overflow-visible ${still}`}>
        <rect x="36" y="48" width="24" height="5" rx="1.6" fill="color-mix(in srgb, var(--surface-2) 70%, white 10%)" stroke={EDGE} strokeWidth="0.8" />
        {[0, 1, 2, 3].map((key) => (
          <rect
            key={key}
            x={39 + key * 5}
            y="49.6"
            width="3"
            height="1.8"
            rx="0.5"
            fill="var(--accent)"
            style={{ animation: `sec-key 0.95s ease-in-out ${(key * 0.23).toFixed(2)}s infinite`, opacity: 0.3 }}
          />
        ))}
      </svg>

      {/* how many errands are in the air — the number the ball used to carry */}
      {count > 0 ? (
        <span
          className="nums absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-bg"
          style={{ left: 86, top: 10, background: tone, boxShadow: "0 0 0 2px var(--bg)" }}
          data-testid="secretary-count"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
