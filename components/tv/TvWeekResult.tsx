"use client";

import { motion } from "motion/react";

import { weekResultView, type TvWeekResultData } from "@/lib/tv/results";

/**
 * Сцена «Итог недели» (D-182): с пятницы 16:00 в круге. Принято за семь суток — героем, ниже
 * лучший день, лидер недели и очки (гостю — без очков, лидер приходит без фамилии, D-33).
 * Ничего, что читается как отставание (D-45).
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvWeekResult({ week, guest }: { week: TvWeekResultData; guest: boolean; now: Date }) {
  const view = weekResultView(week, guest);

  return (
    <section className="flex h-full w-full max-w-[94vw] flex-col justify-center gap-[4vh]" data-testid="tv-week-result">
      <header>
        <p className="tv-caption font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gold)" }}>
          Последние 7 дней
        </p>
        <h2 className="tv-title font-bold tracking-[-0.03em]">Итог недели</h2>
      </header>

      {view.state === "quiet" ? (
        <p className="tv-lead text-muted">Спасибо за неделю</p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-end gap-x-[8vh] gap-y-[4vh]">
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: "2vh" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <p className="tv-giant nums font-bold tabular-nums" style={{ color: "var(--ok)" }}>
              {view.done}
            </p>
            <p className="tv-lead mt-[1vh] text-muted">{view.doneLabel}</p>
          </motion.div>
          {view.lines.length > 0 ? (
            <ul className="flex min-w-0 flex-col gap-[2.6vh] pb-[1vh]">
              {view.lines.map((line, index) => (
                <motion.li
                  key={line.label}
                  className="min-w-0"
                  initial={{ opacity: 0, x: "3vh" }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.12, ease: EASE }}
                >
                  <p className="tv-caption text-muted">{line.label}</p>
                  <p className="tv-lead nums font-bold tabular-nums [overflow-wrap:anywhere]">{line.value}</p>
                </motion.li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
