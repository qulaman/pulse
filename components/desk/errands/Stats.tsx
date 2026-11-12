"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import type { Errand } from "@/lib/errands/queries";
import { aqtobeDay, sceneOf, type DeskScene } from "@/lib/errands/scene";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount } from "@/lib/errands/stats";
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
      <svg viewBox={`0 0 ${W} ${H}`} className="errands-days block h-[44px] w-full" preserveAspectRatio="none" role="img" aria-label={`Заявки по дням за ${DAYS} дней`} onMouseLeave={() => setAt(null)}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="errands-days-base" />
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
                  className="errands-day"
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
          <span aria-hidden className="errands-bar col-start-2 col-end-4" style={{ "--fill": count / most, animationDelay: `${120 + index * 60}ms` } as CSSProperties}>
            <i />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The thirty days of the director's «Заявки» (D-174): how many, how fast, what nobody took — the
 * one figure worth fixing — the days as columns, what is asked most, and who took what, by face.
 */
export function ErrandStats({ rows, now, catalogue }: { rows: readonly Errand[]; now: Date; catalogue: readonly SecretaryAction[] }) {
  const tally = tallyByPerson(rows);
  const unclaimed = unclaimedCount(rows);
  const average = averageDoneMinutes(rows);
  // the tally keys a person by the short name: their id and full name back for the circle
  const people = new Map(rows.filter((row) => row.claimed_by).map((row) => [shortName(row.claimed?.full_name ?? "") || "Секретарь", { id: row.claimed_by as string, name: row.claimed?.full_name ?? "" }]));
  return (
    <aside className="errands-card errands-stats flex min-w-0 flex-col gap-4" data-testid="desk-errands-stats">
      <div className="flex items-baseline justify-between">
        <h2 className="desk-label text-[13px] font-semibold leading-[18px]">За 30 дней</h2>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="errands-figure">
          <RollingNumber value={rows.length} className="errands-figure-value" />
          <span className="errands-figure-label">{pluralRu(rows.length, ["заявка", "заявки", "заявок"])}</span>
        </div>
        <div className="errands-figure" title="Попросил → готово, в среднем">
          <span className="errands-figure-value nums">{average === null ? "—" : humanMinutes(average)}</span>
          <span className="errands-figure-label">до «готово»</span>
        </div>
        <div className="errands-figure" data-tone={unclaimed > 0 ? "warn" : undefined} title="Просьбы, которые никто не взял">
          <RollingNumber value={unclaimed} className="errands-figure-value" />
          <span className="errands-figure-label">не взяли</span>
        </div>
      </div>
      <DaysChart rows={rows} now={now} />
      {rows.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[12px] font-medium leading-4 text-muted">Чаще всего</h3>
          <TopScenes rows={rows} catalogue={catalogue} />
        </section>
      ) : null}
      {tally.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Кто сколько взял">
          <h3 className="text-[12px] font-medium leading-4 text-muted">Кто брал</h3>
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
                        <span style={{ color: "var(--danger)" }}>отказ {person.declined}</span>
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
