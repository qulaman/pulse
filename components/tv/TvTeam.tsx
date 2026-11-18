"use client";

import { motion, MotionConfig } from "motion/react";
import type { CSSProperties } from "react";

import { pluralRu } from "@/lib/tasks/status-text";
import type { TvSummary } from "@/lib/tv/queries";
import { teamView, type TeamMember } from "@/lib/tv/team";

/**
 * Заставка «Команда» (D-76 §8; v5 — D-182): «Команда сейчас» — люди кружками, как на Пульсе
 * телефона и на «Сегодня» компьютера (D-168): стеклянный круг с инициалами и кольцом. Порядок —
 * по имени и не меняется; имя и инициал фамилии крупно. У того, кто сегодня сдал, — зелёное
 * кольцо и «✓ N сдано сегодня»; у остальных — ничего: ни «дел нет», ни серой точки, ни
 * просрочки (D-45). Медаль первой тройки — значком на кольце, только при очках и не гостю (D-33).
 * Сетка ужимается под число людей, а не обрезает их. Правила — `lib/tv/team.ts`.
 */

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (components/rating/Podium.tsx). */
const MEDAL = ["var(--gold)", "#B8C2CC", "#C98A5B"] as const;

const EASE = [0.2, 0, 0, 1] as const;

export function TvTeam({ summary, guest }: { summary: TvSummary; guest: boolean }) {
  const view = teamView(summary.load, summary.rating, { points: summary.points_enabled, guest });
  const { members, density } = view;

  if (members.length === 0) {
    return <p className="tv-lead text-muted">Команда ещё не заведена</p>;
  }

  return (
    // «reduce motion»: the circles stand in place at once
    <MotionConfig reducedMotion="user">
      <section className="flex w-full max-w-[94vw] flex-col items-center gap-[3vh]" data-testid="tv-team">
        <header className="flex w-full items-baseline justify-between gap-[4vh] px-[1vh]">
          <h2 className={`${density.heading} font-bold tracking-[-0.03em]`}>Команда сейчас</h2>
          {view.doneToday > 0 ? (
            <p className="tv-text nums flex shrink-0 items-center gap-[1vh] font-semibold tabular-nums" style={{ color: "var(--ok)" }}>
              <Check /> {view.doneToday} {pluralRu(view.doneToday, ["дело сдано", "дела сдано", "дел сдано"])} сегодня
            </p>
          ) : null}
        </header>
        <ul
          className="grid w-full justify-center gap-x-[2vh]"
          style={{
            gridTemplateColumns: `repeat(${density.cols}, minmax(0, ${density.cols <= 4 ? "34vh" : "1fr"}))`,
            rowGap: density.circle >= 11 ? "4vh" : density.cols >= 8 ? "1.6vh" : "2.4vh",
          }}
        >
          {members.map((member, index) => (
            <motion.li
              key={member.key}
              initial={{ opacity: 0, y: "1.4vh" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: Math.min(0.6, index * 0.025), ease: EASE }}
              className="flex min-w-0 flex-col items-center gap-[1.2vh] text-center"
            >
              <Circle member={member} size={density.circle} badge={density.badge} />
              {/* a name breaks at its space, never inside a word («Бауырж / ан» read as two people) */}
              <p className={`${density.name} line-clamp-2 max-w-full font-semibold`}>{member.name}</p>
              {/* the row keeps its height without a count: names stay on one line across the grid */}
              {density.badge ? null : (
                <p
                  className="tv-caption nums -mt-[0.6vh] flex items-center gap-[0.6vh] font-semibold tabular-nums"
                  style={{ color: "var(--ok)", visibility: member.done ? "visible" : "hidden" }}
                >
                  <Check /> {member.done ?? 0} сдано сегодня
                </p>
              )}
            </motion.li>
          ))}
        </ul>
      </section>
    </MotionConfig>
  );
}

/**
 * The phone's circle, standing still (D-168, CrewCircle): tinted glass with the initials, a thin
 * ring; whoever handed something in today wears the closed green ring of «сдано». The diameter
 * gives way as the remote's «Крупность» grows the type, so a full grid still fits at «далеко».
 */
function Circle({ member, size, badge }: { member: TeamMember; size: number; badge: boolean }) {
  const tone = member.done ? "var(--ok)" : "var(--accent)";
  const diameter = `calc(${size}vh * (2.3 - var(--tv-k, 1)) / 1.3)`;
  const core: CSSProperties = {
    background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${tone} 34%, var(--surface-2)), color-mix(in srgb, ${tone} 10%, var(--surface)) 74%)`,
    color: `color-mix(in srgb, ${tone} 70%, white)`,
    boxShadow: member.done
      ? `inset 0 0 0 calc(${diameter} * 0.045) var(--ok)`
      : `inset 0 0 0 calc(${diameter} * 0.02) color-mix(in srgb, var(--accent) 45%, transparent)`,
    fontSize: `calc(${diameter} * 0.36)`,
  };
  return (
    <span className="relative block shrink-0" style={{ width: diameter, height: diameter }}>
      <span className="font-display absolute inset-0 flex items-center justify-center rounded-full font-bold leading-none" style={core}>
        {/* a crowded grid: whoever handed in today shows «✓ 3» in the circle — the phone's tick instead of initials */}
        {badge && member.done ? (
          <span className="tv-caption nums flex items-center gap-[0.2vh] font-bold tabular-nums">
            <Check />
            {member.done}
          </span>
        ) : (
          member.initials
        )}
      </span>
      {member.medal ? <Medal place={member.medal} diameter={diameter} /> : null}
    </span>
  );
}

/** The place among the first three, on the ring at one o'clock: a medal disc with its number. */
function Medal({ place, diameter }: { place: 1 | 2 | 3; diameter: string }) {
  const d = `max(3vh, calc(${diameter} * 0.34))`;
  return (
    <span
      aria-label={`${place} место`}
      className="nums absolute flex items-center justify-center rounded-full font-bold leading-none tabular-nums"
      style={{
        width: d,
        height: d,
        right: `calc(${diameter} * 0.02 - ${d} * 0.25)`,
        top: `calc(${diameter} * 0.02 - ${d} * 0.25)`,
        fontSize: `calc(${d} * 0.6)`,
        background: MEDAL[place - 1],
        color: "var(--bg)",
        boxShadow: "0 0 0 0.4vh var(--bg)",
      }}
    >
      {place}
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[0.9em] w-[0.9em] shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
