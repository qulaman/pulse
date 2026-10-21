"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

import { useDockSpace } from "@/components/ui/dock";
import { pluralRu } from "@/lib/tasks/status-text";

import p from "./presenter.module.css";

/**
 * «Раздать поручения» (D-140): while the director picks a person for each point, this glass
 * bar stands over the tab bar where the presenter's capsule does — how many are picked, and
 * one tap sends them all. «Отмена» leaves the board as it was; outside the delivery window
 * the toggle says when people get them, as the people sheet does (D-38).
 */
export function HandOutBar({
  picked,
  busy,
  quiet,
  now,
  onQuiet,
  onSend,
  onCancel,
}: {
  picked: number;
  busy: boolean;
  /** Outside the delivery window: «утром в 08:00», unless «сразу». */
  quiet: string | null;
  /** «сразу» is on. */
  now: boolean;
  onQuiet: () => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  // the bottom toasts stand above the bar, not over «Поручить» (D-142)
  const dock = useRef<HTMLDivElement>(null);
  useDockSpace(dock);
  return (
    <motion.div
      ref={dock}
      className={`above-tabbar ${p.dock}`}
      style={{ bottom: "calc(var(--tabbar-space) + 8px)" }}
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
    >
      <div className="pointer-events-auto flex w-[min(100%,476px)] flex-col gap-1.5" data-testid="hand-out-bar">
        {quiet ? (
          <button
            type="button"
            onClick={onQuiet}
            aria-pressed={now}
            data-testid="hand-out-now"
            className="mx-auto rounded-full border border-border/70 bg-surface/95 px-3 py-1.5 text-[12px] leading-4 text-muted shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          >
            {now ? "Уйдут сразу, несмотря на тихие часы · утром" : `Тихие часы — получат ${quiet} · сразу`}
          </button>
        ) : null}
        <div className={p.capsule}>
          <button
            type="button"
            onClick={onCancel}
            data-testid="hand-out-cancel"
            className="min-h-[44px] shrink-0 rounded-[18px] px-3.5 text-[15px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.06]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={picked === 0 || busy}
            data-testid="hand-out-send"
            className="btn-primary ml-auto min-h-[44px] min-w-0 flex-1 rounded-[18px] px-4 text-[15px] font-semibold text-bg transition-[transform,opacity] duration-[120ms] active:scale-[0.98] disabled:opacity-45"
          >
            {busy ? "Поручаю…" : picked === 0 ? "Выберите, кому" : `Поручить ${picked} ${pluralRu(picked, ["пункт", "пункта", "пунктов"])}`}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
