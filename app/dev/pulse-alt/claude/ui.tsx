"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Person } from "@/app/dev/pulse-alt/fixtures";

import { seeded, type Mood } from "./model";

// ---- icons: thin line, 24 grid -----------------------------------------------------------------

const PATHS: Record<string, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  up: <path d="M12 19V5.5M6 11.5l6-6 6 6" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.3 4.3L19 7.2" />,
  right: <path d="M9.5 6l6 6-6 6" />,
  left: <path d="M14.5 6l-6 6 6 6" />,
  down: <path d="M6 9.5l6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  repeat: <path d="M16.5 3.5l3 3-3 3M4.5 11v-.5a4 4 0 0 1 4-4h11M7.5 20.5l-3-3 3-3M19.5 13v.5a4 4 0 0 1-4 4h-11" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c1.2-3.6 3.9-5.4 7-5.4s5.8 1.8 7 5.4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c1-3.2 3.3-4.8 6-4.8s5 1.6 6 4.8M15.5 5.6a3.1 3.1 0 0 1 0 5.8M17.5 14.9c1.6.6 2.8 2.2 3.5 4.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.8" y="5.3" width="16.4" height="15" rx="2.6" />
      <path d="M3.8 10h16.4M8.3 3.3v4M15.7 3.3v4" />
    </>
  ),
  megaphone: <path d="M4.5 10v4a1 1 0 0 0 1 1H7l6.5 4.2V4.8L7 9H5.5a1 1 0 0 0-1 1zM17 9.2a3.6 3.6 0 0 1 0 5.6M19.4 6.8a7 7 0 0 1 0 10.4" />,
  trophy: <path d="M8 4h8v5.2a4 4 0 0 1-8 0zM8 6H5.2v1.3A3.2 3.2 0 0 0 8.2 10.5M16 6h2.8v1.3a3.2 3.2 0 0 1-3 3.2M12 13.2v3.6M8.6 20.2h6.8M9.6 16.8h4.8" />,
  note: <path d="M6 3.8h8.2L18 7.6v12.6H6zM14 3.8v4h4M9 12.2h6M9 15.7h4.5" />,
  screen: (
    <>
      <rect x="3" y="4.8" width="18" height="12" rx="2.2" />
      <path d="M8.5 20.2h7M12 16.8v3.4" />
    </>
  ),
  tasks: <path d="M10 6.5h10M10 12h10M10 17.5h10M3.8 6.4l1.3 1.3L7.5 5.2M3.8 11.9l1.3 1.3 2.4-2.5M3.8 17.4l1.3 1.3 2.4-2.5" />,
  chat: <path d="M5 5.2h14A1.6 1.6 0 0 1 20.6 6.8v8.4A1.6 1.6 0 0 1 19 16.8h-8.6L6 20.3v-3.5H5a1.6 1.6 0 0 1-1.6-1.6V6.8A1.6 1.6 0 0 1 5 5.2z" />,
  bell: <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.2a2.1 2.1 0 0 0 4 0" />,
  wifiOff: <path d="M3.5 3.5l17 17M8.6 12.6a5 5 0 0 1 2.4-1M5.4 9.5A10 10 0 0 1 8 7.8M15.6 11.3a5 5 0 0 1 .9.7M12 5.6a10 10 0 0 1 6.6 3.3M12 18.5h.01" />,
  pin: (
    <>
      <path d="M12 21s-6.3-5.5-6.3-10.8a6.3 6.3 0 0 1 12.6 0C18.3 15.5 12 21 12 21z" />
      <circle cx="12" cy="10.2" r="2.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l4.6-4.4 3.4 3 3-2.6 5 4.2" />
    </>
  ),
  undo: <path d="M9 6.5L4.5 11 9 15.5M5 11h9.5a5 5 0 0 1 0 10H12" />,
  pencil: <path d="M4.5 19.5h4l10.2-10.2a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.5z" />,
  trash: <path d="M5 7h14M9.5 7V4.8h5V7M7 7l.8 12.2a1.6 1.6 0 0 0 1.6 1.5h5.2a1.6 1.6 0 0 0 1.6-1.5L17 7" />,
  pass: <path d="M4.5 12h14M13.5 6.5l5.5 5.5-5.5 5.5" />,
  share: <path d="M12 3.8v10.4M8 7.8l4-4 4 4M5.5 12.5v6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.3" />
      <path d="M15.6 15.6l4.4 4.4" />
    </>
  ),
  type: <path d="M5 7V5.5h14V7M12 5.5v13M9 18.5h6" />,
  open: <path d="M13.5 4.5h6v6M19.5 4.5L11 13M17.5 14.5v3.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2V8.3a1.8 1.8 0 0 1 1.8-1.8h3.7" />,
  remind: <path d="M12 4.5a6 6 0 0 0-6 6V15l-1.5 2.2h15L18 15v-4.5a6 6 0 0 0-6-6zM10 20.2a2.1 2.1 0 0 0 4 0M19 3.5l1.6-1M5 3.5l-1.6-1" />,
  again: <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9" />,
  revoke: <path d="M5 12a7 7 0 1 0 2-4.9M5 4.5v3.5h3.5M9.5 9.5l5 5M14.5 9.5l-5 5" />,
  door: <path d="M6 20.5V4.8a1 1 0 0 1 .8-1l8-1.6a1 1 0 0 1 1.2 1v17.3M4 20.5h16M13 12.2v.6" />,
  pulse: <path d="M2.5 12.5h5l2-4.6 3.4 9.6 2.6-7 1.6 2h4.4" />,
  home: <path d="M3.5 11.2L12 4l8.5 7.2M6 9.5v10h12v-10" />,
  play: <path d="M8 5.6v12.8l10.5-6.4z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
};

