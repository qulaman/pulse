"use client";

import { pluralRu } from "@/lib/tasks/status-text";
import type { TvSummary } from "@/lib/tv/queries";

/**
 * Заставка «команда»: кто чем занят прямо сейчас (D-76 §8). Плитки приходят из
 * `tv_summary().load` — уже с маской гостя, посчитанной в БД (D-33).
 *
 * Поле `overdue` в этих строках есть, и оно здесь не используется намеренно:
 * просрочка по именам на стену не выносится ни числом, ни цветом (D-45). Точка
 * слева говорит только «есть дела / дел нет» — без рода: имя его не даёт.
 */

/** Шесть в ряд, четыре ряда: на 24 плитках имя ещё читается с двух метров. */
const TILES = 24;
const MEDALS = ["1", "2", "3"] as const;

export function TvTeam({ summary, guest }: { summary: TvSummary; guest: boolean }) {
  const rows = [...summary.load]
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, "ru"))
    .slice(0, TILES);

  // очки показываем только когда они включены и в комнате не посетитель (D-33)
  const medals = new Map<string, string>();
  if (summary.points_enabled && !guest) {
    for (const row of summary.rating.slice(0, MEDALS.length)) {
      medals.set(row.name, MEDALS[row.rank - 1] ?? String(row.rank));
    }
  }

  if (rows.length === 0) {
    return <p className="text-[4vh] leading-[5.4vh] text-muted">Команда ещё не заведена</p>;
  }

  return (
    <div className="grid w-full max-w-[92vw] grid-cols-6 gap-x-[2vh] gap-y-[3.4vh]">
      {rows.map((row) => (
        <div key={row.name} className="flex min-w-0 items-start gap-[1.2vh]">
          <span
            aria-hidden
            className="mt-[1.4vh] h-[1.2vh] w-[1.2vh] shrink-0 rounded-full"
            style={{ background: row.active > 0 ? "var(--ok)" : "var(--text-muted)" }}
          />
          <div className="min-w-0">
            {/* имя переносится, а не режется: «Марат Оспа…» на стене читается как ошибка */}
            <p className="text-[3vh] leading-[4vh] [overflow-wrap:anywhere]">
              {row.name}
              {medals.has(row.name) ? (
                <span className="ml-[0.8vh] text-[2vh] font-semibold" style={{ color: "var(--gold)" }}>
                  {medals.get(row.name)}
                </span>
              ) : null}
            </p>
            <p className="truncate text-[2.2vh] leading-[3vh] text-muted">
              {row.active > 0
                ? `${row.active} ${pluralRu(row.active, ["дело", "дела", "дел"])}`
                : "дел нет"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
