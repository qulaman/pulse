"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { TOUCHES, type DreamId } from "@/components/pulse/DreamOrbit";
import { StarCard } from "@/components/pulse/StarCard";
import { haptic } from "@/lib/haptics";
import type { Chase } from "@/lib/idle/flight";
import { peopleField, type Load, type Orb, type Person, type StarStage } from "@/lib/idle/people";
import { brushesOf, keyframesOfBrushes } from "@/lib/idle/wake";

const TONE: Record<Orb["tone"], string> = {
  idle: "var(--text-muted)",
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};

/** The stage of the task, as the sky paints it (D-73). */
const STAGE: Record<StarStage, { color: string; beat: string }> = {
  // handed out and not taken up yet: a supernova — the loudest thing up there, and the first
  // thing the director sees right after he has given it
  nova: { color: "var(--accent)", beat: "star-nova" },
  work: { color: "var(--warn)", beat: "star-twinkle" },
  review: { color: "var(--ok)", beat: "star-twinkle" },
  alarm: { color: "var(--danger)", beat: "star-alarm" },
};

/**
 * The flight through the face, and the fall back down. The trip up is long on purpose: it is
 * three acts — sucked in, worked on, spat out — and each of them needs room to read (D-74).
 */
const LAUNCH_MS = 1_700;
const SINK_MS = 1_400;
/** The rings live just outside the face — 128 px of it plus a hair (docs/DESIGN.md §3). */
const RING = 136;
/** And the mouth is on that rim: near enough the head to be its edge, far enough to be seen. */
const RIM = 90;

/**
 * The team on the waiting screen (D-91). Two halves with the face between them:
 *
 * **Above** — everyone who has work on them, as small glowing points. A bigger, brighter,
 * quicker point is a more loaded person; red is overdue. Nobody is named: the top is the
 * volume of work in the air, and it reads at a glance.
 *
 * **Below** — the idlers, circles with their initials, drifting. Nothing is on them, and a
 * tap **picks** one (D-84): the face turns to look at them and the ways to give them a task
 * come out over its head — the screen owns that card, this layer only says who was picked.
 * The picked circle is ringed, the others step back.
 *
 * Between the two — the flight. The moment a task lands on an idler his circle dives into the
 * face and is spat out above as a star; when his last task closes, the star sinks back down.
 * The assistant in the middle is the machine that turns one into the other, and that is the
 * whole story of the screen.
 *
 * And the dream over them is not in an aquarium of its own: it brushes the team (D-77).
 */
