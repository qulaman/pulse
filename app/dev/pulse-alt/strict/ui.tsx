"use client";

/**
 * Primitives of the «strict» entry: HUD labels, rules that draw themselves, an odometer for every
 * figure, the stage glyphs, keys with a decisive press, the receipt track, the voice clip (the
 * director's voice is always red), the glass sheet, the scan line, the barometer and the holo
 * seal. Motion is precise: short tweens and one-off scans, never a bounce.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { hhmm, type Mood } from "@/app/dev/pulse-alt/fixtures";

import type { Glyph as GlyphKind, ReceiptStep } from "./model";

export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const SNAP = { type: "spring", stiffness: 520, damping: 46, mass: 1 } as const;

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---- type ---------------------------------------------------------------------------------------

/** Small uppercase label, condensed. */
export function Lbl({ children, className, tone, style }: { children: ReactNode; className?: string; tone?: "ink" | "dim" | "seal" | "paper"; style?: CSSProperties }) {
  const color = tone === "seal" ? "var(--cyan)" : tone === "ink" ? "var(--text)" : tone === "paper" ? "var(--red-hi)" : "var(--text-3)";
  return (
    <span className={cx("lbl", className)} style={{ color, ...style }}>
      {children}
    </span>
  );
}

/** A hairline that draws itself from the left. */
export function Rule({ className, delay = 0, strong, style }: { className?: string; delay?: number; strong?: boolean; style?: CSSProperties }) {
  return (
    <motion.div
      aria-hidden
      className={cx("h-px w-full", className)}
      style={{ background: strong ? "linear-gradient(90deg, rgba(150,215,255,.75), rgba(150,215,255,.18) 55%, rgba(255,51,85,.45))" : "var(--line)", originX: 0, ...style }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    />
  );
}

// ---- figures ------------------------------------------------------------------------------------

function Digit({ d, roll, fast }: { d: number; roll: boolean; fast?: boolean }) {
  // the cell takes its width from a hidden «0» (tabular figures share one advance), so the
  // strip fits any font and width axis
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: "1em" }} aria-hidden>
      <span className="invisible block" style={{ height: "1em", lineHeight: "1em" }}>
        0
      </span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={roll ? { y: "0em" } : false}
        animate={{ y: `${-d}em` }}
        transition={{ duration: fast ? 0.18 : roll ? 0.7 : 0.42, ease: EASE }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block text-center" style={{ height: "1em", lineHeight: "1em" }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * An odometer: every digit is a strip that rolls to its place, so a count that changes ticks
 * like a mechanical counter. Non-digits are set as they are. `roll` rolls up from zero on mount.
 */
export function Figure({ value, roll = false, fast, className, style }: { value: number | string; roll?: boolean; fast?: boolean; className?: string; style?: CSSProperties }) {
  const str = String(value);
  const chars = str.split("");
  return (
    <span className={cx("num relative inline-flex items-start", className)} style={{ lineHeight: 1, ...style }} data-value={str}>
      <span className="sr-only">{str}</span>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={`d${chars.length - i}`} d={Number(ch)} roll={roll} fast={fast} />
        ) : (
          <span key={`c${chars.length - i}`} style={{ height: "1em", lineHeight: "1em" }} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

// ---- glyphs -------------------------------------------------------------------------------------

/** The stage of a person's main task as a 10 px square: solid / hatched / open / crossed / dashed. */
export function Glyph({ kind, size = 10, color = "var(--text)" }: { kind: GlyphKind; size?: number; color?: string }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden className="shrink-0">
      {kind === "solid" ? <rect x="0" y="0" width="10" height="10" fill={color} /> : null}
      {kind === "open" ? <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke={color} strokeWidth="1.5" /> : null}
      {kind === "dash" ? <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.6" opacity="0.6" /> : null}
      {kind === "hatch" ? (
        <g>
          <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M0 6.5L6.5 0M3.5 10L10 3.5M0 10L10 0" stroke={color} strokeWidth="1.2" />
        </g>
      ) : null}
      {kind === "cross" ? (
        <g>
          <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M2.2 2.2L7.8 7.8M7.8 2.2L2.2 7.8" stroke={color} strokeWidth="1.4" />
        </g>
      ) : null}
    </svg>
  );
}

// ---- keys ---------------------------------------------------------------------------------------

type KeyTone = "ink" | "line" | "seal" | "ghost" | "paper" | "seg";

/** A key with a decisive press: it sinks 1 px and lights up for as long as the finger is down. */
export function Key({
  children,
  onClick,
  tone = "line",
  className,
  disabled,
  style,
  testId,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: KeyTone;
  className?: string;
  disabled?: boolean;
  style?: CSSProperties;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        buzz(6);
        onClick?.();
      }}
      className={cx("key", `key-${tone}`, className)}
      style={style}
    >
      {children}
    </button>
  );
}

/** A short haptic tick where the platform has one (Android); iOS ignores it. */
export function buzz(ms: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* no haptics — fine */
  }
}

