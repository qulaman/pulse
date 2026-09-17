"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { teamField, type TvTeamRow } from "@/lib/tv/team";

import { DayPulse } from "./DayPulse";

/**
 * Полоса команды под лентой: у кого есть работа — кружок живёт и пульсирует в цвете
 * бренда, у кого нет — спокойно дрейфует серым. Тот же жест, что на экране ожидания у
 * директора, только смотреть на него можно всей комнатой (D-69, D-71).
 *
 * Красного здесь нет: перегруз и просрочка по именам на стену не выносятся (D-45).
 * Анимация — только transform и opacity, десять узлов, экран стоит сутками.
 */
export function TvTeam({ rows, pulse, hour }: { rows: TvTeamRow[]; pulse: number[]; hour: number }) {
  const reduced = useReducedMotion();
  const digest = rows.map((row) => `${row.name}:${row.active}`).join("|");
  // раскладка пересчитывается, когда меняется команда или её день, а не каждый кадр
  const orbs = useMemo(() => teamField(rows), [digest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orbs.length === 0) return null;

  return (
    <section className="relative h-[23vh] shrink-0 overflow-hidden rounded-[1.8vh] border border-border bg-surface">
      {/* земля под людьми — настоящий ритм дня компании по часам */}
      <DayPulse pulse={pulse} hour={hour} />

      <p className="absolute left-[2.4vh] top-[1.6vh] text-[1.8vh] uppercase leading-[2.2vh] tracking-[0.18em] text-muted">
        Команда
      </p>

      {orbs.map((orb) => (
        <motion.div
          key={orb.key}
          className="absolute flex flex-col items-center"
          style={{ left: `${orb.x}%`, top: `${orb.y}%`, translate: "-50% -50%" }}
          animate={reduced ? undefined : { x: [0, orb.dx, 0, -orb.dx, 0], y: [0, orb.dy, 0, -orb.dy, 0] }}
          transition={{ duration: orb.driftMs / 1000, ease: "easeInOut", repeat: Infinity, delay: orb.delayMs / 1000 }}
        >
          <motion.span
            className="flex items-center justify-center rounded-full font-semibold"
            style={{
              width: `${orb.size}vh`,
              height: `${orb.size}vh`,
              fontSize: `${orb.size * 0.34}vh`,
              color: orb.busy ? "var(--bg)" : "var(--text-muted)",
              background: orb.busy ? "var(--accent)" : "var(--surface-2)",
              border: orb.busy ? "none" : "1px solid var(--border)",
            }}
            // занятый дышит: чем больше несёт, тем чаще; свободный просто стоит
            animate={reduced || !orb.busy ? undefined : { scale: [1, 1.07, 1] }}
            transition={{ duration: orb.beatMs / 1000, ease: "easeInOut", repeat: Infinity, delay: orb.delayMs / 1000 }}
          >
            {orb.initials}
          </motion.span>
          <span className="mt-[0.6vh] whitespace-nowrap text-[1.7vh] leading-[2vh] text-muted">
            {orb.label}
            {orb.busy ? <span className="text-text"> · {orb.active}</span> : null}
          </span>
        </motion.div>
      ))}
    </section>
  );
}
