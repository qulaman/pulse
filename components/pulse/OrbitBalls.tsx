"use client";

import { animate, motion, PresenceContext, useMotionValue, useReducedMotion, type Transition } from "motion/react";
import { memo, useContext, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { springs } from "@/lib/design/tokens";
import { useHydrated } from "@/lib/useHydrated";

import { LocalPresence } from "./LocalPresence";
import { recede } from "./PanelCard";

export type OrbitId = "tasks" | "messages" | "ether" | "calendar" | "secretary" | "rating";

export type OrbitBall = {
  id: OrbitId;
  label: string;
  /** What the number in the ball counts; 0 leaves the ball quiet (icon only). */
  count: number;
  /** A CSS colour: the worst lane behind the tasks, warn for open questions, gold for Эфир. */
  tone: string;
  /**
   * Lit in its tone with nothing to count: the evening report asked for lights «Дела» without adding
   * to the number the tab's badge shows too (D-173).
   */
  lit?: boolean;
};

/**
 * Where the balls are: orbiting the awake face (`ring`), inside the resting head (`rest` — the ring
 * is kept, shrunk into the face), or in a row under the small face while a ball's card is open (`row`).
 */
export type BallsShow = "ring" | "rest" | "row";

const BALL = 60;
/** A ball with its label under it — the height the row takes under the face. */
export const BALL_H = BALL + 4 + 16;
/** One turn of the orbit; slow enough to read, fast enough to feel alive. */
const ORBIT_S = 28;
/** `orbit-spin` turns twenty times in one iteration (globals.css): an iteration end wakes the main thread. */
const TURNS = 20;
/** The way out of the head rides the face's own spring, so the balls and the face move as one (D-60); a thing's, no bounce (D-166). */
const SPRING = springs.object;
/** The ball itself pops to its size with a little life in it. */
const POP = { type: "spring", stiffness: 300, damping: 22 } as const;
/** One ball after another comes out of the head. */
const STAGGER_S = 0.04;
/** Into the head: quicker than out and gathering speed, as anything leaving does (D-166). */
const DIVE: Transition = { duration: 0.2, ease: [0.4, 0, 1, 1] };
const AT_ONCE: Transition = { duration: 0 };
/** Inside the head: at the face's middle, no size, behind the face. */
const INSIDE = { x: 0, y: 0, scale: 0, opacity: 0 };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ICON: Record<OrbitId, ReactNode> = {
  tasks: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <polyline points="4,7 6,9 9.5,5.5" />
      <line x1="12" y1="7" x2="20" y2="7" />
      <polyline points="4,13.5 6,15.5 9.5,12" />
      <line x1="12" y1="13.5" x2="20" y2="13.5" />
      <line x1="12" y1="19" x2="20" y2="19" />
      <circle cx="6.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  messages: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="11.5" x2="13" y2="11.5" />
    </svg>
  ),
  ether: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 10v4h3l6 4V6l-6 4z" />
      <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="14" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </svg>
  ),
  // a podium with a star: the week's first five, one tap from the face (D-123)
  rating: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M8.6 20v-9.4h6.8V20" />
      <path d="M3.4 20v-5.8h5.2M15.4 20v-4.2h5.2V20M2.8 20h18.4" />
      <path d="M12 3.2l1 2 2.1.3-1.5 1.5.4 2.1-2-1-2 1 .4-2.1-1.5-1.5 2.1-.3z" strokeWidth="1.5" />
    </svg>
  ),
  // a cup: the errands of D-79 are coffee, tea and a knock on the door
  secretary: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5c0 1.2 1 1.6 1 2.8M12 3.5c0 1.2 1 1.6 1 2.8" />
    </svg>
  ),
};

/**
 * The balls the face lets out on a tap (D-60): tasks that need the director, open messages in
 * tasks, the announcements of Эфир, the meetings ahead — each with its count. On the ring they orbit
 * the face slowly (CSS only, the labels stay upright); with a ball's card open they stand in a row
 * under the small face. One tap on a ball opens its card.
 *
 * The balls live in the head (D-178). They are drawn inside the face's own box (`MascotLever`'s
 * `around`), under the face and in its frame — the face glides to its new place by its `layout`,
 * and they go with it. Ring to row and back, no ball crosses the face: the ring dives into the
 * face's middle while the row comes out of it, each ball from the middle to its place, one after
 * another; back, the reverse. At rest the ring stays inside the head, so a tap on the face lets the
 * balls out of it and the «Дела» raised at rest brings the row straight out of the head, never a
 * full ring flashing first. Under «уменьшить движение» everything is at once.
 *
 * The root is a point at the face's middle; `rowTop` is how far below it the row's top is.
 *
 * Memoised down to the ball (D-178): a tap re-renders the page, and only what changed here renders
 * again — a switch of balls redraws the two whose `active` changed. `onPick` must keep its identity.
 */