/** Keys joined into one strict strip, hairlines between them. */
export function Segmented({ children, className }: { children: ReactNode[]; className?: string }) {
  return (
    <div className={cx("cut cut-s frame mt-3 grid", className)} style={{ gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))`, background: "rgba(255,255,255,.02)" }}>
      {children}
    </div>
  );
}

// ---- receipt track ------------------------------------------------------------------------------

/** Sent → seen → accepted as three stations on a rule; a missing one is drawn open. */
export function ReceiptTrack({ steps, compact }: { steps: ReceiptStep[]; compact?: boolean }) {
  const reached = steps.filter((s) => s.at).length;
  return (
    <div className="relative" aria-label={steps.map((s) => `${s.word} ${s.at ? hhmm(s.at) : "—"}`).join(", ")}>
      <div className="absolute left-[4px] right-[4px] top-[4px] h-px" style={{ background: "var(--line-2)" }} />
      <motion.div
        className="absolute left-[4px] top-[4px] h-px"
        style={{ background: "var(--text-2)", originX: 0 }}
        initial={{ width: 0 }}
        animate={{ width: reached <= 1 ? 0 : `calc(${((reached - 1) / (steps.length - 1)) * 100}% - 8px)` }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      />
      <div className="relative grid grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.word} className={cx("flex flex-col", i === 1 && "items-center", i === 2 && "items-end")}>
            <span
              className="block h-[9px] w-[9px]"
              style={{ background: s.at ? "var(--text)" : "var(--bg)", border: s.at ? "none" : "1.5px solid var(--text-3)", boxShadow: s.at ? "0 0 8px rgba(200,235,255,.45)" : "none", transform: "rotate(45deg) scale(.8)" }}
            />
            <span className={cx("mt-1.5", compact ? "text-[11px]" : "text-[12px]")} style={{ color: s.at ? "var(--text-2)" : "var(--text-3)" }}>
              {s.word}
            </span>
            <span className="mono text-[11px]" style={{ color: s.at ? "var(--text)" : "var(--text-3)" }}>
              {s.at ? hhmm(s.at) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- voice clip ---------------------------------------------------------------------------------

/** The director's own voice behind a task (principle 5): a play key and a bar that runs. */
export function VoiceClip({ sec, wide, short }: { sec: number; wide?: boolean; short?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  // the director's own voice speaks in the corporate red, wherever it is kept
  const fg = "var(--red-hi)";
  const bars = BARS.slice(0, wide ? 34 : short ? 9 : 18);
  return (
    <button
      type="button"
      className="flex h-11 min-w-0 items-center gap-2.5"
      onClick={(e) => {
        e.stopPropagation();
        if (playing) {
          setPlaying(false);
          if (timer.current) window.clearTimeout(timer.current);
          return;
        }
        setPlaying(true);
        timer.current = window.setTimeout(() => setPlaying(false), sec * 1000);
      }}
      aria-label={playing ? "Остановить" : `Прослушать ${sec} с`}
    >
      <span className="cut cut-s frame frame-red grid h-7 w-7 shrink-0 place-items-center" style={{ background: "rgba(255,51,85,.1)" }}>
        {playing ? (
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
            <rect x="1" y="0" width="3" height="10" fill={fg} />
            <rect x="6" y="0" width="3" height="10" fill={fg} />
          </svg>
        ) : (
          <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden>
            <path d="M0 0L9 5L0 10Z" fill={fg} />
          </svg>
        )}
      </span>
      <span className="relative flex h-5 items-center gap-[2px]">
        {bars.map((h, i) => (
          <span key={i} className="block w-[2px]" style={{ height: `${h}px`, background: fg, opacity: 0.28 }} />
        ))}
        <motion.span
          className="absolute inset-y-0 left-0 flex items-center gap-[2px] overflow-hidden"
          initial={false}
          animate={{ width: playing ? "100%" : "0%" }}
          transition={playing ? { duration: sec, ease: "linear" } : { duration: 0.15 }}
        >
          {bars.map((h, i) => (
            <span key={i} className="block w-[2px] shrink-0" style={{ height: `${h}px`, background: fg }} />
          ))}
        </motion.span>
      </span>
      <span className="mono text-[12px]" style={{ color: fg }}>
        0:{String(sec).padStart(2, "0")}
      </span>
    </button>
  );
}

const BARS = [6, 10, 14, 8, 16, 12, 18, 9, 13, 17, 11, 7, 15, 10, 6, 12, 16, 8, 14, 18, 10, 6, 13, 9, 17, 12, 7, 15, 11, 8, 14, 10, 6, 12];

// ---- barometer ----------------------------------------------------------------------------------

/**
 * The board's barometer (D-68, D-70): a ruler with a needle — left «начеку», middle «спокойно»,
 * right «хорошо». Never red, never angry; it only reads the board.
 */
export function Gauge({ mood, word }: { mood: Mood; word: string }) {
  const pos = mood === "alert" ? 0.14 : mood === "calm" ? 0.5 : 0.86;
  return (
    <div className="flex items-center gap-2.5" aria-label={`Барометр: ${word}`}>
      <div className="relative h-[14px] w-[62px]">
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className="absolute bottom-0 w-px"
            style={{ left: `${i * 10}%`, height: i % 5 === 0 ? 8 : 4, background: "var(--text-3)" }}
          />
        ))}
        <motion.span
          className="absolute bottom-0 h-[14px] w-[2px]"
          style={{ background: mood === "happy" ? "var(--text)" : "var(--cyan)", marginLeft: -1, boxShadow: "0 0 8px rgba(70,228,255,.8)" }}
          initial={{ left: "50%" }}
          animate={{ left: `${pos * 100}%` }}
          transition={{ type: "spring", stiffness: 170, damping: 26, delay: 0.25 }}
        />
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={word}
          className="lbl"
          style={{ color: "var(--text)" }}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ---- sheet --------------------------------------------------------------------------------------

/**
 * A chamfered glass sheet with a luminous edge: slides up, drags down to close, a dark scrim
 * underneath. Closing returns to exactly where the screen was — the sheet never navigates.
 */
export function Sheet({
  open,
  onClose,
  label,
  title,
  children,
  footer,
  tall,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  label?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div key="sheet" className="absolute inset-0 z-40" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ background: "rgba(2,3,6,.62)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            data-testid={testId}
            role="dialog"
            className="cut cut-l frame absolute inset-x-0 bottom-0 flex flex-col"
            style={{
              background: "linear-gradient(180deg, rgba(22,27,38,.97), rgba(9,11,16,.985))",
              maxHeight: tall ? "calc(100% - 53px - env(safe-area-inset-top))" : "84%",
              height: tall ? "calc(100% - 53px - env(safe-area-inset-top))" : undefined,
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduce ? { duration: 0 } : { duration: 0.34, ease: EASE }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            dragListener
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose();
            }}
          >
            <Scan />
            <div className="flex shrink-0 justify-center pt-2">
              <span className="block h-[3px] w-9" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.8)" }} />
            </div>
            {label || title ? (
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
                <div className="min-w-0">
                  {label ? <div className="mb-1">{label}</div> : null}
                  {title ? <div className="text-[19px] font-semibold leading-[1.22] tracking-[-0.01em]">{title}</div> : null}
                </div>
                <button type="button" onClick={onClose} className="lbl -mr-2 -mt-1 h-11 shrink-0 px-2" style={{ color: "var(--cyan-hi)" }}>
                  Закрыть
                </button>
              </div>
            ) : null}
            <div className="h-px shrink-0" style={{ background: "linear-gradient(90deg, rgba(150,215,255,.6), rgba(150,215,255,.1))", margin: "0 20px" }} />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onPointerDownCapture={(e) => e.stopPropagation()}>
              {children}
            </div>
            {footer ? <div className="shrink-0 px-5 pb-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * One luminous scan line passes over a surface as it appears — once, on the compositor
 * (a transform), and not at all with reduced motion.
 */
export function Scan({ delay = 0, color = "rgba(120,225,255,.55)" }: { delay?: number; color?: string }) {
  return (
    <motion.span
      aria-hidden
      className="scan pointer-events-none absolute inset-x-0 top-0 z-[3] block h-[2px]"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 14px ${color}` }}
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: [0, 520], opacity: [0, 1, 0] }}
      transition={{ duration: 0.7, ease: "easeOut", delay, times: [0, 0.15, 1] }}
    />
  );
}