export function Icon({ name, size = 20, stroke = 1.6, className, style }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string; style?: CSSProperties }) {
  const filled = name === "play";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={{ flex: "none", ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

// ---- the pulse line: the assistant's face, reinterpreted -------------------------------------------

/** One 32-unit tile of each rhythm; the line scrolls one tile per loop like a calm monitor. */
const TILE: Record<Mood | "think" | "flat", string> = {
  calm: "C6 14 9.5 10.6 16 10.6 C22.5 10.6 26 14 32 14",
  alert: "L10.5 14 L13 16.6 L16.2 5 L19.4 18.6 L21.8 14 L32 14",
  happy: "L7.5 14 C9.5 14 10.4 9.2 13 9.2 C15.6 9.2 16 14 17.6 14 C19.2 14 19.7 7.6 22.6 7.6 C25.5 7.6 26 14 27.8 14 L32 14",
  think: "C4 14 6 9 8 9 C10 9 12 19 16 19 C20 19 22 9 24 9 C26 9 28 14 32 14",
  flat: "L32 14",
};

function tiled(kind: keyof typeof TILE): string {
  let d = "M0 14";
  for (let i = 0; i < 6; i++) {
    // shift every absolute x of the tile by i·32
    d += " " + TILE[kind].replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${(Number(x) + i * 32).toFixed(1)} ${y}`);
  }
  return d;
}

const LINE_SPEED: Record<keyof typeof TILE, number> = { calm: 3.4, alert: 1.9, happy: 2.3, think: 0.8, flat: 6 };
export const MOOD_COLOR: Record<Mood, string> = { alert: "var(--clay)", calm: "var(--ink-2)", happy: "var(--olive)" };

export function PulseLine({ mood, width = 72, height = 24, color, still = false, stroke = 1.8 }: { mood: Mood | "think" | "flat"; width?: number; height?: number; color?: string; still?: boolean; stroke?: number }) {
  const c = color ?? (mood === "think" ? "var(--ink-3)" : mood === "flat" ? "var(--ink-4)" : MOOD_COLOR[mood]);
  const view = (width / height) * 24;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${view} 24`}
      fill="none"
      aria-hidden
      style={{
        flex: "none",
        overflow: "hidden",
        WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%)",
        maskImage: "linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%)",
      }}
    >
      <g
        key={mood}
        className="pc-anim"
        style={{ animation: still ? "none" : `pc-line ${LINE_SPEED[mood]}s linear infinite`, transition: "stroke .6s" }}
      >
        <path d={tiled(mood)} stroke={c} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke .8s" }} />
      </g>
    </svg>
  );
}

/** The small mark that opens each of the assistant's replies: the pulse, beating quietly. */
export function Mark({ mood = "calm", think = false }: { mood?: Mood; think?: boolean }) {
  const color = mood === "happy" ? "var(--olive)" : "var(--clay)";
  return (
    <span className="inline-flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full" style={{ background: "var(--oat)" }}>
      {think ? (
        <PulseLine mood="think" width={26} height={14} stroke={1.8} />
      ) : (
        <span className="pc-anim inline-flex" style={{ color, animation: "pc-breath 2.4s ease-in-out infinite" }}>
          <Icon name="pulse" size={18} stroke={2} />
        </span>
      )}
    </span>
  );
}

// ---- people ---------------------------------------------------------------------------------------

export function Avatar({ person, size = 32, tone, style }: { person: Person | undefined; size?: number; tone?: "clay" | "olive" | "slate" | "plain"; style?: CSSProperties }) {
  const bg = tone === "clay" ? "var(--clay-soft)" : tone === "olive" ? "var(--olive-soft)" : tone === "slate" ? "var(--slate-soft)" : "var(--oat)";
  const fg = tone === "clay" ? "var(--clay-ink)" : tone === "olive" ? "var(--olive-ink)" : tone === "slate" ? "var(--slate-ink)" : "var(--ink-2)";
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-full font-medium"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36), letterSpacing: "0.01em", ...style }}
    >
      {person?.initials ?? "?"}
    </span>
  );
}

