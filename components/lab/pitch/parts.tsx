"use client";

import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";
import { HeadButton } from "@/components/ui/HeadButton";

import styles from "./pitch.module.css";

/* -------------------------------------------------------------------------- */
/* Motion helpers                                                              */
/* -------------------------------------------------------------------------- */

/** A block that rises into place the first time it scrolls into view — transform and opacity only. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A number that counts up once it is on screen; under reduced motion it simply stands there. */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "" }: { to: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const still = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!seen || still) return;
    const controls = animate(0, to, { duration: 1.3, ease: [0.2, 0, 0, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [seen, still, to]);

  const shown = still ? to : value;
  const text = shown.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} className="nums">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The cardiomonitor line                                                      */
/* -------------------------------------------------------------------------- */

// one beat on a 140-wide cell: the flat line, a small P, the QRS spike, a T and flat again
const BEAT = [
  [0, 30], [34, 30], [42, 25], [50, 30], [60, 30], [66, 36], [74, 4], [82, 54], [89, 30], [104, 30], [116, 21], [128, 30], [140, 30],
] as const;

const ECG_POINTS = Array.from({ length: 5 }, (_, beat) => BEAT.map(([x, y]) => `${x + beat * 140},${y}`).join(" ")).join(" ");

function EcgTrace({ glow = false }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 700 60" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
      {glow ? (
        <polyline
          points={ECG_POINTS}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.22}
          strokeWidth={8}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <polyline
        points={ECG_POINTS}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The brand's heartbeat across the page: a dim trace with the light running along it. */
export function EcgLine({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.ecg} ${className}`} aria-hidden>
      <div className={styles.ecgDim}>
        <EcgTrace />
      </div>
      <div className={styles.ecgWindow}>
        <div className={styles.ecgBright}>
          <EcgTrace glow />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Full screen for the presenter                                               */
/* -------------------------------------------------------------------------- */

const onFullscreen = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};
const never = () => () => {};

/** «На весь экран» in the head bar: a laptop on a projector loses the browser chrome. Hidden where the browser cannot (iPhone). */
export function FullscreenButton() {
  const can = useSyncExternalStore(never, () => document.fullscreenEnabled, () => false);
  const on = useSyncExternalStore(onFullscreen, () => document.fullscreenElement !== null, () => false);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);
  if (!can) return null;
  return (
    <HeadButton label={on ? "Выйти из полного экрана" : "На весь экран"} pressed={on} onClick={toggle}>
      <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </HeadButton>
  );
}

/* -------------------------------------------------------------------------- */
/* A card of the board, in miniature                                           */
/* -------------------------------------------------------------------------- */

export type CardKind = "task" | "announcement" | "reminder" | "event";
export type MarkTone = "muted" | "accent" | "ok" | "warn";
export type Mark = { tone: MarkTone; text: string };

// announcements are the Эфир's gold (DESIGN §1.3); a reminder is the director's own — the deep accent
const KIND: Record<CardKind, { label: string; color: string }> = {
  task: { label: "Задача", color: "var(--accent)" },
  event: { label: "Встреча", color: "var(--accent)" },
  announcement: { label: "Объявление", color: "var(--gold)" },
  reminder: { label: "Напоминание", color: "var(--accent-2)" },
};

const TONE: Record<MarkTone, string> = {
  muted: "var(--text-muted)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
};

/**
 * One parsed order as the director sees it: kind, person, what, by when, and the receipt line.
 * The receipt row is always there (a no-break space until it has words), so a card never
 * changes height when its receipt arrives.
 */
export function MiniCard({
  kind,
  who,
  badge,
  title,
  when,
  mark,
}: {
  kind: CardKind;
  who: string;
  /** what the round badge says; the first letter of `who` by default */
  badge?: string;
  title: string;
  when: string | null;
  mark?: Mark | null;
}) {
  const look = KIND[kind];
  return (
    <div className="card relative overflow-hidden py-3 pl-4 pr-3">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: look.color }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em]" style={{ color: look.color }}>
          {look.label}
        </span>
        <span className="nums shrink-0 text-[13px] leading-4 text-muted">{when ?? "без срока"}</span>
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full font-display text-[12px] font-bold"
          style={{ color: look.color, background: `color-mix(in srgb, ${look.color} 14%, var(--surface-2))` }}
        >
          {badge ?? who.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-4 text-muted">{who}</p>
          <p className="mt-0.5 text-[15px] font-medium leading-5">{title}</p>
        </div>
      </div>
      <p className="mt-2 flex h-4 items-center gap-1.5 text-[13px] leading-4">
        {mark ? (
          <motion.span
            key={mark.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className="flex items-center gap-1.5"
            style={{ color: TONE[mark.tone] }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE[mark.tone] }} />
            <span className="nums">{mark.text}</span>
          </motion.span>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Illustrations                                                               */
/* -------------------------------------------------------------------------- */

// a voice note's waveform: fixed heights, so the server and the browser draw the same bars
const WAVE = [5, 9, 14, 8, 12, 18, 11, 6, 13, 16, 9, 12, 7, 10, 15, 8, 5];

function Bubble({ out = false, children }: { out?: boolean; children: ReactNode }) {
  return (
    <div
      className={`max-w-[82%] rounded-[16px] px-3 py-2 text-[14px] leading-5 ${out ? "self-end rounded-br-[6px]" : "self-start rounded-bl-[6px]"}`}
      style={{ background: out ? "color-mix(in srgb, var(--surface-2) 82%, var(--accent))" : "var(--surface-2)" }}
    >
      {children}
    </div>
  );
}

function VoiceBubble({ length }: { length: string }) {
  return (
    <Bubble out>
      <span className="flex items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-text/90">
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden>
            <path d="M2.5 1.5v7l6-3.5z" fill="var(--bg)" />
          </svg>
        </span>
        <span aria-hidden className="flex h-5 items-center gap-[2px]">
          {WAVE.map((h, i) => (
            <span key={i} className="w-[2px] rounded-full bg-text/60" style={{ height: h }} />
          ))}
        </span>
        <span className="nums text-[12px] text-muted">{length}</span>
      </span>
    </Bubble>
  );
}

/** «Было»: how orders travel today — voice notes in a messenger, a reply, silence. */
export function ChatBefore() {
  return (
    <div className="card flex flex-col gap-2 p-3" aria-label="Пример переписки в мессенджере">
      <VoiceBubble length="0:47" />
      <Bubble out>Марат, что по КП?</Bubble>
      <VoiceBubble length="1:12" />
      <Bubble>Не видел, сейчас гляну</Bubble>
      <Bubble out>Кто сегодня на объекте??</Bubble>
      <p className="self-end pr-1 text-[12px] leading-4 text-muted">прочитано · без ответа</p>
    </div>
  );
}

/** The office wall in miniature (D-76): gold ticker, the face, the mark and the clock. */
export function TvWall() {
  const line = "Марат сдал «КП по объекту» · Айгуль приняла задачу · 14 из 16 дел в срок · Планёрка в 15:00 · Ерлан отправил фотоотчёт · ";
  return (
    <div className={styles.tv} aria-label="ТВ-экран в кабинете директора">
      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          <span className="px-2 py-1.5 text-[12px] font-medium leading-4 text-gold">{line}</span>
          <span aria-hidden className="px-2 py-1.5 text-[12px] font-medium leading-4 text-gold">
            {line}
          </span>
        </div>
      </div>
      <div className="grid flex-1 place-items-center">
        <Mascot state="calm" size={58} />
      </div>
      <div className="flex items-center justify-between px-4 pb-3">
        <PulseMark />
        <span className="nums font-display text-[19px] font-bold leading-6">10:42</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Glyphs                                                                      */
/* -------------------------------------------------------------------------- */

export type GlyphName = "mic" | "eye" | "stamp" | "cup" | "note" | "archive" | "team" | "star" | "phone" | "lock" | "tv";

const PATHS: Record<GlyphName, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  stamp: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.2 2.6 2.6 5-5.3" />
    </>
  ),
  cup: (
    <>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.8 1 .8 2-.1 3M12 3.5c-.8 1 .8 2-.1 3" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6Z" />
      <path d="M14 3.5V8h5M9 12.5h6.5M9 16h4.5" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
      <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M16.5 14.2a5 5 0 0 1 5 5.3" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8Z" />,
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
};

/** A stroke icon in a small rounded well, in the accent. */
export function Glyph({ name }: { name: GlyphName }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-border bg-surface-2 text-accent">
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name]}
      </svg>
    </span>
  );
}

/** A benefit: icon, a short title, one or two plain sentences. */
export function Tile({ icon, title, children }: { icon: GlyphName; title: string; children: ReactNode }) {
  return (
    <div className="card flex h-full gap-3 p-4">
      <Glyph name={icon} />
      <div className="min-w-0">
        <p className="font-display text-[17px] font-bold leading-[22px] tracking-[-0.01em]">{title}</p>
        <p className="mt-1 text-[15px] leading-[21px] text-muted">{children}</p>
      </div>
    </div>
  );
}
