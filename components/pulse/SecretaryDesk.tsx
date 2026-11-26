"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Blend } from "@/components/brand/Blend";
import { SECRETARY_TONE, SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import { untilLine, type DeskPhase, type DeskScene, type Urgency } from "@/lib/errands/scene";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import { useDeepRest } from "@/lib/useDeepRest";

/** The secretary stands in this box; the screen places the box, not its parts. */
export const DESK_W = 56;
export const DESK_H = 56;
/** Where the small mark sits inside the box: its middle, for the big face to look at. */
export const DESK_FACE = { x: 28, y: 28 };
/** The side of the small mark. */
const MARK = 48;

const EDGE = "color-mix(in srgb, var(--border) 70%, var(--text-muted))";
/** How long the way out of the frame or back takes (D-103). */
const MOVE_MS = 1_600;
/** The nod of «увидел» (D-106 §8). */
const NOD_MS = 1_400;

const CAPTION = "absolute left-1/2 top-full mt-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-3";
const BADGE = "absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-bg";

/**
 * The secretary on the waiting screen (D-85, D-207, D-210): not a circle among the idlers and not a
 * ball on the orbit, but a small mark of its own to the right of the big one — the mascot's mark in
 * the secretary's teal, a bow tie under the ring, nothing beside it. A tap turns it to the big face
 * (and the big face's eye to it), and only then do the errand buttons come out over the head.
 *
 * Everything the director asked for lives inside its ring, where the dot was: the thing asked for
 * hopping until somebody takes it — amber, then red, the longer it waits — the thing at work once
 * somebody has, a tick after «Готово». Round the ring only what the ring cannot say: a green tick
 * of «увидел», the count of requests in the air, «?» of a question, and under it one line — the
 * minutes promised, «ждёт связи» or «не на месте». Everything moves on transform and opacity.
 *
 * Stepped away («не на месте»), the mark slides out and an empty ring is left; back, it slides in.
 * After «Готово» it leans over to the big face with the tick.
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
  /** turned to the big face: the eye goes left, nothing of its own in the ring */
  attending: boolean;
  /** errands in the air right now — a small badge at the ring */
  count: number;
  /** the badge colour: waiting for somebody to take it, or taken */
  tone: string;
  label: string;
  /** What the secretaries are doing about the director's requests right now (D-97): the thing in the ring. */
  scene?: DeskScene | null;
  phase?: DeskPhase;
  urgency?: Urgency;
  /** every secretary has stepped away — until when (D-99): an empty ring, a caption */
  away?: string | null;
  /**
   * the secretary has opened the request nobody has taken yet (D-106 §8): a nod to the big
   * face the moment it happens, then a tick at the ring; null — not known yet (loading)
   */
  seen?: boolean | null;
  /** requests kept on the phone without network (D-106): «ждёт связи» under the mark */
  waiting?: number;
  /** minutes left of what the secretary promised on «Принял»; the line under the mark counts them down */
  etaLeft?: number | null;
  /** the secretary has asked something and waits for the director's answer */
  asking?: boolean;
  /** the director is saying a request to the secretary right now */
  listening?: boolean;
  onTap: () => void;
  /** holding the mark: the director says a request to the secretary in his own words (D-99) */
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
  const handing = phase === "done" && !attending;
  // «ушёл / вернулся»: the moment the presence turns, the mark slides out of the frame or back —
  // the empty ring is shown only once the way out is over
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
  // deep rest (nobody has touched the screen for minutes): a mark with nothing to show stops where
  // it is (D-119); anything the director should see (a request, a job, a way out) keeps moving
  const deep = useDeepRest();
  const season = useMascotSeason();
  const frozen = deep && phase === "rest" && !attending && !move && !nodding;
  // out of the frame or in; the nod; the small hop of turning round to the big face; or, after
  // «Готово», the lean over to the big face with the tick and back (D-97)
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
      {gone ? (
        // nobody there (D-99): an empty ring where the mark was, the caption says until when
        <svg aria-hidden width={DESK_W} height={DESK_H} viewBox={`0 0 ${DESK_W} ${DESK_H}`} className="absolute inset-0 overflow-visible" data-testid="desk-empty">
          <circle cx={DESK_FACE.x} cy={DESK_FACE.y} r="18" fill="none" stroke={EDGE} strokeWidth="1.8" strokeDasharray="2.6 4.8" strokeLinecap="round" />
        </svg>
      ) : null}

      {/* the small mark: the secretary's own (D-87, D-207) — what was asked is in its ring */}
      <span
        hidden={gone}
        className="absolute block"
        style={{ left: DESK_FACE.x - MARK / 2, top: DESK_FACE.y - MARK / 2, width: MARK, height: MARK, "--accent": SECRETARY_TONE } as CSSProperties}
        data-testid="desk-secretary"
        data-move={move ?? undefined}
        data-nod={nodding ? "1" : undefined}
      >
        {/* a turn from one of these to another starts from where the last one left the mark */}
        <Blend k={motion} origin="50% 100%" html>
          <span className="block" style={{ transformOrigin: "50% 100%", animation: motion }}>
            <SecretaryMascot
              mini
              season={season}
              size={MARK}
              // turned to the big face it shows nothing of its own; on the way out or in — the look of the way
              scene={move || attending ? null : scene}
              phase={move || attending ? "rest" : phase}
              urgency={urgency}
              // the way it goes; the big face while it listens, nods or hands the job over; else it looks about
              look={move ? { x: move === "leave" ? 1 : -1, y: 0 } : attending || listening || nodding || handing ? { x: -1, y: -0.2 } : null}
            />
          </span>
        </Blend>
        {saw ? (
          // «увидел»: a green tick at the ring — the secretary is on it, nobody has taken it yet
          <span className={`${BADGE} -bottom-1 -left-1 h-4 min-w-4 px-0`} style={{ background: "var(--ok)", boxShadow: "0 0 0 2px var(--bg)" }} data-testid="desk-seen">
            <svg aria-hidden width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5.3 4.1 7.3 8 3" />
            </svg>
          </span>
        ) : null}
        {asking ? (
          // a question waits for the director's answer: «?» at the ring
          <span className={`${BADGE} -left-1.5 -top-1.5 h-4 min-w-4 px-0 font-black`} style={{ background: "var(--warn)", animation: "smc-glow 1.2s ease-in-out infinite" }} data-testid="desk-question">
            ?
          </span>
        ) : null}
      </span>

      {/* how many errands are in the air — the number the ball used to carry */}
      {count > 0 ? (
        <span className={`nums ${BADGE} -right-1 -top-1`} style={{ background: tone, boxShadow: "0 0 0 2px var(--bg)" }} data-testid="secretary-count">
          {count}
        </span>
      ) : null}

      {/* one line under the mark: what the ring cannot say */}
      {waiting > 0 ? (
        // kept on the phone, it goes by itself once the network is back (D-106)
        <span className={CAPTION} style={{ color: "var(--warn)" }} data-testid="desk-waiting">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)", animation: "smc-glow 1.2s ease-in-out infinite" }} />
          ждёт связи{waiting > 1 ? ` · ${waiting}` : ""}
        </span>
      ) : away ? (
        <span className={CAPTION} style={{ color: "var(--warn)" }}>
          не на месте {untilLine(away)}
        </span>
      ) : etaLeft !== null && phase === "doing" && !attending ? (
        // the promise counting down: «4 мин», then «вот-вот», then late in the warning colour
        <span className={`nums ${CAPTION} font-bold`} style={{ color: etaLeft < -1 ? "var(--warn)" : "var(--text)" }} data-testid="desk-eta">
          {etaLeft > 0 ? `${etaLeft} мин` : etaLeft >= -1 ? "вот-вот" : `+${-etaLeft} мин`}
        </span>
      ) : null}
    </button>
  );
}