// ---- buttons and chips ----------------------------------------------------------------------------

type BtnKind = "primary" | "accent" | "quiet" | "ghost" | "soft";

const BTN: Record<BtnKind, CSSProperties> = {
  primary: { background: "var(--btn)", color: "var(--on-btn)" },
  accent: { background: "var(--clay)", color: "#FFFFFF" },
  quiet: { background: "var(--card)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--line-2)" },
  soft: { background: "var(--oat)", color: "var(--ink)" },
  ghost: { background: "transparent", color: "var(--ink-2)" },
};

export function Btn({
  kind = "quiet",
  children,
  onClick,
  icon,
  className = "",
  style,
  disabled,
  size = "md",
}: {
  kind?: BtnKind;
  children: ReactNode;
  onClick?: () => void;
  icon?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "lg" ? 52 : size === "sm" ? 36 : 44;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`pc-press inline-flex items-center justify-center gap-2 rounded-full px-4 font-medium whitespace-nowrap disabled:opacity-40 ${className}`}
      style={{ height: h, minHeight: h, fontSize: size === "lg" ? 16 : size === "sm" ? 14 : 15, ...BTN[kind], ...style }}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function Chip({
  children,
  onClick,
  icon,
  tone = "plain",
  dashed,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: string;
  tone?: "plain" | "clay" | "olive" | "slate";
  dashed?: boolean;
  style?: CSSProperties;
}) {
  const fg = tone === "clay" ? "var(--clay-ink)" : tone === "olive" ? "var(--olive-ink)" : tone === "slate" ? "var(--slate-ink)" : "var(--ink-2)";
  const bg = dashed ? "transparent" : tone === "clay" ? "var(--clay-soft)" : tone === "olive" ? "var(--olive-soft)" : tone === "slate" ? "var(--slate-soft)" : "var(--oat)";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`${onClick ? "pc-press" : ""} inline-flex max-w-full items-center gap-1.5 rounded-full px-3 text-[13.5px] whitespace-nowrap`}
      style={{
        height: 32,
        background: bg,
        color: fg,
        border: dashed ? `1.3px dashed ${tone === "clay" ? "var(--clay)" : "var(--ink-4)"}` : "none",
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span className="truncate">{children}</span>
    </Tag>
  );
}

// ---- a voice clip: the director's own voice is always there (principle 5) ---------------------------

export function VoiceClip({ sec, seed = 1, tone = "ink", compact = false }: { sec: number; seed?: number; tone?: "ink" | "clay"; compact?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const bars = compact ? 14 : 22;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    timer.current = setTimeout(() => setPlaying(false), sec * 1000);
  };
  const fg = tone === "clay" ? "var(--clay-ink)" : "var(--ink-2)";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      className="pc-press inline-flex items-center gap-2 rounded-full pr-3 pl-1"
      style={{ height: 36, background: "var(--card)", boxShadow: "inset 0 0 0 1px var(--line)", color: fg }}
      aria-label={playing ? "Пауза" : `Прослушать ${sec} с`}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: tone === "clay" ? "var(--clay)" : "var(--btn)", color: tone === "clay" ? "#fff" : "var(--on-btn)" }}>
        <Icon name={playing ? "pause" : "play"} size={13} stroke={2.4} style={playing ? undefined : { marginLeft: 1 }} />
      </span>
      <span className="relative flex h-5 items-center gap-[2px]">
        {Array.from({ length: bars }, (_, i) => {
          const h = 4 + Math.round(seeded(seed * 31 + i) * 14);
          return <span key={i} className="w-[2px] rounded-full" style={{ height: h, background: "var(--ink-4)" }} />;
        })}
        <span
          className="pointer-events-none absolute inset-0 flex items-center gap-[2px] overflow-hidden"
          style={{
            clipPath: playing ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            transition: playing ? `clip-path ${sec}s linear` : "clip-path .2s",
          }}
        >
          {Array.from({ length: bars }, (_, i) => {
            const h = 4 + Math.round(seeded(seed * 31 + i) * 14);
            return <span key={i} className="w-[2px] flex-none rounded-full" style={{ height: h, background: fg }} />;
          })}
        </span>
      </span>
      <span className="pc-num text-[13px]" style={{ color: "var(--ink-3)" }}>
        0:{String(sec).padStart(2, "0")}
      </span>
    </button>
  );
}

