"use client";

import { AnimatePresence, motion } from "framer-motion";

import { verdict } from "@/lib/tasks/status-text";
import type { TvCounts, TvToday } from "@/lib/tv/queries";
import type { TvSpeech } from "@/lib/tv/voice";

import { TvMascot } from "./TvMascot";

/**
 * Правый верх — голова экрана: лицо со словом о моменте, три числа дня и вердикт.
 * Вердикт считается тем же `verdict()`, что у директора в телефоне, но на стене он
 * безличен: имён в нём нет и быть не может (D-45).
 */

const TONE: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

function Number({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="relative block h-[7vh] w-full text-center">
        <AnimatePresence mode="popLayout">
          {/* число меняется — оно не подменяется молча, а проступает: экран смотрят издалека */}
          <motion.span
            key={value}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14, position: "absolute" }}
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
            className="absolute inset-0 text-[6.4vh] font-bold leading-[7vh] tabular-nums"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="text-[1.8vh] leading-[2.2vh] text-muted">{label}</span>
    </div>
  );
}

export function TvVerdict({ counts, today, speech }: { counts: TvCounts; today: TvToday; speech: TvSpeech }) {
  const line = verdict(counts);
  const color = TONE[line.tone] ?? "var(--text)";

  return (
    <section className="flex flex-col gap-[2vh] rounded-[1.8vh] border border-border bg-surface px-[2.4vh] py-[2.2vh]">
      <TvMascot speech={speech} />

      <div className="flex items-end justify-between border-t border-border pt-[1.8vh]">
        <Number value={today.sent} label="поручений за день" />
        <Number value={today.done} label="принято" />
        <Number value={today.in_work} label="в работе" />
      </div>

      <p
        className="flex items-center gap-[1.2vh] rounded-[1.2vh] px-[1.6vh] py-[1vh] text-[2.4vh] leading-[3vh]"
        style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <span aria-hidden className="h-[1vh] w-[1vh] shrink-0 rounded-full" style={{ background: color }} />
        {line.text}
      </p>
    </section>
  );
}
