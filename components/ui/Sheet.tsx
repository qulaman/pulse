"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { fromNextFrame, objectMotion } from "@/components/ui/motion";
import { onKeyboard, readKeyboard, useFieldGuard, type Keyboard } from "@/lib/ui/keyboard";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** `--t-sheet`: the whole sheet travels up from the bottom edge; it leaves in three quarters of that. */
const OPEN_MS = 280;
const CLOSE_MS = 210;
/** A sheet that follows another waits this long: the first one is gone before the next comes up. */
export const SHEET_CLOSE_MS = CLOSE_MS;
/** If the slide never reports its end (a hidden tab runs no animations), this is when it counts as done. */
const GRACE_MS = 600;

/** Let go further down than this — or flicked down faster than `FLICK_PX_MS` — the sheet closes (D-166). */
const CLOSE_PX = 110;
const FLICK_PX_MS = 0.6;
/** A flick shorter than this is a shaky tap, not a throw. */
const FLICK_MIN_PX = 12;
/** Pulled up past where it stands, the sheet gives only a few pixels, ever fewer. */
const RUBBER_PX = 14;
/** The finger's speed at the release: its moves over this last stretch of time. */
const SPEED_WINDOW_MS = 100;
/** Released slower than this, the sheet still leaves at this pace, gathering speed. */
const MIN_EXIT_PX_MS = 0.4;
/** Text, a choice and anything marked so are never the sheet's handle. */
const NO_DRAG = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-sheet-nodrag]";

/** How a sheet let go by the finger leaves: from where it was, at the finger's pace. */
type Exit = { ms: number; easing: string };

/** The sheet's drag offset as it is drawn now — mid spring-back too. */
function drawnOffset(node: HTMLElement): number {
  const value = getComputedStyle(node).translate;
  if (!value || value === "none") return 0;
  const parts = value.split(" ");
  return parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
}

/**
 * Whether a finger that lands on `target` may take the sheet. Not from a field or a picker, not
 * from a row that scrolls sideways or a list that scrolls on its own, not from a widget that
 * takes the finger itself (a slider, a canvas — `touch-action` without vertical panning).
 */
function canTakeFrom(target: EventTarget | null, dialog: HTMLElement): boolean {
  if (!(target instanceof Element) || !dialog.contains(target) || target.closest(NO_DRAG)) return false;
  for (let node: Element | null = target; node && node !== dialog; node = node.parentElement) {
    const style = getComputedStyle(node);
    const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
    const scrollsY = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrollsX && node.scrollWidth > node.clientWidth + 1) return false;
    if (scrollsY && node.scrollHeight > node.clientHeight + 1) return false;
    const touch = style.touchAction;
    if (touch !== "auto" && touch !== "manipulation" && !touch.includes("pan-y")) return false;
  }
  return true;
}

/**
 * The sheet follows the finger down (D-166): by its grip strip at any time (pointer events — the
 * strip pans nothing, so the browser never takes the finger away), and by its content while that
 * is scrolled to the very top (touch events: only a `touchmove` can still be refused to the
 * browser's scroll, and only the first one). Let go past `CLOSE_PX` or flicked, it closes from
 * where it was at the finger's pace; otherwise it springs back on the object spring. The offset is
 * the `translate` property — the open and close slides animate `transform`, so the two add up and
 * the closing slide starts where the finger left the sheet. The dim follows the sheet down.
 * Nothing here runs on the desk, where the sheet is a centred dialog.
 */