/** The director's own words behind a card: a small play button with the length. */
export function MiniPlay({ sec }: { sec: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), sec * 1000);
    return () => clearTimeout(t);
  }, [on, sec]);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className="pc-press relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-full pr-2.5 pl-1 text-[12.5px]"
      style={{ background: "var(--oat)", color: "var(--ink-2)" }}
      aria-label={`Ваш голос, ${sec} с`}
    >
      <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--btn)", color: "var(--on-btn)" }}>
        <Icon name={on ? "pause" : "play"} size={10} stroke={2.6} />
      </span>
      <span className="pc-num relative">0:{String(sec).padStart(2, "0")}</span>
      <span className="absolute inset-y-0 left-0 w-full origin-left" style={{ background: "color-mix(in srgb, var(--clay) 18%, transparent)", transform: on ? "scaleX(1)" : "scaleX(0)", transition: on ? `transform ${sec}s linear` : "transform .2s" }} />
    </button>
  );
}

// ---- sheets ---------------------------------------------------------------------------------------

/**
 * A sheet of paper over the board. `panel` sheets stop under the dock (the composer stays on top,
 * the one way to speak never leaves); `over` sheets cover everything, `modal` are short pickers.
 */
export function Sheet({
  open,
  onClose,
  title,
  sub,
  level = "panel",
  children,
  right,
  height,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  sub?: ReactNode;
  level?: "panel" | "over" | "modal";
  children: ReactNode;
  right?: ReactNode;
  height?: string;
}) {
  const controls = useDragControls();
  const z = level === "panel" ? 20 : level === "over" ? 40 : 60;
  const top = level === "modal" ? undefined : level === "over" ? "calc(env(safe-area-inset-top) + 10px)" : "calc(env(safe-area-inset-top) + 58px)";
  const onEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 700) onClose();
  };
  return (
    <AnimatePresence>
      {open ? (
        <motion.div key="sheet" className="absolute inset-0" style={{ zIndex: z }} initial="hide" animate="show" exit="hide">
          <motion.div
            className="absolute inset-0"
            style={{ background: "var(--scrim)" }}
            variants={{ hide: { opacity: 0 }, show: { opacity: 1 } }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[480px] flex-col overflow-hidden rounded-t-[28px]"
            style={{
              top,
              maxHeight: level === "modal" ? "86%" : undefined,
              height: level === "modal" ? height : undefined,
              background: "var(--paper)",
              boxShadow: "var(--sh-3)",
              borderTop: "1px solid var(--line)",
            }}
            variants={{ hide: { y: "104%" }, show: { y: 0 } }}
            transition={{ type: "spring", damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.02, bottom: 0.7 }}
            onDragEnd={onEnd}
          >
            <header className="flex-none touch-none px-5 pt-2.5 pb-3" onPointerDown={(e) => controls.start(e)}>
              <div className="mx-auto mb-3 h-[5px] w-9 rounded-full" style={{ background: "var(--line-2)" }} />
              {title !== undefined ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="pc-serif text-[26px] leading-[32px] tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                      {title}
                    </div>
                    {sub ? (
                      <div className="mt-1 text-[14px] leading-[19px]" style={{ color: "var(--ink-3)" }}>
                        {sub}
                      </div>
                    ) : null}
                  </div>
                  {right}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрыть"
                    className="pc-press -mt-0.5 -mr-1.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full"
                    style={{ color: "var(--ink-2)" }}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--oat)" }}>
                      <Icon name="x" size={16} stroke={2} />
                    </span>
                  </button>
                </div>
              ) : null}
            </header>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Space a panel's scroll needs at the bottom so its last line clears the floating dock. */
export const DOCK_CLEAR = "calc(env(safe-area-inset-bottom) + 150px)";

export function Hairline({ style }: { style?: CSSProperties }) {
  return <div className="h-px w-full" style={{ background: "var(--line)", ...style }} />;
}
