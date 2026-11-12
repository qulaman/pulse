"use client";

/**
 * Primitives of «Чей ход»: the tokens, one icon set drawn for this screen, the person's disc,
 * the press feedback, sheets and the undo toast. Everything visual the screens share lives here.
 */
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { Tone } from "./model";

// ---- tokens --------------------------------------------------------------------------------------

export const C = {
  // the sky — the team's side
  sky0: "#D3DDE4",
  sky1: "#E6ECEF",
  sky2: "#F1F3F2",
  onSky: "#101418",
  onSky2: "#4F5A64",
  onSky3: "#86919A",
  // the ground — the director's side
  ink: "#0F1215",
  ink2: "#181C20",
  ink3: "#21262B",
  ink4: "#2B3137",
  line: "rgba(255,255,255,.08)",
  onInk: "#EEF1F3",
  onInk2: "#A2ABB3",
  onInk3: "#6E7880",
  // the one accent: «you» — the key, your move, what you send
  lime: "#D2F55C",
  limeDeep: "#9DBD1E",
  limeInk: "#1A2200",
  limeRing: "#C3EA3E",
  // lanes — information, never alarm
  amber: "#F0A73C",
  amberDeep: "#A86400",
  lav: "#A797FF",
  lavDeep: "#5E4BD6",
  blue: "#6FB1FF",
  blueDeep: "#2369C4",
  mint: "#5FD39A",
  mintDeep: "#178A55",
  slate: "#93A1AE",
  // night (outside the delivery window)
  night0: "#070D1C",
  night1: "#111B33",
  night2: "#1E2945",
};

export const TONE: Record<Tone, { fill: string; deep: string }> = {
  amber: { fill: C.amber, deep: C.amberDeep },
  lav: { fill: C.lav, deep: C.lavDeep },
  mint: { fill: C.mint, deep: C.mintDeep },
  blue: { fill: C.blue, deep: C.blueDeep },
  slate: { fill: C.slate, deep: C.onSky2 },
  glass: { fill: "#C9D2D9", deep: C.onSky3 },
  lime: { fill: C.lime, deep: C.limeDeep },
};

export const SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;
export const SOFT = { type: "spring", stiffness: 210, damping: 28 } as const;
export const SETTLE = { type: "spring", stiffness: 260, damping: 18, mass: 0.9 } as const;
export const EASE_OUT = [0.2, 0.7, 0.2, 1] as const;

export const MONO: CSSProperties = { fontFamily: "var(--own-mono), ui-monospace, monospace", fontStretch: "75%", fontVariationSettings: '"wdth" 75', fontVariantNumeric: "tabular-nums" };

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** prefers-reduced-motion, hydration-safe: the server and the first client render agree (false). */
export function useReduced(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** A light buzz on Android where the browser allows it — iOS ignores it silently. */
export function buzz(ms: number | number[] = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* no haptics here */
  }
}

// ---- icons -------------------------------------------------------------------------------------

export type IconName =
  | "voice" | "text" | "close" | "chev" | "chevDown" | "more" | "check" | "clock" | "up" | "down" | "swap" | "play" | "pause"
  | "people" | "calendar" | "broadcast" | "plus" | "repeat" | "note" | "bell" | "task" | "pin" | "offline" | "bellOff"
  | "home" | "draft" | "moon" | "pulse" | "list" | "screen" | "user" | "trophy" | "chat" | "door" | "back" | "send"
  | "edit" | "trash" | "undo" | "return" | "hand" | "arrowUpRight" | "spark" | "photo" | "place" | "cup" | "flag";

