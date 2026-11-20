import type { CSSProperties } from "react";

import { CONFETTI } from "@/components/brand/confetti";
import { ACT_OUT, FADE_OUT, Linger } from "@/components/brand/Linger";
import { BoardActOver, BRINGS_LETTER, ErrorActOver, Hourglass, Letter, WorkActOver } from "@/components/brand/MascotWork";
import type { MascotState } from "@/components/brand/Mascot";
import { COLOR, type MascotPose } from "@/lib/mascot/pose";

/**
 * Over the whole face, drawn last: the hourglass on the ground, the unread envelope by the head,
 * what flies in an act, the tick of a new status, the thrown card, the steam off the cup, the
 * confetti, and the one-shots of a face at rest — the snore bubble, the mumble, the wink's glint,
 * the whistle's notes, the hearts.
 */
export function MascotOverlays({ state, pose, side }: { state: MascotState; pose: MascotPose; side: string | undefined }) {
  const { acting, detailed, flip, reading } = pose;
  return (
    <>
      {/* everything handed over: the hourglass stands on the ground by the face and runs until the
          director answers — it is not held, so it does not breathe with the body */}
      <Linger show={state === "awaiting" && detailed}>
        {state === "awaiting" && detailed ? <Hourglass /> : null}
      </Linger>
      {/* nervous: the unread word itself, by the head (D-110) — unless it is flying in or being opened */}
      <Linger show={state === "nervous" && detailed && !(acting && BRINGS_LETTER.has(acting))} origin="50% 50%">
        {state === "nervous" && detailed && !(acting && BRINGS_LETTER.has(acting)) ? <Letter /> : null}
      </Linger>
      {/* what flies in the work's acts: the card caught, stashed, put aside, thrown up, back to
          redo; the «?», the letter, the clock, the coin (D-110) */}
      <Linger show={acting !== null} out={ACT_OUT} origin="50% 50%">
        {acting ? (
          <g transform={side}>
            <WorkActOver act={acting} flip={flip} />
            <BoardActOver act={acting} flip={flip} />
            <ErrorActOver act={acting} flip={flip} />
          </g>
        ) : null}
      </Linger>

      {/* processing: the new status itself — the tick lands with the top of the hop, and it
          is drawn last so the badge sits on the face instead of under it */}
      {reading ? (
        <g style={{ transformOrigin: "55px 9px", animation: "mascot-check-pop 1.9s both", opacity: 0 }}>
          <circle cx="55" cy="9" r="7.5" fill="var(--ok)" />
          <path d="M51.4 9.4 l2.5 2.5 L58.8 6.4" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
      {/* sending: the card leaves the hand at the throw (timed to mascot-throw) and flies up and
          away — the message the director just gave, going to its addressee. Through the wind-up it
          was behind the head (the copy drawn under the body); here it comes over the crown */}
      {state === "sending" && detailed ? (
        <g style={{ transformOrigin: "42px 12px", animation: "mascot-throw-card 1.2s linear infinite", opacity: 0 }}>
          <rect x="34" y="5" width="17" height="12" rx="3" fill="var(--surface)" stroke={COLOR.sending} strokeWidth="1.5" />
          <path d="M37.5 9.5h10M37.5 13h6" stroke={COLOR.sending} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ) : null}

      {/* serving: steam off the cup, two curls in turn, over the body */}
      <Linger show={state === "serving" && detailed} out={FADE_OUT}>
        {state === "serving" && detailed ? (
          <g fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
            {[49.5, 55].map((x, curl) => (
              <path
                key={x}
                d={`M${x} 44 c-2.2 -2.6 2.2 -4.2 0 -6.8 c-2.2 -2.6 2.2 -4.2 0 -6.8`}
                style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mascot-steam 2.4s ease-out ${(0.4 + curl * 1.2).toFixed(1)}s infinite`, opacity: 0 }}
              />
            ))}
          </g>
        ) : null}
      </Linger>

      {/* celebrating: the confetti goes up off the crown, opens out and falls */}
      <Linger show={state === "celebrating" && detailed} out={FADE_OUT}>
        {state === "celebrating" && detailed ? (
          <g data-confetti>
            {CONFETTI.map((bit, index) => (
              <rect
                key={index}
                x="31"
                y="4"
                width={bit.round ? 2.4 : 3}
                height={bit.round ? 2.4 : 1.8}
                rx={bit.round ? 1.2 : 0.4}
                fill={bit.color}
                style={
                  {
                    "--cx": `${bit.x}px`,
                    "--cy": `${bit.y}px`,
                    "--cr": `${bit.r}deg`,
                    transformBox: "fill-box",
                    transformOrigin: "50% 50%",
                    animation: `mascot-confetti 2.6s cubic-bezier(0.15, 0.7, 0.3, 1) ${(0.12 + (index % 3) * 0.05).toFixed(2)}s infinite`,
                    opacity: 0,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        ) : null}
      </Linger>

      {/* snore: a bubble swells at the mouth with the breath out and pops */}
      {acting === "snore" ? (
        <g style={{ transformBox: "fill-box", transformOrigin: "10% 60%", animation: "mascot-act-bubble 2.8s ease-in-out both", opacity: 0 }}>
          <circle cx="42" cy="47.5" r="7" fill="#ffffff" fillOpacity="0.16" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.9" />
          <ellipse cx="39.8" cy="44.8" rx="1.9" ry="1.2" fill="#ffffff" opacity="0.55" />
        </g>
      ) : null}

      {/* mumble: talking in its sleep — a small bubble of dots, no words */}
      {acting === "mumble" ? (
        <g style={{ transformBox: "fill-box", transformOrigin: "0% 100%", animation: "mascot-act-pop 2.6s ease-in-out both", opacity: 0 }}>
          <circle cx="45" cy="9.5" r="1.1" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="0.9" />
          <circle cx="47.6" cy="6" r="1.6" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="0.9" />
          <rect x="47" y="-6.5" width="18" height="10" rx="5" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1" />
          {[0, 1, 2].map((dot) => (
            <circle
              key={dot}
              cx={51.5 + dot * 4.5}
              cy="-1.5"
              r="1.2"
              fill="var(--text-muted)"
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `mascot-typing 0.9s ease-in-out ${(0.3 + dot * 0.15).toFixed(2)}s infinite` }}
            />
          ))}
        </g>
      ) : null}

      {/* wink: a glint beside the eye that closed */}
      {acting === "wink" ? (
        <path
          d="M53 18 L54.2 21.3 L57.5 22.5 L54.2 23.7 L53 27 L51.8 23.7 L48.5 22.5 L51.8 21.3 Z"
          fill="var(--gold)"
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-glint 1.3s ease-out both", opacity: 0 }}
        />
      ) : null}

      {/* whistle: a tune — three notes leave the pursed mouth sideways, under the right eye, and only
          rise once they are past the cheek (started at the eye, they were drawn over it) */}
      {acting === "whistle" ? (
        <g fill="var(--text)" stroke="var(--text)" opacity="0.85">
          {[0, 1, 2].map((note) => (
            <g key={note} transform={`translate(${39 + note * 0.8} ${48.5 - note * 0.6})`}>
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mascot-act-note 1.4s ease-out ${(0.2 + note * 0.55).toFixed(2)}s both`, opacity: 0 }}>
                <ellipse cx="0" cy="0" rx="2.3" ry="1.7" transform="rotate(-22)" stroke="none" />
                <path d="M2 -0.6 V-8.4 L5.6 -6.8" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          ))}
        </g>
      ) : null}

      {/* heart: love for whoever is looking — a heart goes up off the crown, a smaller one after it */}
      {acting === "heart" ? (
        <g fill="var(--danger)">
          {[
            { x: 32, y: 2, s: 1, d: 0 },
            { x: 45, y: 6, s: 0.62, d: 0.5 },
          ].map((heart) => (
            <g key={heart.x} transform={`translate(${heart.x} ${heart.y}) scale(${heart.s})`}>
              <path
                d="M0 3.4 C-6.4 -1.4 -5.8 -7.4 -2.8 -7.4 C-1.3 -7.4 -0.3 -6.3 0 -5.2 C0.3 -6.3 1.3 -7.4 2.8 -7.4 C5.8 -7.4 6.4 -1.4 0 3.4 Z"
                style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mascot-act-heart ${(2.4 - heart.d).toFixed(1)}s ease-out ${heart.d}s both`, opacity: 0 }}
              />
            </g>
          ))}
        </g>
      ) : null}
    </>
  );
}
