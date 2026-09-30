"use client";

import { memo, type CSSProperties } from "react";

import { Loops, loop } from "@/components/pulse/loops";
import { hashOf, RING_OUT } from "@/lib/idle/people";
import type { Look } from "@/lib/idle/look";

/** One turn of a ring: steady — a machine running, not an alarm going off. */
const TURN_MS = 3_200;
/** `crew-spin` turns twenty times in one iteration (globals.css): an iteration end wakes the main thread. */
const TURNS = 20;
/** How thick the ring is. */
const BAND = 2.5;

/** The arcs as one conic gradient: each fades in from its tail and ends at a bright head. */
function arcsOf(count: number, tone: string): string {
  const period = 1 / count;
  const length = count === 1 ? 0.55 : 0.6;
  const stops: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const start = k * period;
    stops.push(`transparent ${start.toFixed(4)}turn ${(start + period * (1 - length)).toFixed(4)}turn`, `${tone} ${(start + period).toFixed(4)}turn`);
  }
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

/**
 * The circle of a person with work on him (D-118): the same size as an idler's, lit in the
 * colour of the stage — tinted glass, the initials in the same colour — with a ring round it:
 *
 *   waiting   handed out, not taken up yet — the ring is whole, thin, and breathes;
 *   spinning  work in hand — an arc goes round, one per task in work (up to three), each with a
 *             small light on its head;
 *   closed    handed in — the ring is closed and still, and now and then a ring leaves it;
 *   broken    «не могу» — the ring stopped and snapped;
 *   done      accepted a moment ago — closed in gold, a tick for the initials, a flash.
 *
 * And one badge at one o'clock when there is something to read or to settle. Only transform and
 * opacity move; the one thing that runs all the time is the turn of a ring.
 */
export const CrewCircle = memo(function CrewCircle({
  id,
  initials,
  size,
  look,
  fresh = false,
}: {
  id: string;
  initials: string;
  size: number;
  look: Look;
  /** has just landed from the flight: the ring swings into place */
  fresh?: boolean;
}) {
  const tone = look.tone;
  const box = size + RING_OUT * 2;
  const count = look.arcs;
  // nobody's ring turns in step with anybody's
  const phase = -(hashOf(id, 3) % TURN_MS);
  const core: CSSProperties = {
    background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${tone} 36%, var(--surface-2)), color-mix(in srgb, ${tone} 12%, var(--surface)) 74%)`,
    color: `color-mix(in srgb, ${tone} 80%, white)`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px color-mix(in srgb, ${tone} 40%, transparent), 0 0 22px -6px color-mix(in srgb, ${tone} 75%, transparent)`,
  };

  return (
    <span className="relative block" style={{ width: size, height: size }} data-ring={look.ring} data-badge={look.badge ?? undefined} data-accepted={look.accepted ? "1" : undefined}>
      <Loops />
      {/* the ring: swings in after a flight, fades over when the stage changes */}
      <span
        key={`${look.ring}:${count}`}
        className="absolute block"
        style={{ inset: -RING_OUT, animation: fresh ? "crew-ignite 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both" : "crew-in 320ms var(--ease-out) both" }}
      >
        {look.ring === "spinning" ? (
          <span className="crew-anim absolute inset-0 block" style={{ animation: `crew-spin ${TURN_MS * TURNS}ms linear ${fresh ? 0 : phase}ms infinite`, willChange: "transform" }}>
            <span className="crew-band absolute inset-0 block rounded-full" style={{ background: arcsOf(count, tone) }} />
            {Array.from({ length: count }, (_, k) => (
              <span key={k} className="absolute left-1/2 top-1/2 block" style={{ transform: `rotate(${((k + 1) / count).toFixed(4)}turn) translateY(${-(box / 2 - BAND / 2)}px)` }}>
                <span
                  className="block rounded-full"
                  style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, background: `color-mix(in srgb, ${tone} 50%, white)`, boxShadow: `0 0 6px 1px ${tone}` }}
                />
              </span>
            ))}
          </span>
        ) : null}
        {look.ring === "waiting" ? (
          <span className="crew-anim absolute inset-0 block rounded-full" style={{ border: `1.5px solid ${tone}`, animation: loop("crew-wait", 2_600, `ease-in-out ${phase}ms infinite`) }} />
        ) : null}
        {look.ring === "closed" || look.ring === "done" ? (
          <>
            <span className="absolute inset-0 block rounded-full" style={{ border: `${BAND}px solid ${tone}` }} />
            <span
              className="crew-anim absolute inset-0 block rounded-full"
              style={{
                border: `1.5px solid ${tone}`,
                opacity: 0,
                animation: look.ring === "done" ? "crew-done 900ms var(--ease-out) both" : loop("crew-ping", 4_000, `ease-out ${phase}ms infinite`),
              }}
            />
          </>
        ) : null}
        {look.ring === "broken" ? (
          // stopped and snapped: the gap is where it broke
          <span className="crew-band absolute inset-0 block rounded-full" style={{ background: `conic-gradient(from 34deg, ${tone} 0deg 292deg, transparent 292deg 360deg)` }} />
        ) : null}
      </span>

      <span className="absolute inset-0 flex items-center justify-center rounded-full font-display font-bold" style={{ fontSize: Math.round(size * 0.36), ...core }}>
        {/* accepted: a tick instead of the initials for that moment — gold alone is too close to «ждёт приёмки» */}
        {look.ring === "done" ? (
          <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" aria-hidden style={{ animation: "crew-pop 420ms var(--ease-out) both" }}>
            <path d="M5 12.6l4.4 4.4L19 7.4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          initials
        )}
      </span>
      {/* one of several accepted: the rest of the work goes on, and a flash of gold says «принято» */}
      {look.accepted && look.ring !== "done" ? (
        <span
          aria-hidden
          className="absolute block rounded-full"
          style={{ inset: -RING_OUT, border: "1.5px solid var(--gold)", opacity: 0, animation: "crew-done 900ms var(--ease-out) both" }}
        />
      ) : null}
      {look.accepted ? (
        <span
          aria-hidden
          className="absolute inset-0 block rounded-full"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 60%, transparent), transparent 70%)", animation: "crew-glow 900ms var(--ease-out) both" }}
        />
      ) : null}

      {look.badge ? <CrewBadge key={look.badge} badge={look.badge} size={size} /> : null}
    </span>
  );
});

