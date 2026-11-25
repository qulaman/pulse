"use client";

import { AnimatePresence, motion } from "motion/react";

import { Icon } from "@/components/tasks/icons";
import { capitalized, type ReviewFact } from "@/lib/daily-report/format";

/**
 * What happened to a handed-in report, in one quiet line (D-198): «Сдан 17:52 · просмотрен 18:40 ·
 * ✓ проверен 19:05». Only what did happen is there (`reviewFacts`); «проверен» is the one word in
 * green with its tick, the rest grey. A mark that lands while the screen is open fades in where it
 * stands — the line was already there, nothing jumps.
 */
export function ReviewFacts({ facts, capital = false, className = "" }: { facts: readonly ReviewFact[]; capital?: boolean; className?: string }) {
  if (facts.length === 0) return null;
  return (
    <span className={`nums ${className}`} data-testid="report-facts">
      <AnimatePresence initial={false}>
        {facts.map((fact, index) => {
          const text = capital && index === 0 ? capitalized(fact.text) : fact.text;
          return (
            <motion.span
              key={fact.kind}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.35 } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              data-fact={fact.kind}
            >
              {index > 0 ? " · " : ""}
              {fact.kind === "checked" ? <CheckedWord text={text} /> : text}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

/** «✓ проверен 19:05» — green and medium, not a badge: the director's quiet mark. */
export function CheckedWord({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-[3px] whitespace-nowrap align-bottom font-medium text-ok">
      <Icon name="check" size={13} />
      {text}
    </span>
  );
}
