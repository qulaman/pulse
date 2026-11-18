"use client";

import { motion } from "motion/react";

import { tvDate } from "@/lib/tv/clock";
import { dayResultView, type TvDayResultData } from "@/lib/tv/results";

/**
 * Сцена «Итог дня» (D-182): вечером первой в круге. Одно число — сколько принято сегодня, под
 * ним — сколько людей сдали работу и очки дня, рядом до трёх наград с причиной. Только хорошее:
 * ни «из N», ни процентов, ни тех, кто не сдал (D-45). Гостю — без очков и наград (D-33).
 * День без принятого не показывается нулём — сцена говорит «спасибо за день».
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvDayResult({ day, guest, now }: { day: TvDayResultData; guest: boolean; now: Date }) {
  const view = dayResultView(day, guest);

  return (
    <section className="flex h-[72vh] w-full max-w-[94vw] flex-col justify-center gap-[4vh]" data-testid="tv-day-result">
      <header>
        <p className="tv-caption font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gold)" }}>
          {tvDate(now)}
        </p>
        <h2 className="tv-title font-bold tracking-[-0.03em]">Итог дня</h2>
      </header>

      {view.state === "quiet" ? (
        <p className="tv-lead text-muted">Спасибо за день</p>
      ) : (
        <div
          className="grid min-h-0 flex-1 items-center gap-[6vh]"
          style={{ gridTemplateColumns: view.awards.length > 0 ? "minmax(0, 1fr) minmax(0, 1.15fr)" : "minmax(0, 1fr)" }}
        >
          <div className="flex min-w-0 flex-col gap-[3vh]">
            <motion.div
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
              <ul className="flex flex-col gap-[1.2vh]">
                {view.lines.map((line) => (
                  // «9 человек сдали работу», «+230 очков за день»: the number leads, the words follow
                  <li key={line.label} className="tv-lead min-w-0">
                    <span className="nums font-bold tabular-nums">{line.value}</span> <span className="text-muted">{line.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {view.awards.length > 0 ? (
            // a column that wraps what does not fit into a second column the box cuts off: at «далеко» the last
            // reward leaves whole, never cut in half
            <ul className="flex h-full min-h-0 min-w-0 flex-col flex-wrap content-start justify-center gap-[2.4vh] overflow-hidden" aria-label="Награды дня">
              {view.awards.map((award, index) => (
                <motion.li
                  key={`${award.name}-${index}`}
                  className="flex w-full min-w-0 items-start gap-[2vh] rounded-[2vh] px-[2.6vh] py-[1.8vh]"
                  style={{ background: "color-mix(in srgb, var(--gold) 10%, var(--surface))" }}
                  initial={{ opacity: 0, x: "3vh" }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.12, ease: EASE }}
                >
                  <span className="tv-lead nums shrink-0 font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                    +{award.amount}
                  </span>
                  <div className="min-w-0">
                    <p className="tv-lead font-semibold [overflow-wrap:anywhere]">{award.name}</p>
                    {award.reason ? <p className="tv-text line-clamp-1 text-muted">{award.reason}</p> : null}
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
