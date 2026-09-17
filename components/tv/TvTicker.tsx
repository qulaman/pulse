"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { TickerItem, TickerTone } from "@/lib/tv/ticker";

/**
 * Бегущая строка над лицом: всё, что происходит в компании, едет одной лентой справа
 * налево. Экран смотрят издалека и мельком, поэтому строка одна, крупная и без рамки.
 *
 * Шов не виден: лента нарисована дважды подряд и сдвигается ровно на ширину одной
 * копии — в момент возврата на месте первой копии стоит вторая. Скорость постоянная
 * (px/с), а не «за N секунд»: короткий день не летит, длинный не ползёт.
 * Анимация — один transform на весь узел (перф-контракт киоска).
 */

/** Комфортная скорость чтения с нескольких метров. */
const SPEED_PX_S = 90;

const COLOR: Record<TickerTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  gold: "var(--gold)",
  muted: "var(--text-muted)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

function Run({ items, mark }: { items: TickerItem[]; mark?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={mark} className="flex shrink-0 items-center">
      {items.map((item) => (
        <span key={item.id} className="flex shrink-0 items-center">
          <span
            aria-hidden
            className="mx-[2.4vh] h-[1vh] w-[1vh] shrink-0 rounded-full"
            style={{ background: COLOR[item.tone] }}
          />
          <span className="whitespace-nowrap text-[3.2vh] leading-[4.2vh]" style={{ color: item.tone === "muted" ? "var(--text-muted)" : "var(--text)" }}>
            {item.text}
          </span>
        </span>
      ))}
    </div>
  );
}

export function TvTicker({ items }: { items: TickerItem[] }) {
  const reduced = useReducedMotion();
  const runRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const digest = items.map((item) => item.id).join(",");

  useEffect(() => {
    // ширина одной копии: по ней считается и сдвиг, и длительность
    setWidth(runRef.current?.scrollWidth ?? 0);
  }, [digest]);

  if (items.length === 0) return null;

  const duration = width > 0 ? width / SPEED_PX_S : 0;

  return (
    <div
      className="relative w-full overflow-hidden py-[1vh]"
      aria-live="off"
      // края растворяются, а не обрезаются: строка выезжает из ничего и уходит в ничто
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)",
      }}
    >
      <motion.div
        className="flex w-max items-center"
        // строка меняется — анимация начинается заново, иначе новый текст въедет рывком
        key={digest}
        animate={reduced || duration === 0 ? undefined : { x: [0, -width] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        <Run items={items} mark={(node) => (runRef.current = node)} />
        <Run items={items} />
      </motion.div>
    </div>
  );
}
