"use client";

/**
 * The one key under the thumb. It never leaves its spot: hold it to speak (swipe up cancels),
 * tap it to start and stop, and when a phrase is parsed the same spot becomes «Отправить» —
 * open → hold → speak → tap, the thumb never travels.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { C, Icon, MONO, buzz, useReduced } from "./ui";

export type KeyMode = "voice" | "recording" | "busy" | "action";

const HOLD_MS = 220;
const CANCEL_DY = -64;

export function VoiceKey({
  mode,
  compact = false,
  label,
  sub,
  onSub,
  hint,
  level = 0,
  tapMode = false,
  onHoldStart,
  onHoldEnd,
  onTap,
  onAction,
  onArm,
  disabledAction = false,
  left,
  right,
}: {
  mode: KeyMode;
  compact?: boolean;
  /** the action label when mode = action: «Отправить 5 из 6», «Разобрать» */
  label?: string;
  /** a quiet second way under the action: «отправить сейчас» */
  sub?: string;
  onSub?: () => void;
  /** the line under the voice key: «Удержите и говорите», «Удержите — задача Марату» */
  hint?: ReactNode;
  level?: number;
  /** recording started by a tap: the next tap stops it */
  tapMode?: boolean;
  onHoldStart?: () => void;
  onHoldEnd?: (cancelled: boolean) => void;
  onTap?: () => void;
  onAction?: () => void;
  onArm?: (armed: boolean) => void;
  disabledAction?: boolean;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const reduce = useReduced();
  const [pressed, setPressed] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dragY, setDragY] = useState(0);
  const g = useRef<{ timer: number | null; holding: boolean; y0: number; armed: boolean; id: number | null }>({ timer: null, holding: false, y0: 0, armed: false, id: null });

  useEffect(() => {
    const ref = g.current;
    return () => {
      if (ref.timer) window.clearTimeout(ref.timer);
    };
  }, []);

  const voiceLike = mode === "voice" || mode === "recording";
  const big = !compact;
  const disc = mode === "recording" ? (big ? 104 : 84) : mode === "busy" ? (big ? 76 : 60) : big ? 88 : 62;

  const down = (e: React.PointerEvent) => {
    if (!voiceLike) return;
    if (mode === "recording" && tapMode) return; // the tap that stops it is handled on up
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current.id = e.pointerId;
    g.current.y0 = e.clientY;
    g.current.holding = false;
    g.current.armed = false;
    setPressed(true);
    g.current.timer = window.setTimeout(() => {
      g.current.holding = true;
      g.current.timer = null;
      buzz(12);
      onHoldStart?.();
    }, HOLD_MS);
  };
  const move = (e: React.PointerEvent) => {
    if (!g.current.holding) return;
    const dy = Math.min(0, e.clientY - g.current.y0);
    setDragY(Math.max(-110, dy));
    const a = dy < CANCEL_DY;
    if (a !== g.current.armed) {
      g.current.armed = a;
      setArmed(a);
      onArm?.(a);
      buzz(6);
    }
  };
  const finish = (cancelled: boolean) => {
    if (g.current.timer) {
      window.clearTimeout(g.current.timer);
      g.current.timer = null;
    }
    const wasHolding = g.current.holding;
    const wasArmed = g.current.armed;
    g.current.holding = false;
    g.current.armed = false;
    setPressed(false);
    setArmed(false);
    setDragY(0);
    onArm?.(false);
    return { wasHolding, wasArmed: wasArmed || cancelled };
  };
  const up = () => {
    if (!voiceLike) return;
    if (mode === "recording" && tapMode) {
      onTap?.();
      return;
    }
    const { wasHolding, wasArmed } = finish(false);
    if (wasHolding) onHoldEnd?.(wasArmed);
    else onTap?.();
  };
  const cancel = () => {
    const { wasHolding } = finish(true);
    if (wasHolding) onHoldEnd?.(true);
  };

  return (
    <div className="relative flex flex-col items-center" style={{ paddingTop: big ? 6 : 4, paddingBottom: big ? 12 : 8 }}>
      <div className="relative flex w-full items-center justify-center px-4" style={{ minHeight: big ? 108 : 78 }}>
        <div className="absolute left-4 top-1/2 -translate-y-1/2">{left}</div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">{right}</div>

        <AnimatePresence mode="popLayout" initial={false}>
          {mode === "action" ? (
            <motion.div key="action" className="flex flex-col items-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 34 }}>
              <motion.button
                type="button"
                onClick={() => {
                  if (disabledAction) return;
                  buzz([10, 30, 14]);
                  onAction?.();
                }}
                whileTap={{ scale: 0.95 }}
                className="flex h-[60px] items-center justify-center gap-2 rounded-full px-7 text-[16px] font-semibold"
                style={{
                  minWidth: 228,
                  maxWidth: 290,
                  background: disabledAction ? C.ink3 : C.lime,
                  color: disabledAction ? C.onInk2 : C.limeInk,
                  boxShadow: disabledAction ? "none" : "0 10px 30px -10px rgba(210,245,92,.55)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span className="truncate">{label}</span>
                {!disabledAction ? <Icon name={label === "Указать, кому" ? "user" : "send"} size={18} stroke={2.2} /> : null}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="voice" className="relative grid place-items-center" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ type: "spring", stiffness: 500, damping: 34 }}>
              {/* rings: a slow breath at rest, the voice's level while recording */}
              {mode === "voice" && !reduce ? (
                <motion.span
                  aria-hidden
                  className="absolute rounded-full"
                  style={{ width: disc + 26, height: disc + 26, boxShadow: `inset 0 0 0 1px rgba(210,245,92,.28)` }}
                  animate={{ scale: [1, 1.07, 1], opacity: [0.9, 0.4, 0.9] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
              {mode === "recording" ? (
                <>
                  <motion.span aria-hidden className="absolute rounded-full" style={{ width: disc, height: disc, background: armed ? "rgba(255,255,255,.06)" : "rgba(210,245,92,.16)" }} animate={{ scale: 1.18 + level * 0.5 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} />
                  <motion.span aria-hidden className="absolute rounded-full" style={{ width: disc, height: disc, background: armed ? "rgba(255,255,255,.04)" : "rgba(210,245,92,.1)" }} animate={{ scale: 1.36 + level * 0.8 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} />
                </>
              ) : null}
              {mode === "busy" ? (
                <motion.svg aria-hidden width={disc + 16} height={disc + 16} viewBox="0 0 100 100" className="absolute" animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
                  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(210,245,92,.15)" strokeWidth="3" />
                  <circle cx="50" cy="50" r="46" fill="none" stroke={C.lime} strokeWidth="3" strokeLinecap="round" strokeDasharray="70 220" />
                </motion.svg>
              ) : null}
              <motion.button
                type="button"
                aria-label={mode === "recording" ? "Закончить запись" : "Удержите и говорите"}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={cancel}
                onContextMenu={(e) => e.preventDefault()}
                disabled={mode === "busy"}
                className="relative grid place-items-center rounded-full"
                style={{
                  touchAction: "none",
                  WebkitTapHighlightColor: "transparent",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  background: mode === "busy" ? C.ink3 : armed ? C.ink4 : C.lime,
                  color: mode === "busy" ? C.lime : armed ? C.onInk : C.limeInk,
                  boxShadow: mode === "busy" || armed ? "none" : "0 14px 34px -12px rgba(210,245,92,.6), inset 0 -3px 0 rgba(0,0,0,.08)",
                  transition: "background-color .2s, color .2s",
                }}
                initial={false}
                animate={{ width: disc, height: disc, scale: pressed && mode === "voice" ? 0.93 : 1, y: dragY * 0.6 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
              >
                {armed ? (
                  <Icon name="close" size={30} stroke={2.2} />
                ) : mode === "recording" ? (
                  <LiveBars level={level} />
                ) : mode === "busy" ? (
                  <Icon name="voice" size={26} />
                ) : (
                  <Icon name="voice" size={big ? 34 : 28} />
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex h-5 items-center justify-center text-[12.5px] font-medium" style={{ color: armed ? C.onInk : C.onInk3 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={mode === "action" ? `s:${sub ?? ""}` : armed ? "armed" : `h:${String(typeof hint === "string" ? hint : mode)}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.16 }}>
            {mode === "action" ? (
              sub ? (
                <button type="button" onClick={onSub} className="min-h-[36px] px-3 text-[13px] font-medium underline decoration-[rgba(255,255,255,.25)] underline-offset-4" style={{ color: C.onInk2 }}>
                  {sub}
                </button>
              ) : null
            ) : armed ? (
              "Отпустите — отмена"
            ) : (
              hint
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Four bars that follow the voice. */
function LiveBars({ level }: { level: number }) {
  const shape = [0.55, 1, 0.75, 0.45];
  return (
    <span className="flex h-9 items-center gap-[5px]">
      {shape.map((s, i) => (
        <motion.span key={i} className="block w-[5px] rounded-full" style={{ background: C.limeInk, height: 34 }} animate={{ scaleY: 0.25 + s * (0.3 + level * 0.9) * (i % 2 ? 1 : 0.85) }} transition={{ type: "spring", stiffness: 600, damping: 22 }} />
      ))}
    </span>
  );
}

/** A small round side key next to the big one: «Aa», «×», a pinned person. */
export function SideKey({ icon, label, onClick, active = false }: { icon: ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className="flex flex-col items-center gap-1"
      style={{ WebkitTapHighlightColor: "transparent", minWidth: 52 }}
      aria-label={label}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: active ? C.onInk : C.ink3, color: active ? C.ink : C.onInk }}>
        {icon}
      </span>
      <span className="text-[11px] font-medium" style={{ color: C.onInk3 }}>
        {label}
      </span>
    </motion.button>
  );
}

/** «0:04» */
export function Timer({ sec }: { sec: number }) {
  return (
    <span style={MONO}>
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
    </span>
  );
}
