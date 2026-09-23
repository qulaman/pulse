"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { LAB_TABS, type LabTab } from "@/lib/lab/tabs";

const TITLES: Record<LabTab, string> = { models: "Модели", costs: "Себестоимость" };

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

/**
 * The lab as two tabs: the model bench with its per-call costs, and what a client instance
 * costs to run. A tab is mounted on its first visit and then only hidden, so the calculator
 * keeps its sliders across a trip to the models; the address keeps the tab for a reload.
 */
export function LabTabs({ initialTab, panels }: { initialTab: LabTab; panels: Record<LabTab, ReactNode> }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<LabTab>>(() => new Set([initialTab]));

  const select = (next: LabTab) => {
    if (next === tab) return;
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    window.history.replaceState(null, "", `?tab=${next}`);
  };

  return (
    <>
      <div role="tablist" aria-label="Разделы лаборатории" className="seg mt-4 grid grid-cols-2 gap-1 rounded-[14px] p-1">
        {LAB_TABS.map((key) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`lab-tab-${key}`}
              aria-controls={`lab-panel-${key}`}
              aria-selected={active}
              data-testid={`lab-tab-${key}`}
              onClick={() => select(key)}
              className={`relative min-h-[40px] rounded-[10px] px-1 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] transition-colors duration-[120ms] ${
                active ? "text-text" : "text-muted active:text-text"
              }`}
            >
              {active ? <motion.span layoutId="lab-tab-thumb" transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
              <span className="relative z-[1]">{TITLES[key]}</span>
            </button>
          );
        })}
      </div>
      {LAB_TABS.map((key) =>
        visited.has(key) ? (
          <section key={key} role="tabpanel" id={`lab-panel-${key}`} aria-labelledby={`lab-tab-${key}`} hidden={key !== tab} className="mt-4">
            {panels[key]}
          </section>
        ) : null,
      )}
    </>
  );
}
