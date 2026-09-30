"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

/**
 * Детали доски на стене, общие для «Списка» и «Карты» (D-121): номер пункта, подложка
 * ведущего, свечение нового пункта. Движение — только opacity и transform (D-45).
 */

export const EASE = [0.2, 0, 0, 1] as const;
/** Насколько гаснет всё, кроме пункта, который обсуждают. */
export const DIM = 0.38;
/** Отмеченный пункт: текст приглушён, место за ним остаётся. */
export const DONE_TEXT = 0.42;

export const vh = (value: number) => `${value}vh`;

/** Не больше `lines` строк, дальше многоточие. Интерлиньяж ≥ 1.2 кегля — хвосты букв не режутся. */
export function clampStyle(lines: number): CSSProperties {
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" };
}

/**
 * Кружок с номером пункта; отмеченный — галочка; обсуждаемый — залит акцентом. Заливка —
 * свой слой с номером цвета стены поверх кружка, он проявляется прозрачностью (D-45):
 * переход подсветки не перерисовывает кружок полсекунды.
 */
export function Badge({ n, done, size, lit, tone = "var(--accent)" }: { n: number; done: boolean; size: number; lit: boolean; tone?: string }) {
  const color = done ? "var(--ok)" : tone;
  return (
    <span
      aria-hidden
      className="nums relative flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{ width: vh(size), height: vh(size), fontSize: vh(size * 0.5), color, background: `color-mix(in srgb, ${color} 17%, transparent)` }}
    >
      {done ? (
        <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      ) : (
        <>
          {n}
          <span
            className="absolute inset-0 flex items-center justify-center rounded-full"
            style={{ background: color, color: "var(--bg)", opacity: lit ? 1 : 0, transition: "opacity 450ms var(--ease-in-out)" }}
          >
            {n}
          </span>
        </>
      )}
    </span>
  );
}

/** Подложка обсуждаемого пункта: появляется прозрачностью, ничего не сдвигает. */
export function LitPlate({ on, radius, still }: { on: boolean; radius: string; still: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: radius,
        background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
        boxShadow: "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 62%, transparent), 0 1.6vh 4.4vh rgba(0, 0, 0, 0.38)",
      }}
      initial={false}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{ duration: still ? 0 : 0.45, ease: EASE }}
    />
  );
}

/**
 * Свечение только что сказанного пункта — минуту, спокойно, одной прозрачностью. Это
 * единственное постоянное движение доски (D-45); без движения — ровный свет.
 */
export function FreshGlow({ radius, still, inset = "0" }: { radius: string; still: boolean; inset?: string }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        inset,
        borderRadius: radius,
        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        boxShadow: "inset 0 0 0 0.2vh color-mix(in srgb, var(--accent) 40%, transparent)",
      }}
      initial={{ opacity: 0 }}
      animate={still ? { opacity: 0.8 } : { opacity: [0.4, 0.9, 0.4] }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      transition={still ? { duration: 0.3 } : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
