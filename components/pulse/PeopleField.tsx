"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { CrewCard } from "@/components/pulse/CrewCard";
import { CrewCircle, IdleCircle } from "@/components/pulse/CrewCircle";
import { TOUCHES, type DreamId } from "@/components/pulse/DreamOrbit";
import { haptic } from "@/lib/haptics";
import type { Chase } from "@/lib/idle/flight";
import { lookOf, wordOf, type CrewTask, type Look } from "@/lib/idle/look";
import { addressOf, firstNameOf, initialsOf, RING_OUT, teamField, type Member, type Pick, type Seat } from "@/lib/idle/people";
import { brushesOf, keyframesOfBrushes } from "@/lib/idle/wake";

/** The trip up is three acts (D-74) and needs room to read; the way back is a calm float. */
const LAUNCH_MS = 1_700;
const RETURN_MS = 2_400;
/** How long the ring stays closed in gold after the director accepts the last task. */
const DONE_MS = 1_400;
/** Nobody has touched the screen this long: the rings stop where they are, until a touch. */
const SLEEP_MS = 180_000;
/** The mouth is on the rim of the 128 px face, where things can still be seen (D-74 §4). */
const RIM = 90;
/** The rings of the swallow live just outside the face. */
const RING = 136;

type Flight = { up: boolean; from: Seat; to: Seat; look: Look };

/** A person's tasks as one string: equal strings, nothing on his circle has changed. */
function signOf(tasks: CrewTask[]): string {
  return tasks.map((t) => `${t.id}~${t.status}~${t.overdue ? 1 : 0}~${t.question ?? ""}~${t.unread ? 1 : 0}~${t.reason ?? ""}~${t.title}`).join("|");
}

/**
 * The team on the waiting screen (D-90, D-91; circles since D-118). Two halves with the face
 * between them, everybody the same circle of the same size:
 *
 * **Below** — the idlers, grey, standing in their rows and shivering (D-72). A tap **picks** one
 * (D-84): the face turns to look at him and the ways to give him a task come out over its head
 * — the screen owns that card, this layer only says who was picked.
 *
 * **Above** — the people with work, lit in the colour of the stage of their loudest task (the
 * colours of «Задачи»), with a ring that says whether the work is moving and a badge when there
 * is something to read or to settle (components/pulse/CrewCircle.tsx). A tap opens his card —
 * what he is on, each task a tap away from its own screen — and the face looks at him meanwhile.
 *
 * Between the two — the flight. A task lands on an idler: his circle is pulled into the face
 * and comes out lit above (D-74, without the change of size). The director accepts his last
 * task: the ring closes in gold for a moment, the light goes out and he floats back down round
 * the side of the face. The assistant in the middle is the machine that turns one into the
 * other, and that is the whole story of the screen.
 *
 * The dream over them brushes the team (D-77). Nobody touching the screen for three minutes
 * stops the rings (the battery of a board left open); `still` — `prefers-reduced-motion` —
 * shows the same team without any motion at all, since it carries the state of the work.
 */