function useSheetDrag({
  active,
  dialogRef,
  overlayRef,
  gripRef,
  ready,
  close,
}: {
  active: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLButtonElement | null>;
  gripRef: RefObject<HTMLDivElement | null>;
  ready: RefObject<boolean>;
  close: (exit: Exit, back: () => void) => void;
}) {
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    const grip = gripRef.current;
    if (!active || !dialog || !overlay || !grip) return;

    let springing: Animation[] = [];
    /** A finger is down on the content; whether it takes the sheet is decided on its first move. */
    let pending: { id: number; x: number; y: number } | null = null;
    let drag: { id: number; via: "touch" | "pointer"; y0: number; base: number; height: number; shown: number; moves: [number, number][] } | null = null;

    const free = () => document.documentElement.getAttribute("data-surface") !== "desk" && ready.current === true;
    const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const begin = (id: number, via: "touch" | "pointer", y: number, at: number) => {
      // a spring-back still under way: the sheet is picked up where it is drawn
      const base = drawnOffset(dialog);
      for (const animation of springing) animation.cancel();
      springing = [];
      drag = { id, via, y0: y, base, height: dialog.getBoundingClientRect().height || 1, shown: base, moves: [[at, y]] };
      follow(y, at);
    };

    const follow = (y: number, at: number) => {
      if (!drag) return;
      const offset = drag.base + y - drag.y0;
      const shown = offset >= 0 ? offset : -RUBBER_PX * (1 - 1 / (1 - offset / (RUBBER_PX * 3)));
      drag.shown = shown;
      drag.moves.push([at, y]);
      while (drag.moves.length > 2 && at - drag.moves[0][0] > SPEED_WINDOW_MS) drag.moves.shift();
      dialog.style.translate = `0 ${shown}px`;
      overlay.style.opacity = String(Math.max(0, 1 - Math.max(0, shown) / drag.height));
    };

    const back = () => {
      const from = drawnOffset(dialog);
      const dim = Number(overlay.style.opacity || 1);
      dialog.style.translate = "";
      overlay.style.opacity = "";
      if (still() || Math.abs(from) < 0.5) return;
      const { ms, easing } = objectMotion();
      springing = [
        dialog.animate([{ translate: `0 ${from}px` }, { translate: "0 0" }], { duration: ms, easing }),
        overlay.animate([{ opacity: dim }, { opacity: 1 }], { duration: ms, easing }),
      ];
    };

    const release = (at: number) => {
      const done = drag;
      drag = null;
      if (!done) return;
      const [first, last] = [done.moves[0], done.moves[done.moves.length - 1]];
      // a finger that stood still before letting go threw nothing
      const speed = at - last[0] > 80 || last[0] === first[0] ? 0 : (last[1] - first[1]) / (last[0] - first[0]);
      const shown = done.shown;
      const flung = speed >= FLICK_PX_MS && shown >= FLICK_MIN_PX;
      if (!(flung || (shown >= CLOSE_PX && speed > -0.2))) return back();
      // the closing slide (`transform` 0 → 100 %) starts at the finger's pace and gathers speed
      const pace = Math.max(speed, MIN_EXIT_PX_MS);
      const ms = Math.round(Math.min(CLOSE_MS, Math.max(120, done.height / pace)));
      const slope = Math.min(1, (pace * ms) / done.height);
      closeRef.current({ ms, easing: `cubic-bezier(0.3, ${(0.3 * slope).toFixed(3)}, 1, 1)` }, back);
    };

    const touchOf = (list: TouchList, id: number) => {
      for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (drag || pending) {
        // a second finger: the sheet goes back to its place and the gesture is over
        if (drag?.via === "touch") {
          drag = null;
          back();
        }
        pending = null;
        return;
      }
      if (event.touches.length !== 1 || !free()) return;
      const touch = event.touches[0];
      if (grip.contains(touch.target as Node) || !canTakeFrom(touch.target, dialog)) return;
      pending = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pending) {
        const touch = touchOf(event.changedTouches, pending.id);
        if (!touch) return;
        const dx = touch.clientX - pending.x;
        const dy = touch.clientY - pending.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        const start = pending;
        pending = null;
        // down from the very top takes the sheet; up takes it only when there is nothing to scroll
        const vertical = Math.abs(dy) > Math.abs(dx);
        const takes = dy > 0 ? dialog.scrollTop <= 0 : dialog.scrollHeight <= dialog.clientHeight + 1;
        if (!event.cancelable || !vertical || !takes) return;
        begin(start.id, "touch", start.y, event.timeStamp);
      }
      if (drag?.via !== "touch") return;
      const touch = touchOf(event.changedTouches, drag.id);
      if (!touch) return;
      event.preventDefault();
      follow(touch.clientY, event.timeStamp);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pending && touchOf(event.changedTouches, pending.id)) pending = null;
      if (drag?.via !== "touch" || !touchOf(event.changedTouches, drag.id)) return;
      if (event.type === "touchcancel") {
        drag = null;
        back();
      } else release(event.timeStamp);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (drag || !event.isPrimary || event.button !== 0 || !free()) return;
      grip.setPointerCapture(event.pointerId);
      begin(event.pointerId, "pointer", event.clientY, event.timeStamp);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.via === "pointer" && drag.id === event.pointerId) follow(event.clientY, event.timeStamp);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (drag?.via === "pointer" && drag.id === event.pointerId) release(event.timeStamp);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (drag?.via !== "pointer" || drag.id !== event.pointerId) return;
      drag = null;
      back();
    };

    dialog.addEventListener("touchstart", onTouchStart, { passive: true });
    dialog.addEventListener("touchmove", onTouchMove, { passive: false });
    dialog.addEventListener("touchend", onTouchEnd);
    dialog.addEventListener("touchcancel", onTouchEnd);
    grip.addEventListener("pointerdown", onPointerDown);
    grip.addEventListener("pointermove", onPointerMove);
    grip.addEventListener("pointerup", onPointerUp);
    grip.addEventListener("pointercancel", onPointerCancel);
    return () => {
      dialog.removeEventListener("touchstart", onTouchStart);
      dialog.removeEventListener("touchmove", onTouchMove);
      dialog.removeEventListener("touchend", onTouchEnd);
      dialog.removeEventListener("touchcancel", onTouchEnd);
      grip.removeEventListener("pointerdown", onPointerDown);
      grip.removeEventListener("pointermove", onPointerMove);
      grip.removeEventListener("pointerup", onPointerUp);
      grip.removeEventListener("pointercancel", onPointerCancel);
      // closed mid-drag or mid spring-back (Escape, a tap on the dim): the slide down starts
      // from where the sheet is drawn, not from its place
      for (const animation of springing) {
        try {
          if (animation.playState === "running") animation.commitStyles();
        } catch {
          // already off the page: nothing to keep
        }
        animation.cancel();
      }
      drag = null;
      pending = null;
    };
  }, [active, dialogRef, overlayRef, gripRef, ready]);
}

