"use client";

import { animate, motion, useDragControls, useIsPresent, type PanInfo, type TargetAndTransition } from "motion/react";
import { useEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "react";

import { springs } from "@/lib/design/tokens";

import styles from "./PanelCard.module.css";

/**
 * The cards band against the words' band while a ball is open, on Пульс and on Лента alike: the
 * card takes three quarters of the screen, the face and the balls step up (D-166, D-167).
 */
export const PANEL_GROW = 3;

/** A pull on the grip past this, or a flick, sends the card back down. */
const CLOSE_PX = 96;
const FLICK = 650;

/**
 * Пульс with a ball open (D-166): the ball's panel comes up from the bottom edge as one card —
 * the face and the balls step up and make room, the tab bar floats over the card's lower part.
 * Another ball changes what is inside the same card; the card itself stays. A pull on its grip
 * (or the face, or the open ball) sends it back down. Only the grip drags it: the deck inside
 * has vertical swipes of its own (up — act, down — later).
 *
 * The card reaches the screen's bottom edge, under the floating tab bar: it is wider than the
 * board's padding by `translate` (not margins, which a popped-out leaving card would add to its
 * measured place) and taller than the band by the tab bar's room.
 *
 * Nothing of its motion waits for the page's script. The tap's own frame is busy (the board
 * redrawn, the face taking up its work): the card comes up by a CSS animation on the object
 * spring, which the compositor runs, and goes down in pixels, which framer hands to the browser
 * too («100%» it could only move from script, a frame at a time). What is inside is drawn in the
 * tap's frame with the rest: drawn a frame later, it held up the face and the balls, which glide by
 * script, in the middle of their way.
 */
export function PanelCard({
  ref,
  panelKey,
  receded,
  label,
  onClose,
  children,
}: {
  /** AnimatePresence `popLayout` measures the leaving card through it */
  ref?: Ref<HTMLElement>;
  /** what is open: a new one starts at the top of the card */
  panelKey: string;
  /** the director is speaking: what is in the card steps back behind the face (D-166) */
  receded: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const scroller = useRef<HTMLDivElement>(null);
  // A ball tapped while the card is still going down keeps the same card (AnimatePresence brings
  // it back): it comes up to its place. Asked of the element itself — an `animate` target or a `y`
  // of our own on the card made framer move the way out by script again
  const present = useIsPresent();
  const away = useRef(false);
  useEffect(() => {
    if (!present) {
      away.current = true;
      return;
    }
    if (!away.current) return;
    away.current = false;
    const card = scroller.current?.parentElement;
    if (card) animate(card, { y: 0 }, springs.object);
  }, [present]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [panelKey]);

  // the top fade is switched, not driven: one attribute write when the content crosses the edge
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let scrolled = false;
    const onScroll = () => {
      const now = node.scrollTop > 2;
      if (now === scrolled) return;
      scrolled = now;
      if (now) node.setAttribute("data-scrolled", "");
      else node.removeAttribute("data-scrolled");
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_PX || info.velocity.y > FLICK) onClose();
  };

  return (
    <motion.section
      ref={ref}
      aria-label={label}
      data-testid="panel-card"
      data-panel={panelKey}
      data-receded={receded ? "" : undefined}
      className={`${styles.card} relative z-10 flex min-h-0 flex-1 flex-col`}
      style={CARD}
      // up: `.card` in the module (CSS, the object spring); down: its own height in pixels
      variants={{ gone: () => goneBy(scroller.current?.parentElement) }}
      exit="gone"
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.85 }}
      onDragEnd={onDragEnd}
    >
      <div aria-hidden className={`${styles.surface} pointer-events-none absolute inset-0 rounded-t-[28px]`} />
      {/* the grip: the one place the card is taken by */}
      <div
        aria-hidden
        className="relative flex h-7 shrink-0 cursor-grab touch-none items-start justify-center pt-2.5 active:cursor-grabbing"
        onPointerDown={(event) => controls.start(event)}
        data-testid="panel-grip"
      >
        <span className="h-1 w-10 rounded-full" style={{ background: "color-mix(in srgb, var(--text) 22%, transparent)" }} />
      </div>
      {/* `layoutScroll`: cards gliding to a new place inside (a card accepted moves down the list,
          D-167) are measured against the scrolled box, not the page */}
      <motion.div
        ref={scroller}
        layoutScroll
        className={`${styles.scroll} no-bar relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4`}
        style={{ paddingBottom: "calc(var(--tabbar-space) + 16px)", ...recede(receded, { scale: false }) }}
        initial={false}
        animate={{ scale: receded ? 0.985 : 1 }}
        transition={{ duration: 0.36, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </motion.section>
  );
}

/** `translate: -16px 0` lives in `.card`, under the rising animation that moves the same property. */
const CARD: CSSProperties = {
  width: "calc(100% + 32px)",
  marginBottom: "calc(-1 * var(--tabbar-space))",
};

/**
 * The way out gathers speed instead of settling (D-131), from wherever the finger left it, down by
 * the card's own height. Read when the card starts to leave — the popped-out card has its size
 * set by then — and in pixels, so framer runs it as a browser animation.
 */
function goneBy(card: HTMLElement | null | undefined): TargetAndTransition {
  return { y: card?.offsetHeight ?? window.innerHeight, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } };
}

const RECEDE_T = "opacity 360ms var(--ease-out), filter 360ms var(--ease-out), scale 360ms var(--ease-out)";

/**
 * A layer the director is not looking at while he speaks steps back (D-166): it dims, blurs a
 * little and gives way by a hair — attention goes to the face, the context stays in sight.
 * `none` at rest, so nothing at rest carries a filter or a containing block of its own.
 */
export function recede(on: boolean, { scale = true }: { scale?: boolean } = {}): CSSProperties {
  return {
    transition: RECEDE_T,
    opacity: on ? 0.3 : 1,
    filter: on ? "blur(2px)" : "none",
    ...(scale ? { scale: on ? "0.985" : "none" } : {}),
  };
}
