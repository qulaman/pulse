"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Blend } from "@/components/brand/Blend";
import { Glyph } from "@/components/brand/mark/glyphs";
import { SCENE_GLYPH, SECRETARY_TONE, SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import { untilLine, type DeskPhase, type DeskScene, type Urgency } from "@/lib/errands/scene";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import { useDeepRest } from "@/lib/useDeepRest";

/** The desk is drawn in this box; the screen places the box, not its parts. */
export const DESK_W = 100;
export const DESK_H = 72;
/** Where the small face sits inside the box: its middle, for the big face to look at. */
export const DESK_FACE = { x: 30, y: 34 };

const EDGE = "color-mix(in srgb, var(--border) 70%, var(--text-muted))";
/** How long the walk out of the frame or back to the chair takes (D-103). */
const MOVE_MS = 1_600;
/** The nod of «увидел» (D-106 §8). */
const NOD_MS = 1_400;

/**
 * The secretary on the waiting screen (D-85, D-207): not a circle among the idlers and not a ball on
 * the orbit, but a small mark of its own to the right of the big one — the mascot's mark in the
 * secretary's teal, with a headset — and a small screen beside it. A tap turns it to the big face
 * (and the big face to it), and only then do the errand buttons come out over the head.
 *
 * The screen says what the secretary is busy with: lines being written while nobody asks; the
 * thing asked for, a frame that calls until somebody takes it, a tick of «увидел» and the minutes
 * promised once somebody has. The small mark carries the same thing in its ring. Everything moves
 * on transform and opacity.
 *
 * Stepped away («не на месте»), the mark slides out of the frame and an empty ring is left; back,
 * it slides in. After «Готово» it leans over to the big face with the tick.
 */
export function SecretaryDesk({
  attending,
  count,
  tone,
  label,
  scene = null,
  phase = "rest",
  urgency = 0,
  away = null,
  seen = false,
  waiting = 0,
  etaLeft = null,
  asking = false,
  listening = false,
  onTap,
  onHold,
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
  /** every secretary has stepped away — until when (D-99): an empty chair, a caption */
  away?: string | null;
  /**
   * the secretary has opened the request nobody has taken yet (D-106 §8): a nod to the big
   * face the moment it happens, then a check on the monitor; null — not known yet (loading)
   */
  seen?: boolean | null;
  /** requests kept on the phone without network (D-106): «ждёт связи» under the desk */
  waiting?: number;
  /** minutes left of what the secretary promised on «Принял»; the monitor counts them down */
  etaLeft?: number | null;
  /** the secretary has asked something and waits for the director's answer */
  asking?: boolean;
  /** the director is saying a request into the desk right now */
  listening?: boolean;
  onTap: () => void;
  /** holding the desk: the director says a request to the secretary in his own words (D-99) */
  onHold?: (down: boolean) => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const release = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (held.current) {
      held.current = false;
      onHold?.(false);
      return true;
    }
    return false;
  };
  const still = attending ? "sec-paused" : "";
  // the monitor shows the job while there is one; the typing lines otherwise
  const working = (phase === "asked" || phase === "doing") && scene !== null;
  const handing = phase === "done" && !attending;
  // «ушёл / вернулся»: the moment the presence turns, the secretary walks out of the frame or
  // back to the chair — the chair is shown empty only once the walk out is over
  const [seenAway, setSeenAway] = useState(Boolean(away));
  const [move, setMove] = useState<"leave" | "arrive" | null>(null);
  if (seenAway !== Boolean(away)) {
    setSeenAway(Boolean(away));
    setMove(away ? "leave" : "arrive");
  }
  useEffect(() => {
    if (!move) return;
    const timer = setTimeout(() => setMove(null), MOVE_MS);
    return () => clearTimeout(timer);
  }, [move]);
  const gone = Boolean(away) && move !== "leave";
  // «увидел»: the nod plays on the turn from unseen to seen, not on a screen opened after it —
  // the first value known (after loading, or for a new request) is only where counting starts
  const saw = seen === true && phase === "asked";
  const [sawBefore, setSawBefore] = useState<boolean | null>(seen === null ? null : saw);
  const [nod, setNod] = useState(false);
  if (seen === null) {
    if (sawBefore !== null) setSawBefore(null);
  } else if (sawBefore === null) {
    setSawBefore(saw);
  } else if (sawBefore !== saw) {
    setSawBefore(saw);
    if (saw) setNod(true);
  }
  useEffect(() => {
    if (!nod) return;
    const timer = setTimeout(() => setNod(false), NOD_MS);
    return () => clearTimeout(timer);
  }, [nod]);
  const nodding = nod && saw && !move && !attending;
  // deep rest (nobody has touched the screen for minutes): a desk with nothing to show stops where
  // it is — it is the costliest thing on the waiting screen after the dream (D-119); anything the
  // director should see (a request, a job, a walk) keeps moving
  const deep = useDeepRest();
  const season = useMascotSeason();
  const frozen = deep && phase === "rest" && !attending && !move && !nodding;
  // walking out or in; typing; the small hop of turning round to the big face; or, after «Готово»,
  // the walk over to the big face with the job in hand and back (D-97)
  const motion = move
    ? `${move === "leave" ? "bk-d-leave" : "bk-d-arrive"} ${MOVE_MS}ms ease-in-out both`
    : nodding
      ? `bk-d-nod ${NOD_MS}ms ease-in-out both`
      : attending
        ? "bk-d-turn 380ms cubic-bezier(0.34, 1.5, 0.64, 1) both"
        : handing
          ? "bk-d-handoff 2.2s ease-in-out both"
          : "none";
  return (
    <button
      type="button"
      // a tap asks with the buttons; a hold (≥350 ms) records a request in the director's own
      // words; the keyboard still gets the tap
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
      onPointerDown={() => {
        held.current = false;
        if (!onHold) return;
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          held.current = true;
          onHold(true);
        }, 350);
      }}
      onPointerUp={() => {
        if (!release()) onTap();
      }}
      onPointerCancel={() => void release()}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={label}
      aria-pressed={attending}
      data-testid="secretary-desk"
      data-attending={attending ? "1" : "0"}
      className={`relative block transition-transform duration-[120ms] active:scale-[0.96] ${frozen ? "sec-paused" : ""}`}
      data-away={away ? "1" : "0"}
      style={{
        width: DESK_W,
        height: DESK_H,
        touchAction: "none",
        // iOS: a hold to dictate must not open the callout menu or the magnifier (D-106 §9)
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* the small screen beside the mark */}
      <svg aria-hidden width={DESK_W} height={DESK_H} viewBox={`0 0 ${DESK_W} ${DESK_H}`} className={`absolute inset-0 overflow-visible ${still}`}>
        {/* a dark screen and the work on it */}
        <g data-testid="desk-monitor">
        <rect x="56" y="17" width="38" height="27" rx="7" fill="var(--surface)" stroke={SECRETARY_TONE} strokeWidth="1.6" />
        {working && scene ? (
          // the job on the screen: its picture, and a pulsing frame while nobody has taken it
          <g>
            {phase === "asked" ? (
              // seen and not late: the frame calms down to a still green — the secretary is on it
              <rect
                x="57.5"
                y="18.5"
                width="35"
                height="24"
                rx="3"
                fill="none"
                stroke={urgency === 2 ? "var(--danger)" : saw ? "var(--ok)" : "var(--warn)"}
                strokeWidth="1.4"
                style={saw && urgency < 2 ? { opacity: 0.7 } : { animation: `smc-glow ${urgency === 2 ? "0.6s" : "1.2s"} ease-in-out infinite` }}
              />
            ) : null}
            {saw ? (
              // «увидел»: a small check in the corner of the monitor
              <g data-testid="desk-seen">
                <circle cx="61.5" cy="22.5" r="3.4" fill="var(--ok)" />
                <path d="M59.9 22.6 l1.1 1.1 l2.1 -2.3" fill="none" stroke="var(--bg)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ) : null}
            {/* the thing asked for, as the mark draws it; the nested drawing is a 64-box round its own middle */}
            <g
              transform={`translate(75 ${etaLeft !== null ? 27.5 : 30.5}) scale(${etaLeft !== null ? 0.2 : 0.28}) translate(-32 -32)`}
              style={{ color: urgency === 2 && phase === "asked" ? "var(--danger)" : "var(--accent)", "--bk-ink": "var(--surface)" } as CSSProperties}
              className="bk-glyph"
            >
              <Glyph id={SCENE_GLYPH[scene]} />
            </g>
            {etaLeft !== null ? (
              // the promise counting down: «4 мин», then «вот-вот», then late in the warning colour
              <text
                x="75"
                y="41"
                textAnchor="middle"
                fontSize="6.4"
                fontWeight="800"
                fill={etaLeft < -1 ? "var(--warn)" : "var(--text)"}
                data-testid="desk-eta"
              >
                {etaLeft > 0 ? `${etaLeft} мин` : etaLeft >= -1 ? "вот-вот" : `+${-etaLeft} мин`}
              </text>
            ) : null}
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
                style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: `sec-line 5.6s ease-out ${line.d}s infinite` }}
              />
            ))}
            <rect x="74" y="34" width="2" height="4" rx="0.6" fill="var(--accent)" style={{ animation: "sec-cursor 3.6s steps(1) infinite" }} />
          </>
        )}
        </g>
      </svg>

      {gone ? (
        // nobody at the desk (D-99): an empty ring where the mark was, the caption says until when
        <svg aria-hidden width={DESK_W} height={DESK_H} viewBox={`0 0 ${DESK_W} ${DESK_H}`} className="absolute inset-0 overflow-visible" data-testid="desk-empty">
          <circle cx={DESK_FACE.x} cy={DESK_FACE.y} r="15" fill="none" stroke={EDGE} strokeWidth="1.6" strokeDasharray="2.4 4.4" strokeLinecap="round" />
        </svg>
      ) : null}
      {waiting > 0 ? (
        // kept on the phone, it goes by itself once the network is back (D-106); the empty
        // chair already says the secretary is away, so this caption takes the line
        <span
          className="absolute left-0 top-full mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-3"
          style={{ color: "var(--warn)" }}
          data-testid="desk-waiting"
        >
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)", animation: "smc-glow 1.2s ease-in-out infinite" }} />
          ждёт связи{waiting > 1 ? ` · ${waiting}` : ""}
        </span>
      ) : away ? (
        <span className="absolute left-0 top-full mt-0.5 whitespace-nowrap text-[11px] font-medium leading-3" style={{ color: "var(--warn)" }}>
          не на месте {untilLine(away)}
        </span>
      ) : null}
      {/* the small mark: the secretary's own (D-87, D-207) — the headset on the ring */}
      <span
        hidden={gone}
        className="absolute block"
        style={{ left: DESK_FACE.x - 20, top: DESK_FACE.y - 20, width: 40, height: 40, "--accent": SECRETARY_TONE } as CSSProperties}
        data-testid="desk-secretary"
        data-move={move ?? undefined}
        data-nod={nodding ? "1" : undefined}
      >
        <span className="block">
          {/* a turn from one of these to another starts from where the last one left the body */}
          <Blend k={motion} origin="50% 100%" html>
          <span className="block" style={{ transformOrigin: "50% 100%", animation: motion }}>
            <SecretaryMascot
              mini
              season={season}
              size={40}
              // turned to the big face it shows nothing of its own; out of the frame or back in — the look of the way
              scene={move || attending ? null : scene}
              phase={move || attending ? "rest" : phase}
              urgency={urgency}
              // looking at the big face, or at the monitor while typing; a job has its own look
              look={
                move
                  ? { x: move === "leave" ? 1 : -1, y: 0 }
                  : attending || listening || nodding || handing
                    ? { x: -1, y: -0.2 }
                    : working
                      ? null
                      : { x: 0.9, y: 0.15 }
              }
            />
          </span>
          </Blend>
        </span>
        {asking ? (
          // a question waits for the director's answer: «?» over the small head
          <span
            className="absolute -right-2 -top-3 flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-black leading-none text-bg"
            style={{ background: "var(--warn)", animation: "smc-glow 1.2s ease-in-out infinite" }}
            data-testid="desk-question"
          >
            ?
          </span>
        ) : null}
      </span>

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