export const OrbitBalls = memo(function OrbitBalls({
  balls,
  show,
  activeId,
  radius,
  rowTop,
  onPick,
  initial = true,
  receded,
}: {
  balls: OrbitBall[];
  /** null — no balls (a phrase in hand owns the face): whatever was out goes into the head */
  show: BallsShow | null;
  activeId: OrbitId | null;
  /** distance from the face's middle to a ball's middle on the ring */
  radius: number;
  /** distance from the face's middle down to the row's top */
  rowTop: number;
  onPick: (ball: OrbitBall) => void;
  /** false: what is out on the first render stands in place (a card remembered open, D-167) */
  initial?: boolean;
  /** the director is speaking: the layer as a whole steps back (D-166); left out — the layer never does */
  receded?: boolean;
}) {
  if (balls.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" style={receded === undefined ? undefined : recede(receded)} data-testid="balls" data-show={show ?? "none"}>
      <LocalPresence initial={initial}>
        {show === "row" ? (
          <Row key="row" balls={balls} activeId={activeId} top={rowTop} onPick={onPick} />
        ) : show ? (
          <Ring key="ring" balls={balls} radius={radius} hidden={show === "rest"} onPick={onPick} />
        ) : null}
      </LocalPresence>
    </div>
  );
});

/** A ball of the ring, round its own middle on the spoke's end: one object for every ball and render. */
const RING_BALL: CSSProperties = { position: "absolute", left: 0, top: 0, translate: `-50% ${-BALL / 2}px` };

const Ring = memo(function Ring({ balls, radius, hidden, onPick }: { balls: OrbitBall[]; radius: number; hidden: boolean; onPick: (ball: OrbitBall) => void }) {
  const hydrated = useHydrated();
  const still = useReducedMotion() ?? false;
  // The ring hidden in the sleeping head is drawn only once the page has hydrated. Its balls and
  // counts come from data, and data that lands between the server's HTML and the hydration of this
  // page (a query another part of the screen already started) made React throw the page's HTML
  // away and draw it again (#418) — a blink at the very first frame. Nothing is lost: the balls are
  // invisible in the head, and the way out of it starts from a mounted ring.
  if (hidden && !hydrated) return null;
  const n = balls.length;
  // The ring is paused in the head, not stopped: stopping snapped it back to its first angle — a jump
  // of up to a whole turn on the way out. Paused, it keeps its angle and costs nothing.
  const orbit = (name: "orbit-spin" | "orbit-counter"): CSSProperties => ({
    animation: `${name} ${ORBIT_S * TURNS}s linear infinite`,
    animationPlayState: hidden ? "paused" : "running",
  });
  const gone = { ...INSIDE, transition: still ? AT_ONCE : DIVE };
  return (
    // a point at the face's middle turns, each ball turns back round its own middle: the labels stay
    // upright, and framer only moves the balls along their spokes
    <div className="absolute left-0 top-0 h-0 w-0" style={orbit("orbit-spin")} data-testid="orbit" data-mode="ring" data-hidden={hidden ? "1" : "0"}>
      {balls.map((ball, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const delay = still ? 0 : i * STAGGER_S;
        const out = {
          x: Math.round(Math.cos(angle) * radius * 10) / 10,
          y: Math.round(Math.sin(angle) * radius * 10) / 10,
          scale: 1,
          opacity: 1,
          transition: still ? AT_ONCE : { default: { ...SPRING, delay }, scale: { ...POP, delay }, opacity: { duration: 0.12, delay } },
        };
        return (
          <motion.div key={ball.id} className="absolute left-0 top-0 h-0 w-0" initial={INSIDE} animate={hidden ? gone : out} exit={gone}>
            <span className="absolute left-0 top-0 h-0 w-0" style={orbit("orbit-counter")}>
              <Ball ball={ball} active={false} hidden={hidden} onPick={onPick} style={RING_BALL} />
            </span>
          </motion.div>
        );
      })}
    </div>
  );
});

const Row = memo(function Row({ balls, activeId, top, onPick }: { balls: OrbitBall[]; activeId: OrbitId | null; top: number; onPick: (ball: OrbitBall) => void }) {
  // a card remembered open stands as it was left: nothing comes out of the head (D-167, D-178)
  const emerge = useContext(PresenceContext)?.initial !== false;
  const still = useReducedMotion() ?? false;
  return (
    <div className="absolute left-0 flex gap-2" style={{ top, translate: "-50% 0" }} data-testid="orbit" data-mode="row" data-hidden="0">
      {balls.map((ball, i) => (
        <RowBall key={ball.id} ball={ball} index={i} emerge={emerge && !still} still={still} active={activeId === ball.id} onPick={onPick} />
      ))}
    </div>
  );
});

/**
 * A ball of the row: it comes out of the face's middle to its place and dives back into it. Where
 * the middle is from its place is read from the layout when it comes out — the labels make the balls
 * of a row differ in width — and the way back in goes there.
 */