export function PeopleField({
  members,
  hx,
  hy,
  wide,
  reach,
  dream,
  chase,
  picked = null,
  still = false,
  onPick,
  onLook,
  allHref,
}: {
  members: Member[];
  /** half the play area, px from the middle of the face */
  hx: number;
  hy: number;
  /** how far out the rows may stand, further than the dream may fly */
  wide?: number;
  reach?: number;
  /** the dream in the air right now, and the line it flies — the room reacts to it (D-77) */
  dream?: { id: DreamId; key: number } | null;
  chase?: Chase | null;
  /** the id of the idler picked on this screen; the screen keeps it, this layer draws it */
  picked?: string | null;
  /** no motion at all: the circles, the rings and the badges stand still */
  still?: boolean;
  /** a tap on an idler: that person, or null when the picked one is tapped again */
  onPick?: (pick: Pick | null) => void;
  /** a lit one's card opened or closed: the face looks at him meanwhile */
  onLook?: (pick: Pick | null) => void;
  /** where «Все дела» of a person goes, when not his card on «Команда» */
  allHref?: (id: string) => string;
}) {
  // ---- the moment of acceptance: gold for a moment, then the circle goes down ---------------
  // A task the screen saw open and now sees done has just been accepted. It keeps its person
  // lit in gold for DONE_MS; a done task the screen never saw open is old news and is ignored.
  const statuses = useMemo(() => new Map(members.flatMap((m) => m.tasks.map((t) => [t.id, t.status] as const))), [members]);
  const [seen, setSeen] = useState(statuses);
  const [golden, setGolden] = useState<Set<string>>(() => new Set());
  // The gold counts in this very render, not only in the one the state update brings: whatever
  // this render decides — a flight above all — is kept, and without it the accepted person would
  // read as an idler for one pass, start down, and be sent back up by the next.
  let gold = golden;
  if (seen !== statuses) {
    const accepted = [...statuses].filter(([id, status]) => status === "done" && seen.has(id) && seen.get(id) !== "done").map(([id]) => id);
    setSeen(statuses);
    if (accepted.length) {
      gold = new Set([...golden, ...accepted]);
      setGolden(gold);
    }
  }
  const goldTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const id of golden) {
      if (goldTimers.current.has(id)) continue;
      goldTimers.current.set(
        id,
        setTimeout(() => {
          goldTimers.current.delete(id);
          setGolden((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, DONE_MS),
      );
    }
  }, [golden]);

  // what each circle says right now: a done task counts only during its moment of gold
  const crew = useMemo(
    () =>
      members.map((member) => {
        const tasks = member.tasks.filter((t) => t.status !== "done" || gold.has(t.id));
        return { member, tasks, look: lookOf(tasks), sign: signOf(tasks) };
      }),
    [members, gold],
  );
  const looks = useMemo(() => new Map(crew.map((c) => [c.member.id, c.look])), [crew]);

  // ---- where everybody stands --------------------------------------------------------------
  const digest = crew.map((c) => `${c.member.id}:${c.member.fullName}:${c.look.busy ? 1 : 0}`).join("|");
  const layout = useMemo(
    () => teamField({ people: crew.map((c) => ({ id: c.member.id, fullName: c.member.fullName, busy: c.look.busy })), hx, hy, wide, reach }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `digest` is the digest of who stands where
    [digest, hx, hy, wide, reach],
  );

  // Who has just changed halves. Nobody jumps across the face: they fly, and until they land
  // they are drawn by the flight. The comparison belongs to the render (state adjusted to new
  // data), not to an effect that would get there a frame after the jump was painted.
  const [known, setKnown] = useState<{ busy: Map<string, boolean>; seats: Map<string, Seat>; looks: Map<string, Look> } | null>(null);
  const [flights, setFlights] = useState<Map<string, Flight>>(() => new Map());
  const [landed, setLanded] = useState<Set<string>>(() => new Set());
  if (known?.seats !== layout.seats) {
    if (known && !still) {
      const started: [string, Flight][] = [];
      for (const { member, look } of crew) {
        const was = known.busy.get(member.id);
        if (was === undefined || was === look.busy) continue;
        const from = known.seats.get(member.id);
        const to = layout.seats.get(member.id);
        // up: the look he lands with; down: the look he leaves with — the gold of the accepted one
        const flown = look.busy ? look : (known.looks.get(member.id) ?? look);
        if (from && to) started.push([member.id, { up: look.busy, from, to, look: flown }]);
      }
      if (started.length) setFlights((current) => new Map([...current, ...started]));
    }
    setKnown({ busy: new Map(crew.map((c) => [c.member.id, c.look.busy])), seats: layout.seats, looks });
  } else if (known.looks !== looks) {
    // the same halves, a new stage: remember it, so the way down leaves with the latest look
    setKnown({ ...known, looks });
  }

  const flightTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const [id, flight] of flights) {
      const key = `${id}:${flight.up}`;
      if (flightTimers.current.has(key)) continue;
      flightTimers.current.set(
        key,
        setTimeout(
          () => {
            flightTimers.current.delete(key);
            setFlights((current) => {
              if (current.get(id)?.up !== flight.up) return current;
              const next = new Map(current);
              next.delete(id);
              return next;
            });
            // he lands where his ring starts, so the ring swings in from there
            setLanded((current) => new Set(current).add(id));
          },
          flight.up ? LAUNCH_MS : RETURN_MS,
        ),
      );
    }
  }, [flights]);
  useEffect(() => {
    const flying = flightTimers.current;
    const gold = goldTimers.current;
    return () => {
      flying.forEach(clearTimeout);
      gold.forEach(clearTimeout);
    };
  }, []);

  // ---- deep sleep: a board left open does not spin its rings forever ------------------------
  const [asleep, setAsleep] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setAsleep(true), SLEEP_MS);
    const poke = () => {
      setAsleep(false);
      clearTimeout(timer);
      timer = setTimeout(() => setAsleep(true), SLEEP_MS);
    };
    window.addEventListener("pointerdown", poke, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", poke);
    };
  }, []);

  // ---- the card of a lit one -----------------------------------------------------------------
  const [opened, setOpened] = useState<string | null>(null);
  const openedCrew = opened ? (crew.find((c) => c.member.id === opened && c.look.busy && c.look.ring !== "done") ?? null) : null;
  const openedSeat = openedCrew ? (layout.seats.get(openedCrew.member.id) ?? null) : null;
  const closeCard = () => {
    setOpened(null);
    onLook?.(null);
  };
  // The handlers read the latest screen through a ref, so they never change and a move of one
  // person re-renders that one person, not the whole team.
  const latest = useRef({ crew, layout, opened, picked, onPick, onLook });
  useLayoutEffect(() => {
    latest.current = { crew, layout, opened, picked, onPick, onLook };
  });
  // his last task has just been accepted: there is no card to show any more
  useEffect(() => {
    if (opened && !openedCrew) onLook?.(null);
  }, [opened, openedCrew, onLook]);
  // A touch anywhere but the card and his own circle puts the card away — and still does what
  // it touched: the field lives in the box of the face, so a veil under the card could not
  // cover the screen, and a second tap for everything else would be one tap too many.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opened) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (card.current?.contains(target)) return;
      // his own circle toggles the card by itself, on its click
      if (target?.closest(`[data-testid="crew"][data-person="${CSS.escape(opened)}"]`)) return;
      setOpened(null);
      latest.current.onLook?.(null);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [opened]);
  // the scene leaves (the face woke up, a phrase went off): whatever the face was looking at is let go
  useEffect(
    () => () => {
      if (latest.current.opened) latest.current.onLook?.(null);
    },
    [],
  );
  const tap = useCallback((id: string) => {
    const { crew, layout, opened, picked, onPick, onLook } = latest.current;
    const entry = crew.find((c) => c.member.id === id);
    const seat = layout.seats.get(id);
    if (!entry || !seat) return;
    const busy = entry.look.busy;
    haptic(busy ? [10] : [12, 24, 12]);
    const pick: Pick = { id, name: firstNameOf(entry.member.fullName), address: addressOf(entry.member), x: seat.x, y: seat.y };
    if (busy) {
      // the moment of gold is not a card: the task is already closed
      if (entry.look.ring === "done") return;
      const again = opened === id;
      setOpened(again ? null : id);
      onLook?.(again ? null : pick);
      onPick?.(null);
      return;
    }
    if (opened) onLook?.(null);
    setOpened(null);
    // picking one does not give him a task by itself: the face turns to him and asks (D-84)
    onPick?.(picked === id ? null : pick);
  }, []);

  // ---- what the dream does to the room (D-77) ------------------------------------------------
  // The flight and the team are measured from the same point — the middle of the face — so who it
  // goes past, and when, is known the moment the flight is. Every reaction is one animation over
  // the whole dream; the name carries the number of the dream, because these nodes are not
  // remounted between dreams and an animation whose name has not changed is never restarted.
  const base = `wake-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wake = useMemo(() => {
    if (!chase || !dream) return null;
    const css: string[] = [];
    const byId = new Map<string, string>();
    for (const { member, look } of crew) {
      const seat = layout.seats.get(member.id);
      if (!seat) continue;
      // the drawn size of the thing, ring included, not the finger target round it
      const radius = layout.size / 2 + (look.busy ? RING_OUT : 0) + 6;
      const brushes = brushesOf(chase, TOUCHES[dream.id], seat.x, seat.y, radius);
      if (!brushes.length) continue;
      const name = `${base}-${dream.key}-${member.id.replace(/[^a-zA-Z0-9]/g, "")}`;
      css.push(keyframesOfBrushes(name, brushes, chase.ms, "orb"));
      byId.set(member.id, `${name} ${chase.ms}ms linear both`);
    }
    return byId.size ? { css: css.join(" "), byId } : null;
  }, [crew, layout, chase, dream, base]);

  const box = { w: Math.max(hx, wide ?? hx) * 2, h: Math.max(hy, reach ?? hy) * 2 };
  const busyCount = crew.filter((c) => c.look.busy).length;
  if (!crew.length) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="people-field"
      data-busy={busyCount}
      data-idle={crew.length - busyCount}
      data-still={still ? "" : undefined}
      data-asleep={asleep ? "" : undefined}
    >
      {wake ? <style>{wake.css}</style> : null}
      <LookLine seat={picked ? (layout.seats.get(picked) ?? null) : null} size={layout.size} />
      {crew.map(({ member, tasks, look, sign }) => {
        const seat = layout.seats.get(member.id);
        if (!seat || flights.has(member.id)) return null;
        return (
          <Seated
            key={member.id}
            id={member.id}
            fullName={member.fullName}
            tasks={tasks}
            sign={sign}
            look={look}
            x={seat.x}
            y={seat.y}
            size={layout.size}
            hit={layout.spacing - 2}
            brush={wake?.byId.get(member.id)}
            fresh={landed.has(member.id)}
            picked={picked === member.id}
            dimmed={(picked !== null && picked !== member.id && !look.busy) || (opened !== null && opened !== member.id)}
            lifted={opened === member.id}
            onTap={tap}
          />
        );
      })}
      {[...flights].map(([id, flight]) => {
        const entry = crew.find((c) => c.member.id === id);
        return entry ? <FlightOf key={`${id}:${flight.up}`} id={id} fullName={entry.member.fullName} flight={flight} size={layout.size} /> : null;
      })}
      <Overflow count={layout.overflow.top} y={-box.h / 2 + 2} x={box.w / 2 - 48} />
      <Overflow count={layout.overflow.bottom} y={box.h / 2 - 22} x={box.w / 2 - 48} />
      {openedCrew && openedSeat ? (
        <CrewCard ref={card} member={{ ...openedCrew.member, tasks: openedCrew.tasks }} seat={openedSeat} box={box} reach={layout.size / 2 + RING_OUT + 6} allHref={allHref?.(openedCrew.member.id)} onClose={closeCard} />
      ) : null}
    </div>
  );
}

/**
 * One person in his place. Memoised on what his circle says (`sign`) and plain values, with a
 * stable handler: when one of fifty gets a task, one re-renders. A neighbour leaving the row
 * makes room, and the others slide over instead of jumping.
 */
const Seated = memo(
  function Seated({
    id,
    fullName,
    look,
    x,
    y,
    size,
    hit,
    brush,
    fresh,
    picked,
    dimmed,
    lifted,
    onTap,
  }: {
    id: string;
    fullName: string;
    tasks: CrewTask[];
    sign: string;
    look: Look;
    x: number;
    y: number;
    size: number;
    hit: number;
    brush?: string;
    fresh: boolean;
    picked: boolean;
    dimmed: boolean;
    lifted: boolean;
    onTap: (id: string) => void;
  }) {
    const name = firstNameOf(fullName);
    const initials = initialsOf(fullName);
    const label = look.busy
      ? look.lead
        ? `${name}: ${look.lead.title} — ${wordOf(look.lead)}`
        : `${name}: в работе`
      : picked
        ? `${name}: выбран — снять выбор`
        : `${name}: без задач — дать задачу`;
    return (
      <button
        type="button"
        data-testid="crew"
        data-person={id}
        data-busy={look.busy ? "1" : "0"}
        data-ring={look.ring}
        data-picked={picked ? "1" : undefined}
        aria-label={label}
        aria-pressed={look.busy ? undefined : picked}
        onClick={() => onTap(id)}
        className="crew-hit pointer-events-auto absolute left-1/2 top-1/2 flex items-center justify-center"
        style={{
          width: hit,
          height: hit,
          marginLeft: -hit / 2,
          marginTop: -hit / 2,
          transform: `translate(${x}px, ${y}px)`,
          transition: "transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms var(--ease-out)",
          // the others step back while one is picked or read: the room looks where the face looks
          opacity: dimmed ? 0.3 : 1,
          zIndex: lifted ? 30 : undefined,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* the shove when the dream goes past (D-77): a layer of its own, the circle owns the rest */}
        <span className="crew-anim block" style={{ animation: brush }}>
          <span className="crew-press block">
            <span className="block" style={{ animation: lifted ? "crew-lift 240ms var(--ease-out) forwards" : undefined }}>
              {look.busy ? <CrewCircle id={id} initials={initials} size={size} look={look} fresh={fresh} /> : <IdleCircle id={id} initials={initials} size={size} picked={picked} />}
            </span>
          </span>
        </span>
        {/* the name of the picked one, whom the face asks about (a card says its own) */}
        {picked ? (
          <span
            className="pointer-events-none absolute left-1/2 block -translate-x-1/2 whitespace-nowrap font-display text-[10px] font-semibold leading-3 text-text"
            style={{ top: `calc(50% + ${size / 2 + RING_OUT + 3}px)` }}
          >
            {name}
          </span>
        ) : null}
      </button>
    );
  },
  (a, b) =>
    a.sign === b.sign &&
    a.look.busy === b.look.busy &&
    a.look.ring === b.look.ring &&
    a.look.accepted === b.look.accepted &&
    a.fullName === b.fullName &&
    a.x === b.x &&
    a.y === b.y &&
    a.size === b.size &&
    a.hit === b.hit &&
    a.brush === b.brush &&
    a.fresh === b.fresh &&
    a.picked === b.picked &&
    a.dimmed === b.dimmed &&
    a.lifted === b.lifted &&
    a.onTap === b.onTap,
);

/**
 * The face's look made visible (D-84): a faint dashed line from the rim of the head to the picked
 * circle — who the face is looking at, and who the task will be for. It fades in once and holds
 * still; the ring on the circle is the only thing that keeps moving.
 */
function LookLine({ seat, size }: { seat: Seat | null; size: number }) {
  if (!seat) return null;
  const length = Math.hypot(seat.x, seat.y) || 1;
  const from = RIM - 14;
  const to = length - size / 2 - RING_OUT - 8;
  if (to <= from) return null;
  const ux = seat.x / length;
  const uy = seat.y / length;
  return (
    <svg
      key={seat.id}
      aria-hidden
      data-testid="look-line"
      className="absolute left-1/2 top-1/2 overflow-visible"
      width="1"
      height="1"
      style={{ animation: "overlay-in 360ms var(--ease-out) both" }}
    >
      <line x1={ux * from} y1={uy * from} x2={ux * to} y2={uy * to} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
    </svg>
  );
}

/** A ring round the face: the only place an effect of the head itself can be seen. */
function Ring({ animation, color }: { animation: string; color: string }) {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 block rounded-full border-2"
      style={{ width: RING, height: RING, marginLeft: -RING / 2, marginTop: -RING / 2, borderColor: color, opacity: 0, animation }}
    />
  );
}

/**
 * The trip between the halves (D-74, redrawn in D-118).
 *
 * Up, three acts: a squat before the jump, pulled into the face and stretched on the way; gone
 * inside while the rim chews; out of the top of the head, past his new place and elastic back
 * onto it. He goes in grey and comes out lit — the light comes on inside the head, out of sight,
 * which is exactly what the face is for — and the ring swings in once he has landed.
 *
 * Down, one calm act: the light goes out where he stands and he floats down round the side of
 * the face, not through it — nothing is being made here, something has stopped.
 *
 * The points are worked out here in px and handed to CSS as custom properties; transform and
 * opacity only.
 */
function FlightOf({ id, fullName, flight, size }: { id: string; fullName: string; flight: Flight; size: number }) {
  const { from, to, up, look } = flight;
  const initials = initialsOf(fullName);
  const px = (n: number) => `${n.toFixed(1)}px`;
  const rim = (x: number, y: number) => {
    const len = Math.hypot(x, y) || 1;
    return { x: (x / len) * RIM, y: (y / len) * RIM };
  };
  const box: CSSProperties = { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 };
  const grey = (
    <span
      className="absolute inset-0 flex items-center justify-center rounded-full font-display font-bold"
      style={{ fontSize: Math.round(size * 0.36), color: "var(--bg)", background: "var(--text-muted)" }}
    >
      {initials}
    </span>
  );

  if (up) {
    const mouthIn = rim(from.x, from.y);
    const mouthOut = rim(to.x, to.y);
    const vars = {
      "--from-x": px(from.x),
      "--from-y": px(from.y),
      "--wind-x": px(from.x * 1.03),
      "--wind-y": px(from.y * 1.03 + 4),
      "--pull-x": px((from.x + mouthIn.x) / 2),
      "--pull-y": px((from.y + mouthIn.y) / 2),
      "--in-x": px(mouthIn.x),
      "--in-y": px(mouthIn.y),
      "--peek-x": px(mouthOut.x * 0.3),
      "--peek-y": px(mouthOut.y * 0.3),
      "--out-x": px(mouthOut.x),
      "--out-y": px(mouthOut.y),
      "--near-x": px(mouthOut.x + (to.x - mouthOut.x) * 0.8),
      "--near-y": px(mouthOut.y + (to.y - mouthOut.y) * 0.8),
      "--over-x": px(to.x + (to.x - mouthOut.x) * 0.08),
      "--over-y": px(to.y + (to.y - mouthOut.y) * 0.08),
      "--to-x": px(to.x),
      "--to-y": px(to.y),
    } as CSSProperties;
    // the lit circle flies without its ring and badge: those come on once he has landed
    const lit: Look = { ...look, ring: "idle", badge: null, accepted: false };
    return (
      <span aria-hidden data-testid="crew-flight" data-dir="up" className="pointer-events-none absolute left-1/2 top-1/2 block">
        <Ring animation={`orb-suck ${LAUNCH_MS}ms ease-in both`} color="var(--accent)" />
        <Ring animation={`orb-chew ${LAUNCH_MS}ms ease-in-out both`} color="var(--accent)" />
        <Ring animation={`orb-burst ${LAUNCH_MS}ms ease-out both`} color={look.tone} />
        <span className="absolute left-0 top-0 block" style={{ ...box, ...vars, animation: `crew-launch ${LAUNCH_MS}ms both` }}>
          {grey}
          <span className="absolute inset-0 block" style={{ animation: `crew-swap-in ${LAUNCH_MS}ms linear both` }}>
            <CrewCircle id={id} initials={initials} size={size} look={lit} />
          </span>
        </span>
      </span>
    );
  }

  // round the side he is on, level with the face and clear of it
  const side = { x: (from.x >= 0 ? 1 : -1) * (RING / 2 + 50), y: 12 };
  const vars = { "--from-x": px(from.x), "--from-y": px(from.y), "--side-x": px(side.x), "--side-y": px(side.y), "--to-x": px(to.x), "--to-y": px(to.y) } as CSSProperties;
  return (
    <span aria-hidden data-testid="crew-flight" data-dir="down" className="pointer-events-none absolute left-1/2 top-1/2 block">
      <span className="absolute left-0 top-0 block" style={{ ...box, ...vars, animation: `crew-return ${RETURN_MS}ms both` }}>
        {grey}
        {/* the moment of gold is over: the ring stays closed and still while the light fades */}
        <span className="absolute inset-0 block" data-still="" style={{ animation: `crew-cool ${RETURN_MS}ms linear both` }}>
          <CrewCircle id={id} initials={initials} size={size} look={{ ...look, ring: look.ring === "done" ? "closed" : look.ring, badge: null, accepted: false }} />
        </span>
      </span>
    </span>
  );
}

/** More people than places: the rest are counted, and the count opens the whole team. */
function Overflow({ count, x, y }: { count: number; x: number; y: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href="/people"
      aria-label={`Ещё ${count} — вся команда`}
      data-testid="crew-more"
      className="pointer-events-auto absolute left-1/2 top-1/2 block rounded-full border border-border bg-surface px-2 py-0.5 font-display text-[11px] font-semibold leading-4 text-muted"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      +{count}
    </Link>
  );
}
