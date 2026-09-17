"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { tvWeekday } from "@/lib/tv/clock";
import type { TvLoadRow, TvMerchRow, TvRatingRow, TvSummary, TvWeekDay } from "@/lib/tv/queries";

/**
 * Правый низ: карусель по 15 секунд с кроссфейдом — топ-5 недели, загрузка людей,
 * график недели, выдачи наград (CONCEPT §3.5). График рисуется руками: Recharts на
 * киоск не тащим (docs/FRONTEND.md «ТВ-режим»).
 *
 * Панели, у которых нет данных, из карусели выпадают: до гейта адаптации очки выключены
 * (D-40), и экран не должен крутить пустые слайды.
 */

const PANEL_MS = 15_000;

type Panel = { key: string; title: string; body: React.ReactNode };

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="mt-[1.6vh] flex flex-1 flex-col justify-evenly gap-[1.2vh]">{children}</ul>;
}

function TopFive({ rows }: { rows: TvRatingRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.points ?? 0));
  return (
    <Rows>
      {rows.map((row) => (
        <li key={`${row.rank}-${row.name}`} className="flex items-center gap-[1.4vh]">
          <span className="w-[3vh] shrink-0 text-[2.2vh] font-semibold leading-[2.8vh] text-muted tabular-nums">
            {row.rank}
          </span>
          <span className="w-[22vh] shrink-0 truncate text-[2.4vh] leading-[3vh]">{row.name}</span>
          {/* у гостя очков нет вовсе — вместо пустой полосы остаётся только место (D-33) */}
          {row.points === null ? null : (
            <>
              <span className="h-[1.2vh] flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((100 * row.points) / max)}%`,
                    background: "var(--gold)",
                    transition: "width 500ms var(--ease-out)",
                  }}
                />
              </span>
              <span className="w-[7vh] shrink-0 text-right text-[2.4vh] font-semibold leading-[3vh] text-gold tabular-nums">
                {row.points}
              </span>
            </>
          )}
        </li>
      ))}
    </Rows>
  );
}

function Load({ rows }: { rows: TvLoadRow[] }) {
  return (
    <Rows>
      {rows.slice(0, 6).map((row) => (
        <li key={row.name} className="flex items-center justify-between gap-[1.4vh]">
          <span className="min-w-0 flex-1 truncate text-[2.4vh] leading-[3vh]">{row.name}</span>
          <span className="shrink-0 text-[2.4vh] leading-[3vh] text-muted tabular-nums">
            {/* глаголы и прилагательные не согласуются с человеком: имя не даёт рода */}
            {row.active === 0 ? "без задач" : `${row.active} в работе`}
          </span>
        </li>
      ))}
    </Rows>
  );
}

function Week({ days }: { days: TvWeekDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.done));
  return (
    <div className="mt-[2vh] flex flex-1 items-end gap-[1.4vh] pb-[1vh]">
      {days.map((day) => (
        <div key={day.day} className="flex flex-1 flex-col items-center gap-[0.8vh]">
          <span className="text-[1.9vh] leading-[2.2vh] text-muted tabular-nums">{day.done}</span>
          <span
            className="w-full rounded-t-[0.8vh]"
            style={{
              height: `${Math.max(4, Math.round((100 * day.done) / max))}%`,
              background: day.done > 0 ? "var(--accent)" : "var(--surface-2)",
              transition: "height 500ms var(--ease-out)",
            }}
          />
          <span className="text-[1.8vh] leading-[2.2vh] text-muted">{tvWeekday(new Date(`${day.day}T12:00:00+05:00`))}</span>
        </div>
      ))}
    </div>
  );
}

function Merch({ rows }: { rows: TvMerchRow[] }) {
  return (
    <Rows>
      {rows.slice(0, 5).map((row) => (
        <li key={`${row.at}-${row.name}`} className="flex items-center justify-between gap-[1.4vh]">
          <span className="min-w-0 flex-1 truncate text-[2.4vh] leading-[3vh]">{row.name}</span>
          <span className="shrink-0 text-[2.4vh] leading-[3vh] text-gold">{row.title}</span>
        </li>
      ))}
    </Rows>
  );
}

export function panelsOf(summary: TvSummary): Panel[] {
  const panels: Panel[] = [];
  if (summary.points_enabled && summary.rating.length > 0) {
    panels.push({ key: "rating", title: "Топ недели", body: <TopFive rows={summary.rating} /> });
  }
  if (summary.load.length > 0) {
    panels.push({ key: "load", title: "Кто чем занят", body: <Load rows={summary.load} /> });
  }
  if (summary.week.length > 0) {
    panels.push({ key: "week", title: "Неделя: закрыто задач", body: <Week days={summary.week} /> });
  }
  if (summary.points_enabled && summary.merch.length > 0) {
    panels.push({ key: "merch", title: "Награды", body: <Merch rows={summary.merch} /> });
  }
  return panels;
}

export function TvCarousel({ summary }: { summary: TvSummary }) {
  const panels = panelsOf(summary);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (panels.length < 2) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % panels.length), PANEL_MS);
    return () => clearInterval(timer);
  }, [panels.length]);

  if (panels.length === 0) return null;
  const panel = panels[Math.min(index, panels.length - 1)]!;

  return (
    <section className="relative flex flex-col overflow-hidden rounded-[1.8vh] border border-border bg-surface px-[2.4vh] py-[2.2vh]">
      <AnimatePresence mode="wait">
        <motion.div
          key={panel.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-1 flex-col"
        >
          <p className="text-[1.8vh] uppercase leading-[2.2vh] tracking-[0.18em] text-muted">{panel.title}</p>
          {panel.body}
        </motion.div>
      </AnimatePresence>

      {panels.length > 1 ? (
        <div className="mt-[1.6vh] flex justify-center gap-[0.8vh]">
          {panels.map((item, i) => (
            <span
              key={item.key}
              className="h-[0.8vh] w-[0.8vh] rounded-full"
              style={{ background: i === index ? "var(--accent)" : "var(--surface-2)" }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
