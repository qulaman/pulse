"use client";

import { useState } from "react";

import { dayName, isoWeekday } from "@/lib/daily-report/format";
import type { TeamPeriod } from "@/lib/daily-report/types";
import { parseYmd } from "@/lib/datetime/calendar";

type Day = TeamPeriod["days"][number];

const LETTERS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;
const HEIGHT = 88;

/**
 * The team's period day by day: one column a day, reports handed in at the bottom (`--ok`),
 * the ones missed stacked on top (`--danger`), a 2 px gap between both and between days, the
 * data end rounded and the foot on the baseline. Days off are dimmed; a day nobody owed is a
 * stub. A tap on a column says that day in words under the strip (the hover of a phone).
 * Plain CSS boxes — no chart library (tasks/021).
 */
export function DayStrip({ days, now }: { days: readonly Day[]; now: Date }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((day) => day.submitted + day.missed));
  const many = days.length > 40;
  const chosen = days.find((day) => day.date === picked) ?? null;

  return (
    <div data-testid="day-strip">
      <div className="flex items-end" style={{ height: HEIGHT, gap: many ? 1 : 2 }}>
        {days.map((day) => {
          const total = day.submitted + day.missed;
          const on = picked === day.date;
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={on}
              aria-label={`${dayName(day.date, now)}: сдали ${day.submitted}, не сдали ${day.missed}${day.workday ? "" : ", не рабочий день"}`}
              title={`${dayName(day.date, now)}: сдали ${day.submitted} · не сдали ${day.missed}`}
              onClick={() => setPicked(on ? null : day.date)}
              className="flex h-full min-w-0 flex-1 flex-col justify-end rounded-[4px] transition-opacity duration-[120ms]"
              style={{ opacity: picked && !on ? 0.45 : day.workday ? 1 : 0.55 }}
            >
              {total === 0 ? (
                <span className="block h-[3px] rounded-full bg-border" />
              ) : (
                <>
                  {day.missed > 0 ? (
                    <span
                      className="block rounded-t-[4px]"
                      style={{ height: `${(day.missed / max) * 100}%`, background: "var(--danger)", marginBottom: day.submitted > 0 ? 2 : 0 }}
                    />
                  ) : null}
                  {day.submitted > 0 ? (
                    <span
                      className={`block ${day.missed > 0 ? "" : "rounded-t-[4px]"}`}
                      style={{ height: `${(day.submitted / max) * 100}%`, background: "var(--ok)" }}
                    />
                  ) : null}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* the baseline the columns stand on */}
      <div className="mt-px h-px bg-border" />

      <div className="mt-1 flex" style={{ gap: many ? 1 : 2 }} aria-hidden>
        {days.map((day) => (
          <span key={day.date} className="nums min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] leading-[14px] text-muted">
            {tick(day.date, days.length)}
          </span>
        ))}
      </div>

      <p className="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-[18px]" aria-live="polite">
        {chosen ? (
          <span>
            <span className="text-text">{dayName(chosen.date, now)}</span>
            <span className="text-muted">
              {" "}
              · сдали <span className="nums text-text">{chosen.submitted}</span> · не сдали{" "}
              <span className="nums text-text">{chosen.missed}</span> · сдано задач <span className="nums text-text">{chosen.handed_over}</span>
            </span>
          </span>
        ) : (
          <>
            <Legend color="var(--ok)" label="сдали" />
            <Legend color="var(--danger)" label="не сдали" />
            <span className="text-muted">тап по дню — подробности</span>
          </>
        )}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-muted">{label}</span>
    </span>
  );
}

/** Under a week — every weekday; under a month — the Mondays' dates, so the labels never collide. */
function tick(date: string, count: number): string {
  if (count <= 14) return LETTERS[isoWeekday(date)];
  return isoWeekday(date) === 1 ? String(parseYmd(date)?.day ?? "") : "";
}
