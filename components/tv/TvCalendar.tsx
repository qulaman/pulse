"use client";

import { motion } from "framer-motion";

import { weekColumns, weekSummary, type CalendarRow } from "@/lib/tv/calendar";
import type { TvCalendar as TvCalendarData } from "@/lib/tv/queries";

import s from "./tv.module.css";

/**
 * Заставка «Календарь» (D-96): неделя вперёд семью колонками, с сегодняшнего дня. На
 * совещании директор ставит её на стену — и все видят, что впереди, не доставая
 * телефонов.
 *
 * Горит одно мероприятие: то, что идёт сейчас (медленно дышит), иначе — ближайшее;
 * прошедшее за сегодня гаснет. Гостю названий и мест не приезжает уже из БД (D-33).
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvCalendar({ calendar, now }: { calendar: TvCalendarData | null; now: Date }) {
  const columns = weekColumns(calendar, now);

  return (
    <div className="flex w-full max-w-[94vw] flex-col gap-[2.4vh]" data-testid="tv-calendar">
      <div className="flex items-baseline gap-[2.4vh] px-[0.6vh]">
        <p className="text-[4.4vh] font-bold leading-[5.4vh] tracking-[-0.02em]">Календарь</p>
        <p className="text-[2.8vh] leading-[3.6vh] text-muted">{weekSummary(columns)}</p>
      </div>

      <div className="grid grid-cols-7 gap-[1.6vh]">
        {columns.map((column, index) => (
          <motion.section
            key={column.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: index * 0.05, ease: EASE }}
            className="flex min-w-0 flex-col gap-[1.2vh] rounded-[2vh] p-[1.4vh]"
            style={{
              background: column.today
                ? "color-mix(in srgb, var(--accent) 9%, var(--surface))"
                : "color-mix(in srgb, var(--surface) 55%, transparent)",
              boxShadow: column.today ? "inset 0 0 0 0.25vh color-mix(in srgb, var(--accent) 45%, transparent)" : undefined,
            }}
            data-today={column.today || undefined}
          >
            {/* the day on top, its date under it: «Сегодня» never gets cut to «Сего…» */}
            <header className="flex flex-col px-[0.4vh]">
              <span
                className="truncate text-[3vh] font-bold leading-[3.8vh]"
                style={{ color: column.today ? "var(--accent)" : column.weekend ? "var(--text-muted)" : "var(--text)" }}
              >
                {column.label}
              </span>
              <span className="text-[2.1vh] leading-[2.8vh] text-muted">{column.date}</span>
            </header>

            {column.rows.length === 0 ? (
              <p className="px-[0.4vh] text-[2.6vh] leading-[3.4vh] text-muted opacity-50">—</p>
            ) : (
              <ul className="flex flex-col gap-[1vh]">
                {column.rows.map((row) => (
                  <EventRow key={row.id} row={row} />
                ))}
                {column.more > 0 ? (
                  <li className="px-[0.4vh] text-[2.2vh] leading-[2.8vh] text-muted">+ ещё {column.more}</li>
                ) : null}
              </ul>
            )}
          </motion.section>
        ))}
      </div>
    </div>
  );
}

function EventRow({ row }: { row: CalendarRow }) {
  const lit = row.state === "now" || row.state === "next";
  return (
    <li
      className={`relative overflow-hidden rounded-[1.4vh] py-[1.1vh] pl-[1.8vh] pr-[1.2vh] ${row.state === "now" ? s.live : ""}`}
      style={{
        background: lit ? "color-mix(in srgb, var(--accent) 16%, var(--surface-2))" : "var(--surface-2)",
        opacity: row.state === "past" ? 0.42 : 1,
      }}
      data-state={row.state}
    >
      <span
        aria-hidden
        className="absolute inset-y-[1vh] left-0 w-[0.5vh] rounded-r-full"
        style={{ background: lit ? "var(--accent)" : "var(--border)" }}
      />
      <p className="flex items-baseline gap-[1vh]">
        <span className="text-[2.8vh] font-bold leading-[3.4vh] tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text)" }}>
          {row.time}
        </span>
        {row.state === "now" ? (
          <span className="text-[1.9vh] font-semibold uppercase leading-[2.4vh] tracking-[0.08em]" style={{ color: "var(--accent)" }}>
            идёт
          </span>
        ) : null}
      </p>
      <p className="mt-[0.3vh] line-clamp-2 text-[2.5vh] font-medium leading-[3.2vh] [overflow-wrap:anywhere]">{row.title}</p>
      {row.detail ? <p className="mt-[0.2vh] truncate text-[2vh] leading-[2.6vh] text-muted">{row.detail}</p> : null}
    </li>
  );
}
