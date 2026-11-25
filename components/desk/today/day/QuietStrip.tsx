"use client";

import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { INK, type Ink } from "./kit";

/** A block with nothing to say, as a capsule: its icon, the words, the detail; a way on where it has one. */
export type QuietItem = {
  key: string;
  icon: LucideIcon;
  ink: Ink;
  text: string;
  more?: string;
  href?: string;
  /** the block's own hint, kept for the tooltip */
  hint?: string;
};

/**
 * The quiet strip (D-196): the blocks of the right side with nothing to say stand as one line of
 * capsules — «Всё прочитано», «Встреч сегодня нет · завтра 13:00» — instead of a card each; the room
 * goes to what has something. A block that comes to life leaves the strip for its card; a block
 * that did not load is never a capsule (it keeps its card with the failure, D-194).
 */
export function QuietStrip({ items }: { items: readonly QuietItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="day-quiet" data-testid="today-quiet">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item, index) => {
          const style = { "--tone": INK[item.ink], "--card-i": index } as CSSProperties;
          const body = (
            <>
              <span className="day-cap-icon">
                <item.icon size={14} strokeWidth={2.25} aria-hidden />
              </span>
              {item.text}
              {item.more ? <span className="day-cap-more nums">· {item.more}</span> : null}
            </>
          );
          return (
            <motion.li
              key={item.key}
              layout="position"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
              data-testid={`today-quiet-${item.key}`}
            >
              {item.href ? (
                <Link href={item.href} prefetch className="day-cap desk-focus" style={style} title={item.hint}>
                  {body}
                </Link>
              ) : (
                <span className="day-cap" style={style} title={item.hint}>
                  {body}
                </span>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
