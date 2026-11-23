"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/tasks/icons";

const ROLL = { duration: 0.24, ease: [0.2, 0, 0, 1] as const };

export type CapsuleLook =
  /** a deadline or «срочно»: a pill in its colour */
  | "pill"
  /** no deadline yet, the director may give one: a dashed slot with a clock and a plus */
  | "empty"
  /** history (closed, refused, recalled): the time and its mark, no frame — nothing to press */
  | "bare";

/**
 * «Когда» of a task — the one place its deadline is said on the task's screen (D-187), and the
 * place it is changed: the director taps it to move the deadline, the assignee to ask for more
 * time. A capsule that can be pressed carries a chevron and gives under the finger; its tap area
 * reaches 44 px past its small frame. A new date rolls in from below, the old one leaves upward,
 * the frame glides to its new width. `news` — the deadline moved since the reader last looked: the
 * old date shows first and rolls over to the new one, with a dot until the screen is left.
 */
export function DeadlineCapsule({
  taskId,
  look,
  icon,
  text,
  rollKey,
  color,
  label,
  onPress,
  news,
}: {
  taskId: string;
  look: CapsuleLook;
  icon: IconName;
  /** null — the empty slot says it with icons only */
  text: string | null;
  /** what the roll follows: the deadline itself, so midnight turning «завтра» into «сегодня» does not roll */
  rollKey: string;
  color: string;
  /** the words a screen reader says for it */
  label: string;
  onPress?: () => void;
  /** the deadline moved since the last look; `from` — the old one in words, null when there was none */
  news?: { from: string | null } | null;
}) {
  const box = useRef<HTMLButtonElement & HTMLSpanElement>(null);
  const last = useRef<{ key: string; width: number } | null>(null);
  // the news (known once the read cursor has come): the old date first, the new one rolls over it.
  // A date that moves while the screen is open is not replayed — it has just rolled in by itself.
  const [played, setPlayed] = useState(false);
  const [old, setOld] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState(rollKey);
  const moving = seenKey !== rollKey;
  if (moving) setSeenKey(rollKey);
  if (news && !played) {
    setPlayed(true);
    if (!moving) setOld(news.from);
  }
  useEffect(() => {
    if (!old) return;
    const timer = setTimeout(() => setOld(null), 650);
    return () => clearTimeout(timer);
  }, [old]);
  const shownKey = old ? `old:${rollKey}` : rollKey;
  const shownText = old ?? text;

  // the frame follows its words to their new width — measured only when the date itself changed
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const width = node.offsetWidth;
    const before = last.current;
    last.current = { key: shownKey, width };
    if (!before || before.key === shownKey || before.width === width) return;
    node.animate([{ width: `${before.width}px` }, { width: `${width}px` }], { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  }, [shownKey]);

  const frame =
    look === "bare"
      ? "px-0.5"
      : look === "empty"
        ? "border border-dashed px-3"
        : "border px-2.5";
  const content = (
    <>
      <Icon name={icon} size={look === "empty" ? 16 : 13} />
      {shownText !== null ? (
        <span className="relative inline-flex overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={shownKey}
              className="block whitespace-nowrap"
              initial={{ y: "90%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-90%", opacity: 0 }}
              transition={ROLL}
            >
              {shownText}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : null}
      {onPress && look !== "empty" ? (
        <span className="-mr-0.5 rotate-90 opacity-60">
          <Icon name="open" size={10} />
        </span>
      ) : null}
      {news ? <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--surface)]" /> : null}
    </>
  );
  const style = {
    color,
    borderColor: look === "bare" ? undefined : `color-mix(in srgb, currentColor ${look === "empty" ? 45 : 35}%, transparent)`,
  };
  const shape = `nums relative inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full text-[12px] font-semibold leading-4 ${frame}`;

  if (!onPress) {
    return (
      <span ref={box} className={shape} style={style} data-deadline-target={taskId} data-testid="task-deadline" aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <button
      ref={box}
      type="button"
      onClick={onPress}
      data-deadline-target={taskId}
      data-testid="task-deadline"
      data-look={look}
      aria-label={label}
      // the frame is 26 px; the finger gets 44 (the pseudo-element reaches past it on every side)
      className={`${shape} transition-[transform,background-color] duration-150 ease-out after:absolute after:-inset-[9px] after:content-[''] active:scale-[0.94] active:bg-[color-mix(in_srgb,currentColor_10%,transparent)]`}
      style={style}
    >
      {content}
    </button>
  );
}