export function Icon({ name, size = 20, stroke = 1.7, style, className }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const body = (() => {
    switch (name) {
      case "voice":
        return (
          <g {...p} strokeWidth={stroke + 0.6}>
            <path d="M6 10v4M10 6.5v11M14 8.5v7M18 10.5v3" />
          </g>
        );
      case "text":
        return (
          <g {...p}>
            <path d="M4 18 8.5 6h1L14 18M5.6 14h6.8" />
            <path d="M16.5 10.5c.6-.6 1.4-.9 2.3-.9 1.5 0 2.2.8 2.2 2.2V18m0-4.2c-.6-.5-1.5-.7-2.3-.7-1.4 0-2.4.7-2.4 2.1 0 1.3.9 2 2.1 2 1.2 0 2-.6 2.6-1.4" />
          </g>
        );
      case "close":
        return <path {...p} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
      case "chev":
        return <path {...p} d="M9.5 6l6 6-6 6" />;
      case "chevDown":
        return <path {...p} d="M6 9.5l6 6 6-6" />;
      case "back":
        return <path {...p} d="M14.5 6l-6 6 6 6" />;
      case "more":
        return (
          <g fill="currentColor">
            <circle cx="6" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18" cy="12" r="1.6" />
          </g>
        );
      case "check":
        return <path {...p} d="M5.5 12.5l4.2 4.2 8.8-9.4" />;
      case "clock":
        return (
          <g {...p}>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7.6V12l3 2" />
          </g>
        );
      case "up":
        return <path {...p} d="M12 19V5m-6 6 6-6 6 6" />;
      case "down":
        return <path {...p} d="M12 5v14m-6-6 6 6 6-6" />;
      case "swap":
        return <path {...p} d="M7 7h11l-3-3M17 17H6l3 3" />;
      case "play":
        return <path fill="currentColor" d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.6-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8z" />;
      case "pause":
        return (
          <g fill="currentColor">
            <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
            <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
          </g>
        );
      case "people":
        return (
          <g {...p}>
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
            <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.4 14.3c1.6.6 2.7 2.2 3.1 4.7" />
          </g>
        );
      case "calendar":
        return (
          <g {...p}>
            <rect x="4" y="5.5" width="16" height="14" rx="3" />
            <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
          </g>
        );
      case "broadcast":
        return (
          <g {...p}>
            <circle cx="12" cy="12" r="1.8" />
            <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.4 9.4 0 0 1 0-13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2" />
          </g>
        );
      case "plus":
        return <path {...p} d="M12 5v14M5 12h14" />;
      case "repeat":
        return <path {...p} d="M17 4.5l2.5 2.5L17 9.5M19.5 7H9a4.5 4.5 0 0 0-4.5 4.5M7 19.5 4.5 17 7 14.5M4.5 17H15a4.5 4.5 0 0 0 4.5-4.5" />;
      case "note":
        return (
          <g {...p}>
            <path d="M6 4h8.5L19 8.5V20H6z" />
            <path d="M14 4v5h5M9 13h7M9 16.5h5" />
          </g>
        );
      case "bell":
        return (
          <g {...p}>
            <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
            <path d="M10 20.5h4" />
          </g>
        );
      case "bellOff":
        return (
          <g {...p}>
            <path d="M9 5.9A5.5 5.5 0 0 1 17.5 11v4M6.5 9.6v6.9L5 18h12M10 20.5h4M4 4l16 16" />
          </g>
        );
      case "task":
        return (
          <g {...p}>
            <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
            <path d="M8.5 12.2l2.4 2.4 4.8-5" />
          </g>
        );
      case "pin":
        return (
          <g {...p}>
            <path d="M12 21s6-5.3 6-10.5A6 6 0 0 0 6 10.5C6 15.7 12 21 12 21z" />
            <circle cx="12" cy="10.5" r="2.2" />
          </g>
        );
      case "place":
        return (
          <g {...p}>
            <path d="M12 21s6-5.3 6-10.5A6 6 0 0 0 6 10.5C6 15.7 12 21 12 21z" />
            <circle cx="12" cy="10.5" r="2.2" />
          </g>
        );
      case "offline":
        return (
          <g {...p}>
            <path d="M3.5 9.5a12.5 12.5 0 0 1 4.4-2.6M11.4 6.1a12.6 12.6 0 0 1 9.1 3.4M6.5 12.8a8 8 0 0 1 3.1-1.8M14.6 11a8 8 0 0 1 2.9 1.8M9.7 16a3.6 3.6 0 0 1 4.6 0" />
            <path d="M4 4l16 16" />
          </g>
        );
      case "home":
        return (
          <g {...p}>
            <rect x="7" y="3" width="10" height="18" rx="2.5" />
            <path d="M12 7v6m-2.5-2.5L12 13l2.5-2.5M10.5 17.5h3" />
          </g>
        );
      case "draft":
        return (
          <g {...p}>
            <path d="M5 19h4l9.5-9.5a2.1 2.1 0 0 0-3-3L6 16z" />
            <path d="M14 8l3 3" />
          </g>
        );
      case "edit":
        return (
          <g {...p}>
            <path d="M5 19h4l9.5-9.5a2.1 2.1 0 0 0-3-3L6 16z" />
          </g>
        );
      case "moon":
        return <path {...p} d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />;
      case "pulse":
        return <path {...p} d="M3 12.5h4l2-5 3.5 10 2.5-7 1.5 2h4.5" />;
      case "list":
        return (
          <g {...p}>
            <path d="M10 7h10M10 12h10M10 17h10" />
            <path d="M4 7l1.2 1.2L7.5 6M4 12l1.2 1.2 2.3-2.2M4 17l1.2 1.2 2.3-2.2" />
          </g>
        );
      case "screen":
        return (
          <g {...p}>
            <rect x="3.5" y="5" width="17" height="11.5" rx="2.5" />
            <path d="M9 20h6M12 16.5V20" />
          </g>
        );
      case "user":
        return (
          <g {...p}>
            <circle cx="12" cy="8.5" r="3.6" />
            <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
          </g>
        );
      case "trophy":
        return (
          <g {...p}>
            <path d="M8 4.5h8v5a4 4 0 0 1-8 0z" />
            <path d="M8 6.5H5.2a2.8 2.8 0 0 0 3.3 3.6M16 6.5h2.8a2.8 2.8 0 0 1-3.3 3.6M12 13.5V17M8.5 20h7M9.5 17h5v3h-5z" />
          </g>
        );
      case "chat":
        return <path {...p} d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16h0A2.5 2.5 0 0 1 5 13.5z" />;
      case "door":
        return (
          <g {...p}>
            <path d="M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20M4 20h16" />
            <circle cx="14.5" cy="12.5" r=".9" fill="currentColor" />
          </g>
        );
      case "send":
        return <path {...p} d="M12 19V6m-5.5 5.5L12 6l5.5 5.5" />;
      case "trash":
        return (
          <g {...p}>
            <path d="M5 7h14M10 4h4M7 7l.8 12.2c.1.9.8 1.8 1.8 1.8h4.8c1 0 1.7-.9 1.8-1.8L17 7" />
          </g>
        );
      case "undo":
        return <path {...p} d="M8 7.5 4.5 11 8 14.5M4.5 11H14a5 5 0 0 1 0 10h-2" />;
      case "return":
        return <path {...p} d="M9 7 4.5 11.5 9 16M4.5 11.5h10a5 5 0 0 0 5-5V5" />;
      case "hand":
        return <path {...p} d="M8 12.5V6.8a1.4 1.4 0 0 1 2.8 0V11m0-5.7V4.9a1.4 1.4 0 0 1 2.8 0V11m0-4.6a1.4 1.4 0 0 1 2.8 0V12m0-3a1.4 1.4 0 0 1 2.8 0v5.2c0 3.8-2.6 6.3-6.2 6.3-2.5 0-4.1-1.1-5.5-3.2L5.2 13.5a1.5 1.5 0 0 1 2.4-1.8z" />;
      case "arrowUpRight":
        return <path {...p} d="M7.5 16.5l9-9M9 7.5h7.5V15" />;
      case "spark":
        return <path {...p} d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M18 6l-2.6 2.6M8.6 15.4 6 18" />;
      case "photo":
        return (
          <g {...p}>
            <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
            <circle cx="9" cy="10.5" r="1.6" />
            <path d="M20.5 15.5l-4.5-4.5-7.5 7.5" />
          </g>
        );
      case "cup":
        return (
          <g {...p}>
            <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
            <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5" />
          </g>
        );
      case "flag":
        return <path {...p} d="M6 21V4.5M6 5h10.5l-2 4 2 4H6" />;
    }
  })();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} className={className} aria-hidden>
      {body}
    </svg>
  );
}