export function PeopleField({
  people,
  loads,
  hx,
  hy,
  seed,
  now,
  reach,
  dream,
  chase,
  picked = null,
  onPick,
}: {
  people: Person[];
  loads: Record<string, Load>;
  hx: number;
  hy: number;
  seed: number;
  now: number;
  /** how far down the rows of idlers may stand — further than the dream is allowed to fly */
  reach?: number;
  /** the dream in the air right now, and the line it flies — the room reacts to it (D-77) */
  dream?: { id: DreamId; key: number } | null;
  chase?: Chase | null;
  /** the id of the circle picked on this screen; the screen keeps it, this layer draws it */
  picked?: string | null;
  /** a tap on a circle: that person, or null when the picked one is tapped again */
  onPick?: (orb: Orb | null) => void;
}) {
  const [opened, setOpened] = useState<Orb | null>(null);
  // the layout is redone when the team, their day or the screen changes — not on every tick
  // of the clock; the ten-minute step is there so a deadline going yellow still lands
  const digest = `${Math.floor(now / 600_000)}|${people.map((p) => `${p.id}:${loads[p.id]?.active ?? 0}:${loads[p.id]?.overdue ?? 0}:${loads[p.id]?.review ?? 0}`).join("|")}`;
  const orbs = useMemo(
    () => peopleField({ people, loads, hx, hy, seed, now, reach }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `digest` is the digest of people+loads
    [digest, hx, hy, seed, reach],
  );

  // Who has just changed sides. A person does not jump from one half to the other: he flies,
  // and until he lands he is drawn by the flight instead of by his new home. The comparison
  // belongs to the render, not to an effect — it is state being adjusted to new data, and an
  // effect would only get there a frame later, after the jump had already been painted.
  const [side, setSide] = useState<Map<string, boolean>>(() => new Map(orbs.map((o) => [o.id, o.working])));
  const [flying, setFlying] = useState<Map<string, { up: boolean }>>(new Map());
  const moved = orbs.filter((o) => side.has(o.id) && side.get(o.id) !== o.working);
  if (moved.length || orbs.some((o) => !side.has(o.id))) {
    setSide(new Map(orbs.map((o) => [o.id, o.working])));
    if (moved.length) setFlying((current) => new Map([...current, ...moved.map((o) => [o.id, { up: o.working }] as const)]));
  }

  // every flight lands: the timer is the only thing here that touches state after the fact
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const [id, flight] of flying) {
      if (timers.current.has(id)) continue;
      const timer = setTimeout(
        () => {
          timers.current.delete(id);
          setFlying((current) => {
            if (current.get(id)?.up !== flight.up) return current;
            const next = new Map(current);
            next.delete(id);
            return next;
          });
        },
        flight.up ? LAUNCH_MS : SINK_MS,
      );
      timers.current.set(id, timer);
    }
  }, [flying]);
  useEffect(() => {
    const running = timers.current;
    return () => running.forEach(clearTimeout);
  }, []);

  // What the dream does to the room (D-77). The flight and the team are measured from the same
  // point — the middle of the face — so who it goes past, and when, is known the moment the
  // flight is. Every reaction is written out as one animation over the whole dream and handed
  // to the browser, and JS goes back to sleep. The name of every keyframe carries the number of
  // the dream: these nodes are not remounted between dreams, and an animation whose name has
  // not changed is never restarted.
  const base = `wake-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wake = useMemo(() => {
    if (!chase || !dream) return null;
    const css: string[] = [];
    const byId = new Map<string, string>();
    for (const orb of orbs) {
      // the drawn size of the thing, not the size of the finger target around it
      const radius = (orb.working ? orb.starSize * 1.45 : orb.size / 2) + 6;
      const brushes = brushesOf(chase, TOUCHES[dream.id], orb.x, orb.y, radius);
      if (!brushes.length) continue;
      const name = `${base}-${dream.key}-${orb.id.replace(/[^a-zA-Z0-9]/g, "")}`;
      css.push(keyframesOfBrushes(name, brushes, chase.ms, orb.working ? "star" : "orb"));
      byId.set(orb.id, `${name} ${chase.ms}ms linear both`);
    }
    return byId.size ? { css: css.join(" "), byId } : null;
  }, [orbs, chase, dream, base]);

  // picking one does not give him a task by itself: the face turns to him and asks (D-84)
  const grab = (orb: Orb) => {
    haptic([12, 24, 12]);
    onPick?.(picked === orb.id ? null : orb);
  };

  if (!orbs.length) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="people-field"
      data-stars={orbs.filter((o) => o.working).length}
      data-idlers={orbs.filter((o) => !o.working).length}
    >
      {wake ? <style>{wake.css}</style> : null}
      <LookLine orb={orbs.find((o) => o.id === picked && !o.working) ?? null} />
      {orbs.map((orb) => {
        const flight = flying.get(orb.id);
        // somebody mid-flight is busy being thrown across the screen: the dream does not get him
        if (flight) return <Flight key={`${orb.id}:${flight.up}`} orb={orb} up={flight.up} />;
        const brush = wake?.byId.get(orb.id);
        return orb.working ? (
          <Star key={orb.id} orb={orb} brush={brush} onOpen={() => setOpened(orb)} />
        ) : (
          <Idler key={orb.id} orb={orb} brush={brush} caught={picked === orb.id} dimmed={picked !== null && picked !== orb.id} onCatch={() => grab(orb)} />
        );
      })}
      {/* the card of a star hangs at the top of the sky, out of the way of the face */}
      {opened ? (
        <div className="absolute left-1/2 block" style={{ top: `calc(50% - ${hy}px)`, transform: "translateX(-50%)" }}>
          <StarCard orb={opened} onClose={() => setOpened(null)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A person with work on them: a star whose colour is the stage of the task (D-73) — a
 * supernova for one just handed out, yellow while it is being done, green when it has been
 * handed back, red when something needs the director. A tap says whose it is and what it is;
 * it does nothing else, and that is the point of a sky.
 */
function Star({ orb, brush, onOpen }: { orb: Orb; brush?: string; onOpen: () => void }) {
  const { color, beat } = STAGE[orb.load.stage];
  const size = orb.starSize;
  // the drawn star is tiny; the finger gets a target it can actually hit
  // The target is the star plus a margin, deliberately smaller than the 44 px a control gets
  // (docs/DESIGN.md): a sky of thirty with 44 px targets is a sheet of overlapping buttons,
  // and the wrong card would open. Here a miss costs a glance, so the smaller target wins.
  const hit = Math.max(28, Math.min(40, size * 2.9));
  return (
    <button
      type="button"
      data-testid="star"
      data-person={orb.id}
      data-stage={orb.load.stage}
      onClick={onOpen}
      aria-label={`${orb.name}: ${orb.load.tasks[0]?.title ?? "в работе"}`}
      className="pointer-events-auto absolute left-1/2 top-1/2 flex items-center justify-center rounded-full"
      style={{
        width: hit,
        height: hit,
        marginLeft: -hit / 2,
        marginTop: -hit / 2,
        transform: `translate(${orb.x}px, ${orb.y}px)`,
        color,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* the flare when the dream goes past (D-77): a layer of its own, because the beat under
          it is already using the transform */}
      <span className="block" style={{ animation: brush }}>
        <span className="block" style={{ animation: `${beat} ${orb.load.stage === "alarm" ? 1_100 : orb.beatMs}ms ease-in-out ${orb.delayMs}ms infinite` }}>
          <svg width={size * 2.9} height={size * 2.9} viewBox="-10 -10 20 20" style={{ display: "block", pointerEvents: "none" }} aria-hidden>
            {/* the rays: four long and four short, so it reads as a star from any distance and
                never as a dot with a halo */}
            <g style={{ transformOrigin: "0px 0px", animation: `star-rays ${Math.round(orb.beatMs * 0.62)}ms ease-in-out ${orb.delayMs}ms infinite` }}>
              <path d="M0 -9.5 L0.7 -1 L0 0 L-0.7 -1 Z M0 9.5 L0.7 1 L0 0 L-0.7 1 Z M-9.5 0 L-1 -0.7 L0 0 L-1 0.7 Z M9.5 0 L1 -0.7 L0 0 L1 0.7 Z" fill="currentColor" />
              <path
                d="M-4.2 -4.2 L-0.6 -0.6 L0 0 L-0.6 0.6 Z M4.2 4.2 L0.6 0.6 L0 0 L0.6 -0.6 Z M4.2 -4.2 L0.6 -0.6 L0 0 L-0.6 -0.6 Z M-4.2 4.2 L-0.6 0.6 L0 0 L0.6 0.6 Z"
                fill="currentColor"
                opacity="0.55"
              />
            </g>
            <circle cx="0" cy="0" r="2.2" fill="currentColor" />
            {/* a supernova throws a shell: the task has just left, and it shows */}
            {orb.load.stage === "nova" ? (
              <circle cx="0" cy="0" r="3.4" fill="none" stroke="currentColor" strokeWidth="1" style={{ transformOrigin: "0px 0px", animation: "star-shell 2.4s ease-out infinite" }} />
            ) : null}
          </svg>
        </span>
      </span>
    </button>
  );
}

/**
 * The face's look made visible (D-84): a faint dashed line from the rim of the head to the
 * picked circle — who the face is looking at, and who the task will be for. It fades in once
 * and holds still; the ring on the circle is the only thing that keeps moving.
 */
function LookLine({ orb }: { orb: Orb | null }) {
  if (!orb) return null;
  const length = Math.hypot(orb.x, orb.y) || 1;
  const from = RIM - 14;
  const to = length - orb.size / 2 - 10;
  if (to <= from) return null;
  const ux = orb.x / length;
  const uy = orb.y / length;
  return (
    <svg
      key={orb.id}
      aria-hidden
      data-testid="look-line"
      className="absolute left-1/2 top-1/2 overflow-visible"
      width="1"
      height="1"
      style={{ animation: "overlay-in 360ms var(--ease-out) both" }}
    >
      <line
        x1={ux * from}
        y1={uy * from}
        x2={ux * to}
        y2={uy * to}
        stroke="var(--accent)"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
    </svg>
  );
}

/** A person with nothing on them: a circle with his initials, drifting, waiting to be caught. */
function Idler({ orb, brush, caught, dimmed, onCatch }: { orb: Orb; brush?: string; caught: boolean; dimmed: boolean; onCatch: () => void }) {
  const hit = Math.max(40, orb.size + 10);
  return (
    <button
      type="button"
      data-testid="orb"
      data-person={orb.id}
      data-tone={orb.tone}
      data-working="0"
      onClick={onCatch}
      aria-label={caught ? `${orb.name}: выбран — снять выбор` : `${orb.name}: без задач — дать задачу`}
      aria-pressed={caught}
      data-picked={caught ? "1" : undefined}
      className="pointer-events-auto absolute left-1/2 top-1/2 flex items-center justify-center rounded-full"
      style={{
        width: hit,
        height: hit,
        marginLeft: -hit / 2,
        marginTop: -hit / 2,
        transform: `translate(${orb.x}px, ${orb.y}px)`,
        // the others step back while one is picked: the room looks where the face looks
        opacity: dimmed ? 0.38 : 1,
        transition: "opacity 240ms var(--ease-out)",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* the shove when the dream goes past (D-77): over the drift, which owns the transform
          under this one */}
      <span className="block" style={{ animation: brush }}>
        <span
          className="relative block"
          style={
            {
              "--orb-dx": `${orb.dx}px`,
              "--orb-dy": `${orb.dy}px`,
              animation: `orb-drift ${orb.driftMs}ms ease-in-out ${orb.delayMs}ms infinite alternate`,
            } as React.CSSProperties
          }
        >
          <span
            className="flex items-center justify-center rounded-full font-display font-bold"
            style={{
              width: orb.size,
              height: orb.size,
              fontSize: Math.round(orb.size * 0.36),
              color: "var(--bg)",
              // picked: the brand colour — the same one the face looks at it with
              background: caught ? "var(--accent)" : TONE.idle,
              transition: "background-color 240ms var(--ease-out)",
              animation: caught ? "orb-caught 640ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "orb-breathe 5.2s ease-in-out infinite",
            }}
          >
            {orb.initials}
          </span>
          {/* the ring of the picked one: it keeps breathing out, a beacon for the face's look */}
          {caught ? (
            <>
              <span aria-hidden className="absolute rounded-full border-2 border-accent" style={{ inset: -5 }} />
              <span aria-hidden className="absolute rounded-full border-2 border-accent" style={{ inset: -5, animation: "pick-pulse 1.6s ease-out infinite" }} />
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/**
 * The trip between the two halves (D-74).
 *
 * Up, it is three acts, and each has its own physics, because one even glide reads as nothing:
 *
 *   sucked in   he flinches back first — the wind-up every animator draws before a move — and
 *               is then torn towards the face with acceleration, stretched along the way he is
 *               going. Squash and stretch is the whole reason it reads as suction.
 *   worked on   he is gone inside the head. A ring closes inwards (the breath in) and a spark
 *               shakes itself brighter in the middle. The face is playing `processing` on its
 *               own at that moment — the task has just landed on the board (D-65) — so the
 *               assistant really is chewing it.
 *   spat out    out of the middle towards his star: a hard start, stretched the new way, past
 *               the mark and elastic back onto it, with a shock ring left behind.
 *
 * The two headings are worked out here, in px, and handed to CSS as custom properties, so the
 * stretch is always along the real path; the initials ride a counter-rotation so they stay the
 * right way up. Everything is transform and opacity.
 *
 * Down is one act on purpose: nothing has happened to him, something has *stopped*.
 */
/** One ring around the face: the only place an effect of the head itself is visible. */
function Ring({ animation }: { animation: string }) {
  return (
    <span
      className="absolute left-0 top-0 block rounded-full border-2"
      style={{ width: RING, height: RING, marginLeft: -RING / 2, marginTop: -RING / 2, borderColor: "var(--accent)", opacity: 0, animation }}
    />
  );
}

function Flight({ orb, up }: { orb: Orb; up: boolean }) {
  const from = up ? { x: orb.idleX, y: orb.idleY } : { x: orb.starX, y: orb.starY };
  const to = up ? { x: orb.starX, y: orb.starY } : { x: orb.idleX, y: orb.idleY };
  const size = up ? orb.size : orb.starSize;
  const end = up ? orb.starSize / orb.size : orb.size / orb.starSize;
  const deg = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI;
  const inDeg = deg(-from.x, -from.y);
  const outDeg = deg(to.x, to.y);
  // Where the mouth is: both the swallow and the spit happen on the rim of the head, not in
  // its middle — the face is drawn over this layer, so anything that happens at the centre
  // happens behind it and is never seen. The two points are the path crossing that rim.
  const rim = (x: number, y: number) => {
    const len = Math.hypot(x, y) || 1;
    return { x: Math.round((x / len) * RIM), y: Math.round((y / len) * RIM) };
  };
  const mouthIn = rim(from.x, from.y);
  const mouthOut = rim(to.x, to.y);
  return (
    <span aria-hidden data-testid="orb-flight" data-dir={up ? "up" : "down"} className="absolute left-1/2 top-1/2 block">
      {up ? (
        <>
          {/* Everything the face does while he is inside it has to happen on the rim: the head
              is drawn over this layer, so a ring smaller than it is a ring nobody sees. */}
          <Ring animation={`orb-suck ${LAUNCH_MS}ms ease-in both`} />
          <Ring animation={`orb-chew ${LAUNCH_MS}ms ease-in-out both`} />
          <Ring animation={`orb-burst ${LAUNCH_MS}ms ease-out both`} />
        </>
      ) : null}
      <span
        className="absolute left-0 top-0 flex items-center justify-center rounded-full"
        style={
          {
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            background: up ? TONE.idle : STAGE[orb.load.stage].color,
            "--from-x": `${from.x}px`,
            "--from-y": `${from.y}px`,
            "--to-x": `${to.x}px`,
            "--to-y": `${to.y}px`,
            "--to-scale": end.toFixed(2),
            "--in-x": `${mouthIn.x}px`,
            "--in-y": `${mouthIn.y}px`,
            "--out-x": `${mouthOut.x}px`,
            "--out-y": `${mouthOut.y}px`,
            "--in-deg": `${inDeg.toFixed(1)}deg`,
            "--out-deg": `${outDeg.toFixed(1)}deg`,
            animation: `${up ? `orb-launch ${LAUNCH_MS}ms` : `orb-sink ${SINK_MS}ms ease-in-out`} both`,
          } as React.CSSProperties
        }
      >
        {up ? (
          <span
            className="font-display font-bold"
            style={
              {
                fontSize: Math.round(size * 0.36),
                color: "var(--bg)",
                // the body is stretched and turned along the path; the letters are not
                animation: `orb-launch-label ${LAUNCH_MS}ms step-end both`,
              } as React.CSSProperties
            }
          >
            {orb.initials}
          </span>
        ) : null}
      </span>
    </span>
  );
}