// ---- the seal -----------------------------------------------------------------------------------

/**
 * The holo seal: what the director sent is sealed and transmitted. A beam goes up, the rings
 * draw, the count lands, the outer ring keeps turning while it is on screen. Pointer-transparent:
 * it never stands between the director and the next action (principle 1a).
 */
export function Seal({ count, time, caption, word = "Отправлено" }: { count: number; time: string; caption: string; word?: string }) {
  const ringText = `${word.toUpperCase()} · ${time} · ЗАВЕРЕНО · ${word.toUpperCase()} · ${time} · ЗАВЕРЕНО ·`;
  return (
    <motion.div className="pointer-events-none relative flex flex-col items-center" initial={{ opacity: 1 }} exit={{ opacity: 0, y: -16, transition: { duration: 0.35, ease: EASE } }}>
      <motion.span
        aria-hidden
        className="scan absolute left-1/2 top-[94px] block w-[2px]"
        style={{ height: 420, marginLeft: -1, background: "linear-gradient(180deg, transparent, rgba(255,51,85,.95), transparent)", boxShadow: "0 0 18px rgba(255,51,85,.9)", originY: 1 }}
        initial={{ y: 200, scaleY: 0.2, opacity: 0 }}
        animate={{ y: -620, scaleY: 1, opacity: [0, 1, 0] }}
        transition={{ duration: 0.55, ease: "easeIn" }}
      />
      <motion.div
        initial={{ scale: 1.25, opacity: 0 }}
        animate={{ scale: [1.25, 1.25, 0.98, 1], opacity: [0, 1, 1, 1] }}
        transition={{ duration: 0.6, times: [0, 0.4, 0.8, 1], ease: "easeIn" }}
        style={{ filter: "drop-shadow(0 0 10px rgba(255,51,85,.45))" }}
      >
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden>
          <defs>
            <path id="seal-ring" d="M100,100 m-75,0 a75,75 0 1,1 150,0 a75,75 0 1,1 -150,0" />
          </defs>
          <g style={{ transformOrigin: "100px 100px", animation: "cy-spin 16s linear infinite" }}>
            <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,51,85,.55)" strokeWidth="1" strokeDasharray="2 7" />
          </g>
          <motion.circle cx="100" cy="100" r="89" fill="none" stroke="#FF3355" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.42, ease: EASE }} />
          <motion.polygon
            points="100,40 152,70 152,130 100,160 48,130 48,70"
            fill="rgba(70,228,255,.06)"
            stroke="#46E4FF"
            strokeWidth="1.4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
          />
          <g style={{ transformOrigin: "100px 100px", animation: "cy-spin-back 24s linear infinite" }}>
            <motion.text fontSize="10.5" fontWeight="600" fill="#FF8197" style={{ fontFamily: "var(--display)", fontStretch: "80%", letterSpacing: "1.2px" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.18 }}>
              <textPath href="#seal-ring" textLength={462} lengthAdjust="spacingAndGlyphs">
                {ringText}
              </textPath>
            </motion.text>
          </g>
          <text x="100" y="112" textAnchor="middle" fontSize="46" fontWeight="700" fill="#E8FBFF" style={{ fontFamily: "var(--display)", fontStretch: "75%" }}>
            {count}
          </text>
          <text x="100" y="131" textAnchor="middle" fontSize="9.5" fontWeight="600" letterSpacing="1.8" fill="#46E4FF" style={{ fontFamily: "var(--display)", fontStretch: "80%" }}>
            {count === 1 ? "ПУНКТ" : count < 5 ? "ПУНКТА" : "ПУНКТОВ"}
          </text>
        </svg>
      </motion.div>
      <motion.p
        className="mt-3 max-w-[300px] text-center text-[14px] leading-[1.45]"
        style={{ color: "var(--text-2)" }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3, ease: EASE }}
      >
        {caption}
      </motion.p>
    </motion.div>
  );
}