// ---- a person's disc -------------------------------------------------------------------------------

export type DiscLook = "heavy" | "work" | "unseen" | "held" | "free" | "away" | "onInk" | "ghost" | "secretary";

/** The circle that stands for a person everywhere: dark and ringed = waits for your word. */
export function Disc({
  initials,
  look,
  size = 44,
  ring = false,
  dim = false,
  night = false,
  style,
}: {
  initials: string;
  look: DiscLook;
  size?: number;
  ring?: boolean;
  dim?: boolean;
  night?: boolean;
  style?: CSSProperties;
}) {
  const fs = Math.max(10, Math.round(size * 0.3));
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: fs,
    fontWeight: 600,
    letterSpacing: "0.02em",
    position: "relative",
    transition: "background-color .5s, color .5s, box-shadow .5s, opacity .4s",
    opacity: dim ? 0.32 : 1,
    flex: "none",
  };
  const looks: Record<DiscLook, CSSProperties> = {
    heavy: night
      ? { background: "#E9EEF2", color: C.ink, boxShadow: "0 6px 16px rgba(0,0,0,.35)" }
      : { background: `radial-gradient(120% 120% at 30% 20%, #2A3036 0%, ${C.ink} 70%)`, color: "#F4F6F7", boxShadow: "0 10px 18px -6px rgba(15,18,21,.55), 0 2px 4px rgba(15,18,21,.25)" },
    work: night
      ? { background: "rgba(255,255,255,.14)", color: "#E9EEF2", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22)" }
      : { background: "linear-gradient(180deg,#FFFFFF,#F2F5F7)", color: C.onSky, boxShadow: "0 8px 20px -8px rgba(40,60,80,.35), inset 0 0 0 1px rgba(16,20,24,.06)" },
    unseen: night
      ? { background: "transparent", color: "#C9D2E0", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.35)" }
      : { background: "rgba(255,255,255,.35)", color: C.onSky2, outline: `1.5px dashed ${C.onSky3}`, outlineOffset: -1.5 },
    held: { background: "rgba(255,255,255,.28)", color: C.onSky3, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.8), 0 4px 14px -6px rgba(40,60,80,.25)", backdropFilter: "blur(6px)" },
    free: { background: "rgba(255,255,255,.55)", color: C.onSky3, boxShadow: "inset 0 0 0 1px rgba(16,20,24,.05)" },
    away: { background: "transparent", color: C.onSky3, boxShadow: `inset 0 0 0 1px ${C.onSky3}55` },
    onInk: { background: C.ink4, color: C.onInk, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" },
    ghost: { background: "transparent", color: C.onSky3, outline: `1.5px dashed ${C.onSky3}AA`, outlineOffset: -1.5 },
    secretary: { background: "#F4F1EA", color: C.ink, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" },
  };
  return (
    <span style={{ ...base, ...looks[look], ...style }}>
      {ring ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -3.5,
            borderRadius: 999,
            boxShadow: `0 0 0 2px ${night ? C.lime : C.limeRing}`,
          }}
        />
      ) : null}
      <span style={{ position: "relative" }}>{initials}</span>
    </span>
  );
}

