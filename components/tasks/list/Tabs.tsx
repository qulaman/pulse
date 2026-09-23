"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/lib/tasks/tone";
import { useHeaderHeight } from "@/lib/useHeaderHeight";

export type TabItem<K extends string> = {
  key: K;
  label: string;
  count: number;
  /** A tab that asks for a move («Ждут вас», «Новые») wears its count as a lit pill. */
  alert?: Tone;
};

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

/**
 * The three piles of the list as one segmented control (iOS-style): a raised thumb slides
 * to the chosen tab, each tab carries its count. It sticks under the app header while the
 * list scrolls and draws a hairline once it is stuck; `children` rides in the same sticky
 * band (the search field when it is open).
 */
export function Tabs<K extends string>({
  id,
  items,
  value,
  onChange,
  children,
  className = "",
}: {
  id: string;
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  children?: ReactNode;
  /** Spacing above the band; the band itself must stay a direct child of the long page, or it cannot stick. */
  className?: string;
}) {
  const top = useHeaderHeight();
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top + 1), {
      rootMargin: `-${Math.round(top)}px 0px 0px 0px`,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [top]);

  return (
    <>
      <div ref={sentinel} aria-hidden className={`h-px ${className}`} />
      <div
        className={`sticky z-[5] -mx-4 bg-bg px-4 pb-2 pt-2 transition-[border-color] duration-[160ms] ${stuck ? "border-b border-border/70" : "border-b border-transparent"}`}
        style={{ top }}
      >
        <div role="tablist" aria-label="Стопки задач" className="seg grid grid-cols-3 gap-1 rounded-[14px] p-1">
          {items.map((item) => {
            const active = item.key === value;
            const lit = item.alert && item.count > 0;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`tab-${item.key}`}
                onClick={() => onChange(item.key)}
                className={`relative min-h-[40px] rounded-[10px] px-1 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] transition-colors duration-[120ms] ${
                  active ? "text-text" : "text-muted active:text-text"
                }`}
              >
                {active ? <motion.span layoutId={`${id}-thumb`} transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
                <span className="relative z-[1] flex items-center justify-center gap-1.5 whitespace-nowrap">
                  {item.label}
                  <span
                    className={`nums inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[12px] leading-none ${lit ? "font-bold" : "font-semibold opacity-80"}`}
                    style={lit ? { background: TONE_VAR[item.alert as Tone], color: "var(--bg)" } : undefined}
                  >
                    {item.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </>
  );
}