// ---- icons --------------------------------------------------------------------------------------

export function Icon({ name, size = 20 }: { name: "pulse" | "tasks" | "calendar" | "notes" | "screen" | "profile" | "text" | "close" | "more" | "mic" | "arrow" | "send" | "back"; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {name === "pulse" ? (
        <g {...common}>
          <path d="M4 20V13M10 20V6M16 20V10M22 20H2" />
        </g>
      ) : null}
      {name === "tasks" ? (
        <g {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" />
          <path d="M7.5 12.2l3 3 6-6.5" />
        </g>
      ) : null}
      {name === "calendar" ? (
        <g {...common}>
          <rect x="3.5" y="5.5" width="17" height="15" />
          <path d="M3.5 10h17M8 3v5M16 3v5" />
        </g>
      ) : null}
      {name === "notes" ? (
        <g {...common}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </g>
      ) : null}
      {name === "screen" ? (
        <g {...common}>
          <rect x="2.5" y="4.5" width="19" height="12" />
          <path d="M8 20.5h8M12 16.5v4" />
        </g>
      ) : null}
      {name === "profile" ? (
        <g {...common}>
          <circle cx="12" cy="8.5" r="4" />
          <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
        </g>
      ) : null}
      {name === "text" ? (
        <g {...common}>
          <path d="M4 7V4.5h16V7M12 4.5v15M9 19.5h6" />
        </g>
      ) : null}
      {name === "close" ? (
        <g {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </g>
      ) : null}
      {name === "more" ? (
        <g fill="currentColor">
          <rect x="4" y="10.5" width="3" height="3" />
          <rect x="10.5" y="10.5" width="3" height="3" />
          <rect x="17" y="10.5" width="3" height="3" />
        </g>
      ) : null}
      {name === "mic" ? (
        <g {...common}>
          <rect x="9" y="3" width="6" height="11" />
          <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
        </g>
      ) : null}
      {name === "arrow" ? (
        <g {...common}>
          <path d="M9 5l7 7-7 7" />
        </g>
      ) : null}
      {name === "back" ? (
        <g {...common}>
          <path d="M15 5l-7 7 7 7" />
        </g>
      ) : null}
      {name === "send" ? (
        <g {...common}>
          <path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" />
        </g>
      ) : null}
    </svg>
  );
}