// ---- pressables ----------------------------------------------------------------------------------

/** Every pressable: a quick sink under the finger, no system grey flash. */
export function Press({
  children,
  onClick,
  className,
  style,
  disabled,
  label,
  scale = 0.96,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  label?: string;
  scale?: number;
  type?: "button" | "submit";
}) {
  return (
    <motion.button
      type={type}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale }}
      transition={{ type: "spring", stiffness: 700, damping: 30 }}
      className={className}
      style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation", ...style }}
    >
      {children}
    </motion.button>
  );
}

/** A key on the director's ground: «primary» is lime (the main move), the rest sit quietly. */
export function Key({
  children,
  onClick,
  kind = "quiet",
  className = "",
  style,
  disabled,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "quiet" | "ghost" | "light";
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  small?: boolean;
}) {
  const looks: Record<string, CSSProperties> = {
    primary: { background: C.lime, color: C.limeInk },
    quiet: { background: C.ink3, color: C.onInk },
    ghost: { background: "transparent", color: C.onInk2, boxShadow: `inset 0 0 0 1px ${C.line}` },
    light: { background: "#FFFFFF", color: C.onSky, boxShadow: "inset 0 0 0 1px rgba(16,20,24,.08)" },
  };
  return (
    <Press
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${small ? "h-9 px-3.5 text-[13px]" : "h-11 px-4 text-[14px]"} ${className}`}
      style={{ ...looks[kind], opacity: disabled ? 0.4 : 1, ...style }}
    >
      {children}
    </Press>
  );
}

// ---- sheets --------------------------------------------------------------------------------------

/** A sheet over the whole screen: drag down or tap the dim to close; returns where you were. */
export function Sheet({
  open,
  onClose,
  children,
  height,
  light = false,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** css height; default fits content up to 88% */
  height?: string;
  light?: boolean;
  label: string;
}) {
  const reduce = useReduced();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div key="sheet" className="absolute inset-0 z-40" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.div
            className="absolute inset-0"
            style={{ background: "rgba(6,9,12,.46)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={label}
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
            style={{
              height,
              maxHeight: "calc(100% - max(env(safe-area-inset-top), 16px) - 24px)",
              background: light ? C.sky2 : C.ink2,
              color: light ? C.onSky : C.onInk,
              borderRadius: "28px 28px 0 0",
              boxShadow: "0 -20px 60px rgba(0,0,0,.35)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragSnapToOrigin
            onDragEnd={(_: unknown, info: PanInfo) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1 w-10 rounded-full" style={{ background: light ? "rgba(16,20,24,.18)" : "rgba(255,255,255,.18)" }} />
            </div>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---- the undo toast (D-139) ------------------------------------------------------------------------

export type ToastData = { id: number; text: string; undo?: () => void; extra?: ReactNode; ms?: number };

export function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  return (
    <AnimatePresence>
      {toast ? <ToastBody key={toast.id} toast={toast} onDone={onDone} /> : null}
    </AnimatePresence>
  );
}

function ToastBody({ toast, onDone }: { toast: ToastData; onDone: () => void }) {
  const ms = toast.ms ?? (toast.undo ? 5000 : 2600);
  useEffect(() => {
    const t = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(t);
  }, [ms, onDone]);
  return (
    <motion.div
      role="status"
      className="pointer-events-auto absolute inset-x-3 z-50 overflow-hidden rounded-[20px]"
      style={{ bottom: "calc(var(--tabbar-h) + 12px)", background: "#F4F6F7", color: C.onSky, boxShadow: "0 18px 40px -12px rgba(0,0,0,.55)" }}
      initial={{ y: 24, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 16, opacity: 0, transition: { duration: 0.18 } }}
      transition={SPRING}
    >
      <div className="flex min-h-[52px] items-center gap-3 py-2 pl-4 pr-2">
        <span className="min-w-0 flex-1 text-[14px] leading-[18px]">{toast.text}</span>
        {toast.undo ? (
          <Press
            onClick={() => {
              toast.undo?.();
              onDone();
            }}
            className="h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold"
            style={{ background: C.ink, color: C.lime }}
          >
            Отменить
          </Press>
        ) : null}
      </div>
      {toast.extra ? <div className="px-3 pb-3">{toast.extra}</div> : null}
      {toast.undo ? (
        <motion.span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px]"
          style={{ background: C.ink, originX: 0, width: "100%" }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: ms / 1000, ease: "linear" }}
        />
      ) : null}
    </motion.div>
  );
}

// ---- small things --------------------------------------------------------------------------------

/** A spoken clip: play button, a quiet waveform drawn from a seed, the length. */
export function Clip({ sec, seed = 3, onInk = true, compact = false, tiny = false }: { sec: number; seed?: number; onInk?: boolean; compact?: boolean; tiny?: boolean }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setPlaying(false), Math.min(sec, 6) * 1000);
    return () => window.clearTimeout(t);
  }, [playing, sec]);
  const bars = Array.from({ length: tiny ? 7 : compact ? 14 : 22 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin((i + 1) * (seed * 0.7 + 1.3)) * Math.cos(i * 0.45 + seed)));
  const fg = onInk ? C.onInk : C.onSky;
  return (
    <Press
      onClick={() => setPlaying((v) => !v)}
      className={`relative inline-flex items-center gap-2 rounded-full pl-1 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] ${tiny ? "h-8 pr-2.5" : "h-9 pr-3"}`}
      style={{ background: onInk ? "rgba(255,255,255,.07)" : "rgba(16,20,24,.06)", color: fg }}
      label={playing ? "Пауза" : "Слушать"}
    >
      <span className={`grid place-items-center rounded-full ${tiny ? "h-6 w-6" : "h-7 w-7"}`} style={{ background: onInk ? C.lime : C.ink, color: onInk ? C.limeInk : C.lime }}>
        <Icon name={playing ? "pause" : "play"} size={13} />
      </span>
      <span className="flex h-4 items-center gap-[2px]">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="w-[2px] rounded-full"
            style={{ background: fg, opacity: 0.55, height: `${Math.round(h * 16)}px` }}
            animate={playing ? { scaleY: [1, 0.4, 1] } : { scaleY: 1 }}
            transition={playing ? { duration: 0.6, repeat: Infinity, delay: i * 0.03 } : { duration: 0.2 }}
          />
        ))}
      </span>
      <span className="text-[11px]" style={{ ...MONO, color: onInk ? C.onInk2 : C.onSky2 }}>
        0:{String(sec).padStart(2, "0")}
      </span>
    </Press>
  );
}

/** The receipt line: done steps solid, the waiting one quiet — «не открывал с 10:05», never «не получил». */
export function Receipt({ steps, onInk = true }: { steps: { label: string; at: string | null; state: "done" | "wait" | "none" }[]; onInk?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] leading-4" style={{ color: onInk ? C.onInk2 : C.onSky2 }}>
      {steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: s.state === "done" ? (onInk ? C.mint : C.mintDeep) : "transparent", boxShadow: s.state === "done" ? "none" : `inset 0 0 0 1px ${onInk ? C.onInk3 : C.onSky3}` }}
          />
          <span style={{ color: s.state === "wait" ? (onInk ? C.onInk : C.onSky) : undefined }}>{s.label}</span>
          {s.at ? <span style={MONO}>{s.at}</span> : null}
        </span>
      ))}
    </span>
  );
}

export function Hairline({ onInk = true }: { onInk?: boolean }) {
  return <div className="h-px w-full" style={{ background: onInk ? C.line : "rgba(16,20,24,.08)" }} />;
}