const RowBall = memo(function RowBall({
  ball,
  index,
  emerge,
  still,
  active,
  onPick,
}: {
  ball: OrbitBall;
  index: number;
  emerge: boolean;
  still: boolean;
  active: boolean;
  onPick: (ball: OrbitBall) => void;
}) {
  const self = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(emerge ? 0 : 1);
  const opacity = useMotionValue(emerge ? 0 : 1);
  // where the face's middle is from here, once read: it does not change while the row stands (the row
  // moves with the face, and the face's glide moves both)
  const head = useRef<{ x: number; y: number } | null>(null);
  // Read before the first paint: the ball's first frame is already in the head. Motion values only,
  // nothing written to the page here — the row's balls all read the same layout once
  useLayoutEffect(() => {
    if (!emerge) return;
    const at = headFrom(self.current);
    head.current = at;
    x.set(at.x);
    y.set(at.y);
    const delay = index * STAGGER_S;
    const runs = [animate(x, 0, SPRING), animate(y, 0, SPRING), animate(scale, 1, { ...POP, delay }), animate(opacity, 1, { duration: 0.12, delay })];
    return () => runs.forEach((run) => run.stop());
    // mount only: the way out of the head is played once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      ref={self}
      className="relative"
      style={{ x, y, scale, opacity }}
      // into the head: where it was read on the way out of it (D-178) — read here, between one ball
      // starting its dive and the next, it laid the page out again for every ball, in the closing tap's
      // own frame. A row that stood from the first render (a card remembered open) reads it now
      variants={{ gone: () => ({ ...(head.current ?? headFrom(self.current)), scale: 0, opacity: 0, transition: still ? AT_ONCE : DIVE }) }}
      exit="gone"
    >
      <Ball ball={ball} active={active} hidden={false} onPick={onPick} />
    </motion.div>
  );
});

/**
 * Where the face's middle is from a ball of the row, as the `x`/`y` that put the ball there. The row
 * is the ball's parent (read through the DOM: a parent's ref is not set yet in its child's layout
 * effect) and its offset parent is the point at the face's middle (OrbitBalls' root).
 */
function headFrom(ball: HTMLElement | null): { x: number; y: number } {
  const row = ball?.parentElement;
  const anchor = row?.offsetParent;
  if (!ball || !row || !anchor) return { x: 0, y: 0 };
  const a = anchor.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  // the ball's own place without its transform: offsets, not its (scaled) box
  return {
    x: -(r.left - a.left + ball.offsetLeft + ball.offsetWidth / 2),
    y: -(r.top - a.top + ball.offsetTop + BALL / 2),
  };
}

const Ball = memo(function Ball({
  ball,
  active,
  hidden,
  onPick,
  style,
}: {
  ball: OrbitBall;
  active: boolean;
  hidden: boolean;
  onPick: (ball: OrbitBall) => void;
  style?: CSSProperties;
}) {
  const quiet = ball.count === 0 && !ball.lit;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => onPick(ball)}
      aria-label={`${ball.label}: ${ball.count}`}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      aria-pressed={active}
      data-testid="orbit-ball"
      data-ball={ball.id}
      data-quiet={quiet ? "1" : "0"}
      className="pointer-events-auto flex flex-col items-center gap-1"
      style={style}
    >
      {/* the open ball's circle grows a little; its label stays where it is */}
      <motion.span
        initial={false}
        animate={{ scale: active ? 1.12 : 1 }}
        transition={POP}
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: BALL,
          height: BALL,
          color: quiet ? "var(--text-muted)" : ball.tone,
          background: `color-mix(in srgb, ${quiet ? "var(--text-muted)" : ball.tone} ${active ? 30 : 14}%, var(--surface))`,
          border: `2px solid ${quiet ? "var(--border)" : `color-mix(in srgb, ${ball.tone} ${active ? 100 : 60}%, transparent)`}`,
          boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${ball.tone} 22%, transparent)` : "var(--shadow-raised)",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {ICON[ball.id]}
        {ball.count > 0 ? <CountBadge count={ball.count} tone={ball.tone} /> : null}
      </motion.span>
      <span className="whitespace-nowrap text-[12px] leading-4 text-muted">{ball.label}</span>
    </motion.button>
  );
});

/** The ball's number: its own part, so the ball opening or closing does not draw it again (D-178). */
const CountBadge = memo(function CountBadge({ count, tone }: { count: number; tone: string }) {
  return (
    <span
      className="nums absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center overflow-hidden rounded-full px-1.5 font-display text-[13px] font-bold leading-none text-bg"
      style={{ background: tone }}
    >
      {/* a new number comes down from above into the badge, the old one drops out under
          it — the eye catches what has changed (D-166); the first one is simply there */}
      <LocalPresence initial={false} mode="popLayout">
        <motion.span
          key={count}
          className="block"
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 14, opacity: 0, transition: { duration: 0.16, ease: "easeIn" } }}
          transition={SPRING}
        >
          {count}
        </motion.span>
      </LocalPresence>
    </span>
  );
});
