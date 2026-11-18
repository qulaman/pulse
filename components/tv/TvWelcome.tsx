"use client";

import { motion } from "motion/react";

import { StillLogo } from "@/components/ui/StillLogo";
import { tvDate, tvTime } from "@/lib/tv/clock";

/**
 * Сцена «Приветствие» (D-182): гость в кабинете или утро — логотип компании (неподвижный,
 * D-155), «Добро пожаловать», название и время. Ни людей, ни чисел.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvWelcome({ company, logoUrl, now }: { company: string; logoUrl: string | null; now: Date }) {
  return (
    <section className="flex h-full w-full max-w-[90vw] flex-col items-center justify-center gap-[4vh] text-center" data-testid="tv-welcome">
      {logoUrl ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: EASE }}>
          <StillLogo src={logoUrl} className="h-[18vh] w-auto max-w-[60vw] object-contain" />
        </motion.div>
      ) : null}
      <motion.div
        initial={{ opacity: 0, y: "2vh" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
      >
        <p className="tv-lead text-muted">Добро пожаловать</p>
        <h2 className="tv-title mt-[1.4vh] font-bold tracking-[-0.03em] [overflow-wrap:anywhere]">{company}</h2>
      </motion.div>
      <p className="tv-text nums tabular-nums text-muted">
        {tvTime(now)} · {tvDate(now)}
      </p>
    </section>
  );
}