/** Sheets up right now: a sheet opened from a sheet (people from a meeting) must not unlock the page when it closes. */
let openSheets = 0;

/** The first `data-autofocus` field, once per opening (the slide's end or the grace timer, whichever comes first). */
function focusFirstField(dialog: HTMLElement | null, done: { current: boolean }) {
  if (done.current) return;
  done.current = true;
  dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
}

/**
 * Bottom sheet: overlay token, 20px top corners, safe-area padding (docs/DESIGN.md §2).
 * Nothing behind it moves: the page is locked while the sheet is up, the sheet slides in
 * from the bottom edge and back down instead of vanishing, and the first `data-autofocus`
 * field gets focus only after the slide — a keyboard that pops mid-animation drags the
 * whole viewport. Both ends of the slide are its own `animationend`, not a timer: on a
 * busy phone the closing render alone can outlast a timer, and the sheet would vanish
 * before its first frame down.
 *
 * With the keyboard out the sheet stands on it, no taller than what is left in sight: the window
 * does not shrink for the keyboard, so a sheet at the window's bottom kept its lower part — the
 * field's «Отправить» — under the keys. `--kb` / `--kb-vh` on the layer come from the visual
 * viewport (lib/ui/keyboard.ts); a field under a sticky part of the sheet marked
 * `data-keyboard-cover` (a form's button) scrolls up from under it once the keyboard settled.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  // stays mounted through the closing slide, then unmounts
  const [mounted, setMounted] = useState(open);
  // set by a drag let go: the closing slide continues the finger's (D-166); open again, it is gone
  const [exit, setExit] = useState<Exit | null>(null);
  if (open && !mounted) setMounted(true);
  if (open && exit) setExit(null);
  const phase: "closed" | "open" | "closing" = !mounted ? "closed" : open ? "open" : "closing";
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  // the slide up has ended: from now on the finger may take the sheet
  const settled = useRef(false);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });

  // the render that opens (or closes) a sheet is often the heaviest of the tap: the slide
  // starts from the first frame drawn after it, not from the frame clock it left behind
  useLayoutEffect(() => {
    if (phase === "closed") return;
    if (phase === "open") {
      settled.current = false;
      // opened again mid-way down: the drag that sent it there is over
      dialogRef.current?.style.removeProperty("translate");
      overlayRef.current?.style.removeProperty("opacity");
    }
    for (const node of [overlayRef.current, dialogRef.current]) node?.getAnimations().forEach(fromNextFrame);
  }, [phase]);

  useSheetDrag({
    active: phase === "open",
    dialogRef,
    overlayRef,
    gripRef,
    ready: settled,
    close: (next, back) => {
      setExit(next);
      onClose();
      // a caller that keeps its sheet open (busy, a question first) gets it back in place
      setTimeout(() => {
        if (openRef.current) back();
      }, 120);
    },
  });

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), CLOSE_MS + GRACE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // scroll lock: an attribute, so two sheets in a row never fight over inline styles; counted,
  // so the inner one of two nested sheets leaves the page locked for the outer one
  const present = phase !== "closed";
  useEffect(() => {
    if (!present) return;
    openSheets += 1;
    document.body.setAttribute("data-sheet-open", "");
    return () => {
      openSheets -= 1;
      if (openSheets === 0) document.body.removeAttribute("data-sheet-open");
    };
  }, [present]);

  // on the keyboard, written in the viewport's own event like the docked bars
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!present || !layer) return;
    const place = ({ up, gap, height }: Keyboard) => {
      layer.style.setProperty("--kb", `${up ? gap : 0}px`);
      layer.style.setProperty("--kb-vh", up ? `${window.innerHeight - height}px` : "100dvh");
      // the keyboard covers the home indicator: its inset would only lift the sheet off the keys
      layer.style.setProperty("--kb-safe", up ? "0px" : "env(safe-area-inset-bottom)");
    };
    place(readKeyboard());
    return onKeyboard(place);
  }, [present]);
  useFieldGuard(present);

  useEffect(() => {
    if (phase !== "open") return;
    focused.current = false;
    const timer = setTimeout(() => {
      settled.current = true;
      focusFirstField(dialogRef.current, focused);
    }, OPEN_MS + GRACE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "closed") return null;
  const closing = phase === "closing";

  // Portal to <body>: an animated <main> is a stacking context, and a sheet inside it
  // would sit under the FAB no matter its z-index.
  return createPortal(
    <div
      ref={layerRef}
      data-sheet-layer=""
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ touchAction: "none", pointerEvents: closing ? "none" : "auto", bottom: "var(--kb, 0px)" }}
    >
      {/* the dim is glass (`.sheet-overlay`); it fills in only `backwards`: once up, the drag
          writes its opacity, and the way out (`overlay-out`, no `from`) starts from that */}
      <button
        ref={overlayRef}
        type="button"
        aria-label="Закрыть"
        className="sheet-overlay absolute inset-0 h-full w-full"
        style={{
          animation: closing
            ? exit
              ? `overlay-out ${exit.ms}ms linear both`
              : `overlay-out ${CLOSE_MS}ms var(--ease-in) both`
            : `overlay-in ${OPEN_MS}ms var(--ease-out) backwards`,
        }}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // the desk draws the same sheet as a centred dialog with its own fade (globals.css, D-153)
        data-sheet=""
        data-closing={closing ? "" : undefined}
        className="no-bar relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[20px] border-t border-border bg-surface px-4 pt-4"
        style={{
          maxHeight: "min(88dvh, calc(var(--kb-vh, 100dvh) - 12px))",
          touchAction: "pan-y",
          paddingBottom: "calc(16px + var(--kb-safe, env(safe-area-inset-bottom)))",
          // a field the browser scrolls into sight lands clear of the grip strip
          scrollPaddingTop: 32,
          boxShadow: "var(--shadow-raised)",
          animation: closing
            ? `sheet-down ${exit ? `${exit.ms}ms ${exit.easing}` : `${CLOSE_MS}ms var(--ease-in)`} both`
            : `sheet-up ${OPEN_MS}ms var(--ease-out) both`,
        }}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName === "sheet-down" || event.animationName === "desk-dialog-out") setMounted(false);
          else if (event.animationName === "sheet-up" || event.animationName === "desk-dialog-in") {
            settled.current = true;
            focusFirstField(dialogRef.current, focused);
          }
        }}
      >
        {/* the handle: a strip that stays at the top while the content scrolls under it, fading
            there (the gradient), and takes the finger at any scroll; hidden on the desk. A sticky
            box keeps clear of its scroller's padding: `top` takes the sheet's 16 px back */}
        <div
          ref={gripRef}
          data-sheet-grip=""
          className="sticky z-[3] -mx-4 -mt-4 flex h-8 justify-center pt-4"
          style={{ top: -16, touchAction: "none", background: "linear-gradient(180deg, var(--surface) 45%, transparent)" }}
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        {title ? <h2 className="mb-3 text-[19px] font-semibold leading-6">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
