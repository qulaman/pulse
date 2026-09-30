"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/lib/tasks/tone";
import { useBandStuck, useHeaderHeight } from "@/lib/useHeaderHeight";

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
 * list scrolls (under the navigation bar, D-113) and draws a hairline once it is stuck; `children` rides in the same sticky
 * band (the search field when it is open). `pending` is the same band before the data (the
 * screen's skeleton, D-122): the words in place, the counts empty, no tab chosen yet.
 */
export function Tabs<K extends string>({
  id,
  items,
  value,
  onChange,
  children,
  className = "",
  testIdPrefix = "tab-",
  pending = false,
}: {
  id: string;
  items: readonly TabItem<K>[];
  value: K;
  /** Left out in a skeleton: a server component cannot hand a function to the browser. */
  onChange?: (key: K) => void;
  /** Before the data: counts and the chosen tab are not known yet. */
  pending?: boolean;
  children?: ReactNode;
  /** Spacing above the band; the band itself must stay a direct child of the long page, or it cannot stick. */
  className?: string;
  /** `data-testid` of each tab is this plus its key. */
  testIdPrefix?: string;
}) {
  const top = useHeaderHeight();
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  // four piles («Заметки» with «Доски», D-102) do not fit thirds on a 320 px phone: each tab
  // takes the width of its words, one pixel of type smaller
  const many = items.length > 3;

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top + 1), {
      rootMargin: `-${Math.round(top)}px 0px 0px 0px`,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [top]);
  useBandStuck(stuck);

  return (
    <>
      <div ref={sentinel} aria-hidden className={`h-px ${className}`} />
      <div
        // the bar's glass under the bar (D-113): stuck, the pair reads as one bar with one hairline
        className={`nav-glass sticky z-[5] -mx-4 px-4 pb-2 pt-2 transition-[border-color] duration-[160ms] ${stuck ? "border-b border-border/70" : "border-b border-transparent"}`}
        style={{ top }}
      >
        <div role="tablist" aria-label="Стопки задач" className={`seg gap-1 rounded-[14px] p-1 ${many ? "flex" : "grid grid-cols-3"}`}>
          {items.map((item) => {
            const active = !pending && item.key === value;
            const lit = !pending && item.alert && item.count > 0;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={pending ? undefined : `${testIdPrefix}${item.key}`}
                disabled={pending}
                onClick={() => onChange?.(item.key)}
                className={`relative min-h-[40px] rounded-[10px] px-1 font-display font-semibold leading-[18px] tracking-[-0.01em] transition-colors duration-[120ms] ${
                  many ? "min-w-0 flex-auto text-[13px]" : "text-[14px]"
                } ${active ? "text-text" : "text-muted active:text-text"}`}
              >
                {active ? <motion.span layoutId={`${id}-thumb`} transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
                <span className={`relative z-[1] flex items-center justify-center whitespace-nowrap ${many ? "gap-1" : "gap-1.5"}`}>
                  {item.label}
                  <span
                    className={`nums inline-flex h-[19px] items-center justify-center rounded-full text-[12px] leading-none ${many ? "min-w-[14px] px-0.5" : "min-w-[19px] px-1.5"} ${lit ? "font-bold" : "font-semibold opacity-80"}`}
                    style={lit ? { background: TONE_VAR[item.alert as Tone], color: "var(--bg)" } : undefined}
                  >
                    {pending ? "" : item.count}
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

/**
 * The column under the tabs, remounted per tab (its `card-in` plays again, its paging starts
 * over) inside a box that stays. The steady box is load-bearing: React removes a parent's
 * deleted children before it walks that parent's other children, so a column keyed straight
 * under the page is already gone when the tab thumb (framer `layoutId`) measures itself on
 * unmount — for that read the page is one screen tall, Chrome clamps the scroll to the top,
 * and the thumb flies in from there. Inside this box the old column leaves after the tabs.
 */
export function TabColumnBox({ columnKey, className = "mt-1", children }: { columnKey: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div key={columnKey} className="card-in">
        {children}
      </div>
    </div>
  );
}
