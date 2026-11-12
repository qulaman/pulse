"use client";

/**
 * The sky — the team's side of the screen. One law: altitude is whose move it is. Free people
 * float at the top, people at work hang light in the middle, whoever waits for the director's
 * word turns dark and rests on the horizon, right above his thumb. When the ground rises (a
 * panel, the confirmation) the sky folds into a band: the same discs in one row.
 */
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import type { Mood } from "@/app/dev/pulse-alt/fixtures";

import { firstName, heavyOrder, type Crew } from "./model";
import { C, Disc, Icon, SETTLE, SOFT, TONE, useReduced, type DiscLook } from "./ui";

export type Spot = { x: number; y: number; size: number; show: boolean; label: "full" | "inline" | "none" };

const PAD = 16;

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h / 997;
}

/** Width of an inline chip (disc + name) on the free row — measured by eye for Onest 12px. */
const chipW = (text: string) => 24 + 6 + text.length * 6.7 + 14;

export const SHELF_TAB_W = 150;

/** Where everyone stands in the open sky of width W and height H. */
export function layoutFull(W: number, H: number, crew: Crew[]): Record<string, Spot> {
  const out: Record<string, Spot> = {};
  // a low sky (the ground holds a lot) keeps the law but packs it: the people at work join the
  // top row as small chips, the shelf stays where the thumb is
  const compact = H < 340;
  const roomy = W >= 380 && H >= 380;
  const heavySize = roomy ? 48 : compact ? 42 : 44;
  const lightSize = roomy ? 42 : 38;
  const labelH = compact ? 32 : 34;

  // the shelf: the most urgent three sit on the horizon (the secretary's desk takes the right),
  // the rest stack above in rows of four
  const heavy = heavyOrder(crew);
  const bottomArea = W - 2 * PAD - SHELF_TAB_W - 6;
  const rowH = heavySize + labelH + (compact ? 8 : 14);
  const bottomY = H - 12 - labelH - heavySize / 2;
  let shelfTop = H - 8;
  const rows: Crew[][] = [];
  if (heavy.length) {
    rows.push(heavy.slice(0, 3));
    for (let i = 3; i < heavy.length; i += 4) rows.push(heavy.slice(i, i + 4));
  }
  rows.forEach((row, r) => {
    const y = bottomY - r * rowH;
    const area = r === 0 ? bottomArea : W - 2 * PAD;
    const cap = r === 0 ? 3 : 4;
    const step = area / cap;
    row.forEach((c, i) => {
      // the bottom row fills from the left; the upper rows sit centred, nudged into the gaps
      const x = r === 0 ? PAD + step * (i + 0.5) : W / 2 + (i - (row.length - 1) / 2) * step + (r % 2 ? step * 0.18 : 0);
      out[c.id] = { x, y: y + (hash(c.id) - 0.5) * 4, size: heavySize, show: true, label: "full" };
    });
    shelfTop = Math.min(shelfTop, y - heavySize / 2 - 6);
  });

  const light = crew.filter((c) => c.altitude === "work" || c.altitude === "unseen" || c.altitude === "held");
  const free = crew.filter((c) => c.altitude === "free" || c.altitude === "away");

  // the top row: tiny discs with names — in a low sky the people at work come first
  let cx = PAD;
  const topRow = compact ? [...light, ...free] : free;
  topRow.forEach((c) => {
    const text = c.altitude === "away" ? `${firstName(c.person)} · ${c.reason}` : firstName(c.person);
    out[c.id] = { x: cx + 12, y: 20, size: 24, show: cx + chipW(text) < W - PAD + 8, label: "inline" };
    cx += chipW(text);
  });
  if (compact) return out;

  // the middle: people at work, light, loosely scattered between the free row and the shelf
  const top = 52;
  // the secretary's desk rises 34 px out of the ground on the right: nobody stands behind it
  const bottom = Math.max(top + 40, Math.min(shelfTop - 4, H - 46));
  const n = light.length;
  if (n) {
    // at most three across, so a label («не открывала с 10:05») always has its own width
    const cols = Math.min(3, n);
    const rowsN = Math.ceil(n / cols);
    const bh = bottom - top;
    light.forEach((c, i) => {
      const r = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const stepX = (W - 2 * PAD) / inRow;
      const xRaw = PAD + stepX * (col + 0.5) + (hash(c.id) - 0.5) * Math.min(26, stepX * 0.2) + (r % 2 ? stepX * 0.12 : 0);
      const x = Math.max(PAD + 58, Math.min(W - PAD - 58, xRaw));
      const swing = Math.min(16, (bh / rowsN) * 0.12) * (col % 2 ? 1 : -1);
      const yRaw = top + (bh * (r + 0.5)) / rowsN + swing - labelH / 2 + 4;
      const y = Math.max(top + lightSize / 2, Math.min(bottom - labelH - lightSize / 2, yRaw));
      out[c.id] = { x, y, size: lightSize, show: true, label: "full" };
    });
  }
  return out;
}

