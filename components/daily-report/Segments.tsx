"use client";

import { motion } from "framer-motion";

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

/**
 * Two or three views of one screen as a segmented control — the «seg» band of «Задачи» and
 * «Настройки», without counts. Without `onChange` (a server skeleton) it is a picture of itself.
 */
export function Segments<K extends string>({
  id,
  items,
  value,
  onChange,
  label,
  className = "",
}: {
  id: string;
  items: readonly { key: K; label: string }[];
  value: K;
  onChange?: (key: K) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`seg grid gap-1 rounded-[14px] p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`${id}-${item.key}`}
            disabled={!onChange}
            onClick={() => onChange?.(item.key)}
            className={`relative min-h-[40px] rounded-[10px] px-1 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] transition-colors duration-[120ms] ${
              active ? "text-text" : "text-muted active:text-text"
            }`}
          >
            {active ? <motion.span layoutId={`${id}-thumb`} transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
            <span className="relative z-[1]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
