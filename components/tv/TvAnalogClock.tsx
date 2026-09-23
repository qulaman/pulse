"use client";

import { useReducedMotion } from "framer-motion";
import { useState, useSyncExternalStore } from "react";

import { aqtobeClock, handAngles } from "@/lib/tv/clock";

import s from "./tv.module.css";

/**
 * Часы со стрелками (D-96) — заставка «Часы» и подпись внизу стены, когда на пульте
 * выбраны стрелки. Время — Актобе, как у цифр.
 *
 * Стрелки крутит CSS: у каждой один оборот за свой цикл, фаза — отрицательной задержкой
 * от текущего времени. Ни одного ререндера в секунду, только compositor (перф-контракт
 * D-45). Раз в десять минут фаза пересчитывается заново (`key`), чтобы часы не уплывали за
 * месяцы без перезагрузки. При «уменьшить движение» стрелки рисует React по тику часов
 * киоска, а секундной нет.
 */

const HOUR_TICKS = Array.from({ length: 12 }, (_, i) => i);
const MINUTE_TICKS = Array.from({ length: 60 }, (_, i) => i).filter((i) => i % 5 !== 0);
const RESYNC_MS = 10 * 60_000;

const noop = () => () => undefined;
/** true only in the browser after hydration: the phase of the hands is the browser clock's. */
function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function TvAnalogClock({
  now,
  size,
  seconds = true,
  detailed = true,
  className = "",
}: {
  now: Date;
  /** CSS size of the square, e.g. "56vh". */
  size: string;
  seconds?: boolean;
  /** Minute ticks and the numerals: on the big face only — the small one in the footer stays calm. */
  detailed?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  // the server and the browser would draw the hands a few hundred milliseconds apart and
  // hydration would trip over it: the hands appear after mount, the dial is there at once
  const mounted = useMounted();
  const { h, m } = aqtobeClock(now);
  const phase = Math.floor(now.getTime() / RESYNC_MS);

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}
    >
      {/* the dial: no fill of its own, the wall shows through — the screen keeps its air */}
      <circle cx="100" cy="100" r="97" fill="color-mix(in srgb, var(--surface) 55%, transparent)" stroke="var(--border)" strokeWidth="2" />

      {detailed
        ? MINUTE_TICKS.map((i) => (
            <line
              key={`m${i}`}
              x1="100"
              y1="8"
              x2="100"
              y2="13"
              stroke="var(--text-muted)"
              strokeOpacity="0.55"
              strokeWidth="1.2"
              strokeLinecap="round"
              transform={`rotate(${i * 6} 100 100)`}
            />
          ))
        : null}
      {HOUR_TICKS.map((i) => (
        <line
          key={`h${i}`}
          x1="100"
          y1={detailed ? 8 : 10}
          x2="100"
          y2={i % 3 === 0 ? (detailed ? 24 : 26) : detailed ? 19 : 20}
          stroke={i === 0 ? "var(--accent)" : "var(--text)"}
          strokeWidth={i % 3 === 0 ? 4.5 : 3}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 100 100)`}
        />
      ))}
      {detailed
        ? ([3, 6, 9] as const).map((n) => {
            const rad = ((n * 30 - 90) * Math.PI) / 180;
            return (
              <text
                key={n}
                x={100 + Math.cos(rad) * 66}
                y={100 + Math.sin(rad) * 66}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text-muted)"
                fontSize="15"
                fontWeight="600"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {n}
              </text>
            );
          })
        : null}

      {!mounted ? null : reduced ? (
        <StillHands now={now} />
      ) : (
        // remounted every ten minutes: the phase is taken afresh, the hands never drift
        <MovingHands key={phase} seconds={seconds} />
      )}
      <circle cx="100" cy="100" r="6" fill={seconds && !reduced ? "var(--accent)" : "var(--text)"} />
      <circle cx="100" cy="100" r="2.4" fill="var(--bg)" />
    </svg>
  );
}

const HOUR_HAND = <line x1="100" y1="112" x2="100" y2="52" stroke="var(--text)" strokeWidth="8" strokeLinecap="round" />;
const MINUTE_HAND = <line x1="100" y1="114" x2="100" y2="24" stroke="var(--text)" strokeWidth="5" strokeLinecap="round" />;

/**
 * Стрелки, которые крутит CSS. Фаза снимается один раз при монтировании: задержку
 * работающей анимации менять нельзя — браузер отсчитывает её от старта, и стрелка прыгнула
 * бы на уже прошедшие секунды ещё раз.
 */
function MovingHands({ seconds }: { seconds: boolean }) {
  const [delay] = useState(() => {
    const { h, m, s: sec, ms } = aqtobeClock(new Date());
    const into = sec + ms / 1000;
    return { hour: -((h % 12) * 3600 + m * 60 + into), minute: -(m * 60 + into), second: -into };
  });
  const turn = (duration: number, start: number) => ({ animationDuration: `${duration}s`, animationDelay: `${start}s` });
  return (
    <>
      <g className={s.hand} style={turn(43_200, delay.hour)}>{HOUR_HAND}</g>
      <g className={s.hand} style={turn(3_600, delay.minute)}>{MINUTE_HAND}</g>
      {seconds ? (
        <g className={s.hand} style={turn(60, delay.second)}>
          <line x1="100" y1="124" x2="100" y2="18" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="100" cy="124" r="4" fill="var(--accent)" />
        </g>
      ) : null}
    </>
  );
}

/** «Уменьшить движение»: стрелки стоят и переставляются тиком часов киоска, без секундной. */
function StillHands({ now }: { now: Date }) {
  const angles = handAngles(now);
  const at = (angle: number) => ({ transform: `rotate(${angle}deg)`, transformBox: "view-box" as const, transformOrigin: "100px 100px" });
  return (
    <>
      <g style={at(angles.hour)}>{HOUR_HAND}</g>
      <g style={at(angles.minute)}>{MINUTE_HAND}</g>
    </>
  );
}