/** The top edge of the shelf in an open sky — where a news thought may sit without hiding anyone. */
export function shelfTopOf(spots: Record<string, Spot>, crew: Crew[], H: number): number {
  let top = H - 8;
  for (const c of crew) {
    const s = spots[c.id];
    if (s && c.altitude === "heavy" && s.show) top = Math.min(top, s.y - s.size / 2 - 8);
  }
  return top;
}

/** The folded sky: one row of small discs, in the order given; the rest sink behind the ground. */
export function layoutBand(W: number, H: number, crew: Crew[], ids: string[]): { spots: Record<string, Spot>; more: number; moreX: number } {
  const out: Record<string, Spot> = {};
  const size = 32;
  const step = 38;
  const cap = Math.max(1, Math.floor((W - 2 * PAD + (step - size)) / step));
  const visible = ids.length > cap ? ids.slice(0, cap - 1) : ids;
  const more = ids.length - visible.length;
  const count = visible.length + (more ? 1 : 0);
  const x0 = W / 2 - ((count - 1) * step) / 2;
  // the folded row rests on the horizon, like the shelf it came from
  const y = Math.max(28, H - 44);
  visible.forEach((id, i) => {
    out[id] = { x: x0 + i * step, y, size, show: true, label: "none" };
  });
  for (const c of crew) {
    if (!out[c.id]) out[c.id] = { x: W / 2 + (hash(c.id) - 0.5) * W * 0.6, y: H + 40, size, show: false, label: "none" };
  }
  return { spots: out, more, moreX: x0 + visible.length * step };
}

// ---- the backdrop: sky light is the barometer ------------------------------------------------------

const GLOW: Record<Mood, string> = {
  alert: "radial-gradient(60% 100% at 50% 100%, rgba(246,168,70,.62) 0%, rgba(246,178,90,.30) 38%, rgba(246,190,110,.08) 70%, rgba(246,190,110,0) 100%)",
  calm: "radial-gradient(60% 100% at 50% 100%, rgba(120,172,230,.50) 0%, rgba(120,172,230,.22) 40%, rgba(120,172,230,0) 100%)",
  happy: "radial-gradient(60% 100% at 50% 100%, rgba(206,245,92,.70) 0%, rgba(206,245,92,.28) 40%, rgba(206,245,92,0) 100%)",
};

