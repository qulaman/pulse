"use client";

/**
 * Дальний слой всего экрана: пульс дня. Кривая построена по настоящим событиям компании
 * по часам (`tv_summary.pulse`) — к обеду растёт, к вечеру оседает. Это не орнамент:
 * стена показывает ритм дня, и по нему видно, живая компания сегодня или спит.
 *
 * Рисуется руками (Recharts на киоск не тащим), статично — ни одного анимированного
 * свойства: движение на экране и так есть, а фон должен держать сутки без работы.
 */

const HOURS = 24;
/** Рисуем рабочий день: ночные нули растянули бы кривую в иглу посреди суток. */
const FROM_HOUR = 6;
const TO_HOUR = 22;
/** Пик занимает нижнюю треть полосы: это земля под людьми, а не график поверх них. */
const PEAK = 42;

/** Плавная кривая по точкам: Катмулл-Ром, переведённый в кубические Безье. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function DayPulse({ pulse, hour }: { pulse: number[]; hour: number }) {
  if (pulse.length !== HOURS || pulse.every((value) => value === 0)) return null;

  const day = pulse.slice(FROM_HOUR, TO_HOUR + 1);
  const max = Math.max(...day, 1);
  const points = day.map((value, index) => ({
    x: (index / (day.length - 1)) * 100,
    y: 100 - (value / max) * PEAK,
  }));

  const line = smoothPath(points);
  const area = `${line} L 100 100 L 0 100 Z`;
  const nowX = ((Math.min(TO_HOUR, Math.max(FROM_HOUR, hour)) - FROM_HOUR) / (TO_HOUR - FROM_HOUR)) * 100;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="tv-day-pulse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tv-day-pulse)" />
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
        {/* где день находится прямо сейчас */}
        <line
          x1={nowX}
          y1="0"
          x2={nowX}
          y2="100"
          stroke="var(--accent)"
          strokeOpacity="0.14"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
