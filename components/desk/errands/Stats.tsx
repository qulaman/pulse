"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import type { Errand } from "@/lib/errands/queries";
import { aqtobeDay, sceneOf, type DeskScene } from "@/lib/errands/scene";
import { medianDoneMinutes, outcomesOf, spanWords, tallyByPerson } from "@/lib/errands/stats";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { pluralRu } from "@/lib/tasks/status-text";

import { PersonFace, SceneTile } from "./look";

const DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

/** «12 нояб.» on the Aqtobe clock, for the readout over a day's bar. */
function dayWord(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The thirty days, oldest first, each with its count: the Aqtobe day the request was asked on. */
function perDay(rows: readonly Errand[], now: Date): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = aqtobeDay(new Date(row.created_at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: DAYS }, (_, index) => {
    const day = aqtobeDay(new Date(now.getTime() - (DAYS - 1 - index) * DAY_MS));
    return { day, count: counts.get(day) ?? 0 };
  });
}

/**
 * Thirty days as a column a day (D-174): one series in the quiet ink, today in the pen; the
 * columns grow from the baseline on arrival. A hover (or focus) names the day over the chart.
 */
function DaysChart({ rows, now }: { rows: readonly Errand[]; now: Date }) {
  const days = useMemo(() => perDay(rows, now), [rows, now]);
  const [at, setAt] = useState<number | null>(null);
  const top = Math.max(1, ...days.map((d) => d.count));
  const W = 30 * 8;
  const H = 44;
  const shown = at === null ? null : days[at];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex h-4 items-baseline justify-between text-[12px] leading-4 text-muted" aria-live="polite">
        {shown ? (
          <>
            <span>{dayWord(shown.day)}</span>
            <span className="nums text-text">
              {shown.count} {pluralRu(shown.count, ["заявка", "заявки", "заявок"])}
            </span>
          </>
        ) : (
          <>
            <span>По дням</span>
            <span>сегодня</span>
          </>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="pult-days block h-[44px] w-full" preserveAspectRatio="none" role="img" aria-label={`Заявки по дням за ${DAYS} дней`} onMouseLeave={() => setAt(null)}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="pult-days-base" />
        {days.map((day, index) => {
          const h = day.count === 0 ? 0 : Math.max(3, Math.round((day.count / top) * (H - 4)));
          const today = index === days.length - 1;
          return (
            <g key={day.day} onMouseEnter={() => setAt(index)}>
              {/* the hit target is the whole slot, taller than the column */}
              <rect x={index * 8} y={0} width={8} height={H} fill="transparent" />
              {h > 0 ? (
                <rect
                  x={index * 8 + 1}
                  y={H - h}
                  width={6}
                  height={h}
                  rx={1.5}
                  className="pult-day"
                  data-today={today ? "" : undefined}
                  data-on={at === index ? "" : undefined}
                  style={{ animationDelay: `${index * 12}ms` } as CSSProperties}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** What is asked most: the scenes by count, each with its icon and a bar that fills. */
function TopScenes({ rows, catalogue }: { rows: readonly Errand[]; catalogue: readonly SecretaryAction[] }) {
  const top = useMemo(() => {
    const counts = new Map<DeskScene, { count: number; label: string }>();
    for (const row of rows) {
      const scene = sceneOf(row, catalogue);
      const was = counts.get(scene);
      counts.set(scene, { count: (was?.count ?? 0) + 1, label: was?.label ?? row.label });
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  }, [rows, catalogue]);
  if (top.length === 0) return null;
  const most = top[0][1].count;
  return (
    <ul className="flex flex-col gap-2" aria-label="Чаще всего">
      {top.map(([scene, { count, label }], index) => (
        <li key={scene} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1" title={`${label}: ${count}`}>
          <SceneTile scene={scene} size={22} />
          <span className="truncate text-[13px] leading-[18px]">{label}</span>
          <span className="nums text-[13px] leading-[18px] text-muted">{count}</span>
          <span aria-hidden className="pult-bar col-start-2 col-end-4" style={{ "--fill": count / most, animationDelay: `${120 + index * 60}ms` } as CSSProperties}>
            <i />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The thirty days of the director's «Заявки» (D-174, D-175): how many, how fast as the median — one
 * forgotten coffee does not make every coffee slow — what nobody took (the one figure worth fixing,
 * amber only above zero), how they ended, the days as columns, what is asked most, and who took what
 * — only where there is more than one secretary to compare. Every number from the same rows.
 */
export function ErrandStats({ rows, now, catalogue, several }: { rows: readonly Errand[]; now: Date; catalogue: readonly SecretaryAction[]; several: boolean }) {
  const outcomes = outcomesOf(rows);
  const usual = medianDoneMinutes(rows);
  const tally = tallyByPerson(rows);
  // the tally keys a person by the short name: their id and full name back for the circle
  const people = new Map(rows.filter((row) => row.claimed_by).map((row) => [shortName(row.claimed?.full_name ?? "") || "Секретарь", { id: row.claimed_by as string, name: row.claimed?.full_name ?? "" }]));
  return (
    <aside className="pult-card pult-month" data-testid="desk-errands-stats">
      <header className="pult-month-head">
        <h2 className="pult-month-title">За 30 дней</h2>
        <span className="pult-month-total">
          <RollingNumber value={outcomes.asked} className="nums" /> {pluralRu(outcomes.asked, ["заявка", "заявки", "заявок"])}
        </span>
      </header>
      <div className="pult-month-figures">
        <div className="pult-figure" title="Медиана «попросил → готово»: половина просьб сделана быстрее">
          <span className="pult-figure-value nums">{spanWords(usual)}</span>
          <span className="pult-figure-label">обычно до «готово»</span>
        </div>
        <div className="pult-figure" data-tone={outcomes.unclaimed > 0 ? "warn" : undefined} title="Просьбы, которые никто не взял">
          <span className="pult-figure-value nums">{outcomes.unclaimed}</span>
          <span className="pult-figure-label">не взяли</span>
        </div>
      </div>
      <p className="pult-month-ends nums" data-testid="desk-errands-outcomes">
        взято {outcomes.taken} · готово {outcomes.done}
        {outcomes.declined > 0 ? ` · отказ ${outcomes.declined}` : ""} · отменено {outcomes.cancelled}
      </p>
      <DaysChart rows={rows} now={now} />
      {rows.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="pult-month-sub">Чаще всего</h3>
          <TopScenes rows={rows} catalogue={catalogue} />
        </section>
      ) : null}
      {/* who took what says something only where there is somebody to compare with */}
      {several || tally.length > 1 ? (
        <section className="flex flex-col gap-2" aria-label="Кто сколько взял">
          <h3 className="pult-month-sub">Кто брал</h3>
          <ul className="flex flex-col gap-1.5">
            {tally.map((person) => (
              <li key={person.name} className="flex items-center gap-2.5">
                <PersonFace id={people.get(person.name)?.id} name={people.get(person.name)?.name || person.name} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium leading-[18px]">{person.name}</span>
                  <span className="nums truncate text-[12px] leading-4 text-muted">
                    взято {person.taken} · готово {person.done}
                    {person.declined > 0 ? (
                      <>
                        {" · "}
                        <span className="pult-pencil">отказ {person.declined}</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