export function SkyBackdrop({ mood, night, glowBottom }: { mood: Mood; night: boolean; glowBottom: number }) {
  const reduce = useReduced();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${C.sky0} 0%, ${C.sky1} 55%, ${C.sky2} 100%)` }} />
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: night ? 1 : 0 }}
        transition={{ duration: 1.2 }}
        style={{ background: `linear-gradient(180deg, ${C.night0} 0%, ${C.night1} 60%, ${C.night2} 100%)` }}
      />
      {night ? <Stars /> : null}
      <motion.div
        className="absolute inset-x-[-20%]"
        style={{ height: 320, background: "radial-gradient(60% 100% at 50% 100%, rgba(150,138,255,.32) 0%, rgba(150,138,255,.1) 45%, rgba(150,138,255,0) 100%)" }}
        initial={false}
        animate={{ opacity: night ? 1 : 0, bottom: glowBottom - 26 }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
      />
      {/* the light over the horizon, one layer per mood, crossfading */}
      {(["alert", "calm", "happy"] as Mood[]).map((m) => (
        <motion.div
          key={m}
          className="absolute inset-x-[-20%]"
          style={{ height: 380, background: GLOW[m] }}
          initial={false}
          animate={{ opacity: !night && m === mood ? (m === "alert" && !reduce ? [1, 0.7, 1] : 1) : 0, bottom: glowBottom - 26 }}
          transition={{
            // a watchful sky breathes slowly; calm and glad hold still
            opacity: m === mood && m === "alert" && !reduce ? { duration: 6, repeat: Infinity, ease: "easeInOut" } : { duration: 1.4, ease: "easeInOut" },
            bottom: { type: "spring", stiffness: 300, damping: 34 },
          }}
        />
      ))}
    </div>
  );
}

function Stars() {
  // a low-discrepancy scatter: evenly spread, never a line
  const stars = Array.from({ length: 28 }, (_, i) => ({ x: (i * 61.803 + 7) % 100, y: (i * 38.197 + 3) % 58, r: i % 4 === 0 ? 1.6 : 1 }));
  return (
    <>
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, background: "#fff" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.2, 0.75, 0.35] }}
          transition={{ duration: 3 + (i % 5), repeat: Infinity, repeatType: "mirror", delay: i * 0.13 }}
        />
      ))}
    </>
  );
}

// ---- the people ------------------------------------------------------------------------------------

const LOOK: Record<Crew["altitude"], DiscLook> = { heavy: "heavy", work: "work", unseen: "unseen", held: "held", free: "free", away: "away" };

function badgeGlyph(c: Crew): ReactNode {
  if (c.moves > 1) return <span style={{ fontSize: 10, fontWeight: 700 }}>{c.moves}</span>;
  switch (c.worst) {
    case "overdue":
      return <Icon name="clock" size={11} stroke={2.4} />;
    case "declined":
      return <Icon name="return" size={11} stroke={2.4} />;
    case "review":
      return <Icon name="check" size={11} stroke={2.8} />;
    default:
      return c.reason === "вопрос" ? <span style={{ fontSize: 11, fontWeight: 800 }}>?</span> : <Icon name="chat" size={10} stroke={2.4} />;
  }
}

export function People({
  crew,
  spots,
  mode,
  night,
  focus,
  dim,
  pulses,
  drops,
  onPerson,
}: {
  crew: Crew[];
  spots: Record<string, Spot>;
  mode: "full" | "band";
  night: boolean;
  /** the person the ground speaks about: lifted and ringed */
  focus: string | null;
  /** quiet everyone but the focus */
  dim: boolean;
  /** a counter per person: each change plays a landing ring */
  pulses: Record<string, number>;
  /** a counter per person: each change drops the disc onto its place */
  drops: Record<string, number>;
  onPerson: (id: string) => void;
}) {
  const reduce = useReduced();
  return (
    <>
      {crew.map((c) => {
        const s = spots[c.id];
        if (!s) return null;
        const focused = focus === c.id;
        const quiet = dim && !focused;
        const ring = (c.altitude === "heavy" && mode === "full") || focused;
        const tone = TONE[c.tone];
        return (
          <motion.div
            key={c.id}
            className="absolute left-0 top-0"
            initial={false}
            animate={{ x: s.x, y: s.y - (focused && mode === "full" ? 6 : 0), opacity: s.show ? (quiet ? 0.35 : 1) : 0 }}
            transition={reduce ? { duration: 0 } : SOFT}
            style={{ pointerEvents: s.show ? "auto" : "none", zIndex: c.altitude === "heavy" ? 3 : 2 }}
          >
            {s.label !== "inline" ? (
            <motion.button
              type="button"
              aria-label={`${c.person.short}${c.reason ? `, ${c.reason}` : ""}`}
              onClick={() => onPerson(c.id)}
              className="absolute flex flex-col items-center"
              style={{ left: 0, top: 0, x: "-50%", y: -s.size / 2, WebkitTapHighlightColor: "transparent", minWidth: 44 }}
              whileTap={{ scale: 0.92 }}
            >
              <motion.span
                key={drops[c.id] ?? 0}
                className="relative block"
                initial={drops[c.id] && !reduce ? { y: -34, scale: 0.9 } : false}
                animate={{ y: 0, scale: 1 }}
                transition={SETTLE}
              >
                <IdleBob on={!reduce && mode === "full" && (c.altitude === "work" || c.altitude === "unseen" || c.altitude === "held")} seed={c.id}>
                  <motion.span className="block" initial={false} animate={{ width: s.size, height: s.size }} transition={SOFT}>
                    <Disc initials={c.person.initials} look={LOOK[c.altitude]} size={s.size} ring={ring} night={night} />
                  </motion.span>
                </IdleBob>
                {c.altitude === "heavy" && s.label === "full" ? (
                  <span
                    className="absolute grid place-items-center rounded-full"
                    style={{ right: -5, top: -5, width: 20, height: 20, background: tone.fill, color: C.ink, boxShadow: `0 0 0 2px ${night ? C.night1 : C.sky1}` }}
                  >
                    {badgeGlyph(c)}
                  </span>
                ) : null}
                <Burst n={pulses[c.id] ?? 0} size={s.size} />
              </motion.span>
              {s.label === "full" ? (
                <span className="mt-1.5 flex flex-col items-center whitespace-nowrap leading-[15px]">
                  <span className="text-[12.5px] font-semibold" style={{ color: night ? "#E7ECF3" : C.onSky }}>
                    {c.person.short}
                  </span>
                  <span className="text-[11.5px] font-medium" style={{ color: c.altitude === "heavy" ? (night ? tone.fill : tone.deep) : night ? "#9AA6BA" : C.onSky3 }}>
                    {c.reason}
                  </span>
                </span>
              ) : null}
              {s.label === "none" && focused ? (
                <span className="absolute top-[38px] whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-semibold leading-4" style={{ background: C.lime, color: C.limeInk }}>
                  {firstName(c.person)}
                </span>
              ) : null}
            </motion.button>
            ) : null}
            {s.label === "inline" ? (
              <button
                type="button"
                aria-label={`${c.person.short}, ${c.reason}`}
                onClick={() => onPerson(c.id)}
                className="absolute flex items-center gap-1.5 whitespace-nowrap"
                style={{ left: 0, top: 0, transform: "translate(-12px,-12px)", minHeight: 24 }}
              >
                <Disc initials={c.person.initials} look={LOOK[c.altitude]} size={24} ring={focus === c.id} />
                <span className="text-[12px] font-medium" style={{ color: night ? "#9AA6BA" : C.onSky3 }}>
                  {c.altitude === "away" ? (
                    <>
                      {firstName(c.person)} <Icon name="moon" size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {c.reason}
                    </>
                  ) : (
                    firstName(c.person)
                  )}
                </span>
              </button>
            ) : null}
          </motion.div>
        );
      })}
    </>
  );
}

/** Light discs breathe a few pixels up and down — people at work are moving. */
function IdleBob({ on, seed, children }: { on: boolean; seed: string; children: ReactNode }) {
  if (!on) return <>{children}</>;
  const d = 3.6 + hash(seed) * 2;
  return (
    <motion.span className="block" animate={{ y: [0, -4, 0] }} transition={{ duration: d, repeat: Infinity, ease: "easeInOut", delay: hash(seed + "d") * 2 }}>
      {children}
    </motion.span>
  );
}

/** The landing ring: something the director sent has arrived at this person. */
function Burst({ n, size }: { n: number; size: number }) {
  return (
    <AnimatePresence>
      {n > 0 ? (
        <motion.span
          key={n}
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{ inset: 0, boxShadow: `0 0 0 3px ${C.lime}` }}
          initial={{ scale: 0.9, opacity: 1 }}
          animate={{ scale: 1.9, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <span className="sr-only">{size}</span>
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** «+3» at the end of the folded band. */
export function BandMore({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <motion.span
      className="absolute grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold"
      style={{ left: 0, top: 0, background: "rgba(255,255,255,.6)", color: C.onSky2 }}
      initial={false}
      animate={{ x: x - 16, y: y - 16, opacity: n ? 1 : 0 }}
    >
      +{n}
    </motion.span>
  );
}
