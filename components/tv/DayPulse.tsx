"use client";

import { useId } from "react";

import s from "./tv.module.css";

/**
 * Дальний слой всего экрана: пульс дня. Кривая построена по настоящим событиям компании
 * по часам (`tv_summary.pulse`) — к обеду растёт, к вечеру оседает. Это не орнамент:
 * стена показывает ритм дня, и по нему видно, живая компания сегодня или спит.
 *
 * Где день сейчас — точка на самой кривой, она тихо дышит прозрачностью (D-182): прежняя линия
 * «сейчас» на всю высоту полосы перечёркивала сцены — пьедестал, пункт доски. Прожитые часы залиты,
 * будущие — одной линией без заливки.
 *
 * Рисуется руками (Recharts на киоск не тащим); кроме точки, ни одного анимированного свойства.
 */

const HOURS = 24;
/** Рисуем рабочий день: ночные нули растянули бы кривую в иглу посреди суток. */
const FROM_HOUR = 6;
const TO_HOUR = 22;
/** Пик занимает нижнюю треть полосы: это земля под людьми, а не график поверх них. */
const PEAK = 42;

type Point = { x: number; y: number };
type Segment = { p1: Point; c1: Point; c2: Point; p2: Point };

/** Плавная кривая по точкам: Катмулл-Ром, переведённый в кубические Безье. */
function segmentsOf(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    out.push({
      p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    });
  }
  return out;
}

function pathOf(segments: Segment[]): string {
  if (segments.length === 0) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(segments[0]!.p1.x)} ${f(segments[0]!.p1.y)}`;
  for (const { c1, c2, p2 } of segments) d += ` C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(p2.x)} ${f(p2.y)}`;
  return d;
}

/** A point of a cubic Bézier at t. */
function bezier({ p1, c1, c2, p2 }: Segment, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p1.x + b * c1.x + c * c2.x + d * p2.x, y: a * p1.y + b * c1.y + c * c2.y + d * p2.y };
}

/**
 * `hour` — the wall's hour with its minutes as a fraction (14.5 — half past two). Outside the drawn
 * day the dot is not drawn, and every hour is lived (a morning before six) or still to come.
 */
export function DayPulse({ pulse, hour }: { pulse: number[]; hour: number }) {
  const clipId = useId();
  if (pulse.length !== HOURS || pulse.every((value) => value === 0)) return null;

  const day = pulse.slice(FROM_HOUR, TO_HOUR + 1);
  const max = Math.max(...day, 1);
  const points = day.map((value, index) => ({
    x: (index / (day.length - 1)) * 100,
    y: 100 - (value / max) * PEAK,
  }));

  const segments = segmentsOf(points);
  const line = pathOf(segments);
  const area = `${line} L 100 100 L 0 100 Z`;
  const inDay = hour >= FROM_HOUR && hour <= TO_HOUR;
  const nowX = (Math.min(TO_HOUR, Math.max(FROM_HOUR, hour)) - FROM_HOUR) / (TO_HOUR - FROM_HOUR) * 100;
  // the dot on the curve itself: the hour's segment at its minutes
  const index = Math.min(segments.length - 1, Math.max(0, Math.floor(hour - FROM_HOUR)));
  const dot = inDay ? bezier(segments[index]!, Math.min(1, Math.max(0, hour - FROM_HOUR - index))) : null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* only the hours lived are filled: the rest of the day is a promise, a line */}
          <clipPath id={`${clipId}-lived`}>
            <rect x="0" y="0" width={hour < FROM_HOUR ? 0 : nowX} height="100" />
          </clipPath>
        </defs>
        <path d={area} fill={`url(#${clipId}-fill)`} clipPath={`url(#${clipId}-lived)`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.32"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {dot ? (
        // a round dot cannot live in the stretched SVG (it would be an ellipse): it stands over it in %
        <span
          className="absolute h-[1.4vh] w-[1.4vh] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          data-testid="tv-day-now"
        >
          <span className={`block h-full w-full rounded-full ${s.breathe}`} style={{ background: "var(--accent)" }} />
        </span>
      ) : null}
    </div>
  );
}