/** Something to read or to settle, on the ring at one o'clock: a refusal, a question, a word. */
function CrewBadge({ badge, size }: { badge: NonNullable<Look["badge"]>; size: number }) {
  const r = size / 2 + RING_OUT - 1;
  const d = 16;
  const fill = badge === "declined" ? "var(--danger)" : badge === "question" ? "var(--warn)" : "var(--accent)";
  return (
    <span
      aria-hidden
      data-testid="crew-badge"
      className="absolute flex items-center justify-center rounded-full"
      style={{
        width: d,
        height: d,
        left: size / 2 + r * 0.707 - d / 2,
        top: size / 2 - r * 0.707 - d / 2,
        background: fill,
        boxShadow: "0 0 0 2px var(--bg)",
        animation: "crew-pop 360ms var(--ease-out) both",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        {badge === "declined" ? <path d="M2.6 2.6l4.8 4.8M7.4 2.6L2.6 7.4" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" /> : null}
        {badge === "question" ? (
          <>
            <path d="M3.4 3.6a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.2" fill="none" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="5" cy="8.2" r="0.85" fill="var(--bg)" />
          </>
        ) : null}
        {badge === "message" ? <path d="M1.6 2.4h6.8v4.2H4.4L2.6 8.2V6.6h-1z" fill="var(--bg)" strokeLinejoin="round" /> : null}
      </svg>
    </span>
  );
}

/**
 * An idler (D-72): a grey circle with the initials, standing in his row and shivering — nothing
 * to do, and it shows. Picked, it turns the brand colour and a ring keeps breathing out of it,
 * a beacon for the face's look (D-84).
 */
export function IdleCircle({ id, initials, size, picked = false }: { id: string; initials: string; size: number; picked?: boolean }) {
  const h = hashOf(id, 9);
  const dx = (((h % 29) - 14) / 10).toFixed(1);
  const dy = ((((h >>> 5) % 21) - 10) / 10).toFixed(1);
  const driftMs = 520 + ((h >>> 10) % 480);
  const delay = -((h >>> 3) % 12_000);
  return (
    <span
      className="crew-anim relative block"
      // there and back is one cycle of the folded shiver (components/pulse/loops.tsx)
      style={{ "--orb-dx": `${dx}px`, "--orb-dy": `${dy}px`, animation: loop("orb-drift", driftMs * 2, `ease-in-out ${delay}ms infinite`) } as CSSProperties}
    >
      <Loops />
      <span
        className="crew-anim flex items-center justify-center rounded-full font-display font-bold"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.36),
          color: "var(--bg)",
          background: picked ? "var(--accent)" : "var(--text-muted)",
          transition: "background-color 240ms var(--ease-out)",
          animation: picked ? "orb-caught 640ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : loop("orb-breathe", 5_200, "ease-in-out infinite"),
        }}
      >
        {initials}
      </span>
      {picked ? (
        <>
          <span aria-hidden className="absolute rounded-full border-2 border-accent" style={{ inset: -RING_OUT }} />
          <span aria-hidden className="absolute rounded-full border-2 border-accent" style={{ inset: -RING_OUT, animation: "pick-pulse 1.6s ease-out infinite" }} />
        </>
      ) : null}
    </span>
  );
}
