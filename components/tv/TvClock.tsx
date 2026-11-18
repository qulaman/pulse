"use client";

import { tvDate, tvTime } from "@/lib/tv/clock";
import type { TvEventRow } from "@/lib/tv/queries";
import type { ClockStyle } from "@/lib/tv/state";

import { TvAnalogClock } from "./TvAnalogClock";

/**
 * Заставка «часы»: тихий экран для совещаний (D-76 §8). В комнате идёт разговор —
 * стена не должна тянуть взгляд лентой и лицом, но и чернеть ей нельзя: погашенный
 * телевизор читается как сломанный.
 *
 * Цифры или стрелки — как выбрано на пульте (D-96). Стрелкам нужна ширина, поэтому
 * циферблат стоит слева, а дата и ближайшее мероприятие — справа от него.
 *
 * Бегущая строка на часах замирает и гаснет, подпись внизу не повторяет ни время, ни дату —
 * марка и название компании стоят в ней (TvFrame, D-182). Цифры не чисто белые: белый
 * на месте часами подряд — первое, что выгорает.
 */

/** Digits that stand still for hours: a step below pure white (D-182). */
export const CLOCK_INK = "color-mix(in srgb, var(--text) 85%, var(--bg))";

export function TvClock({
  now,
  next,
  clock,
}: {
  /** Kept for callers of the scene before D-182: the brand lives in the footer now. */
  company?: string;
  logoUrl?: string | null;
  now: Date;
  /** Ближайшее мероприятие компании; у гостя без названия (D-33). */
  next: TvEventRow | null;
  clock: ClockStyle;
}) {
  const nextLine = next ? `Ближайшее: ${tvTime(new Date(next.starts_at))} · ${next.title ?? "Мероприятие"}` : null;

  if (clock === "analog") {
    const [weekday, date] = splitDate(tvDate(now));
    return (
      <div className="flex items-center gap-[8vh]" data-testid="tv-clock" data-clock="analog">
        <TvAnalogClock now={now} size="58vh" />
        <div className="flex min-w-0 max-w-[46vw] flex-col gap-[1.6vh]">
          <p className="tv-title font-bold tracking-[-0.02em] first-letter:uppercase" style={{ color: CLOCK_INK }}>
            {weekday}
          </p>
          {date ? <p className="tv-lead text-muted">{date}</p> : null}
          {nextLine ? <p className="tv-text mt-[2vh] text-muted">{nextLine}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-[2vh]" data-testid="tv-clock" data-clock="digital">
      <p className="tv-giant font-bold tabular-nums" style={{ color: CLOCK_INK }}>
        {tvTime(now)}
      </p>
      <p className="tv-lead text-muted first-letter:uppercase">{tvDate(now)}</p>
      {nextLine ? <p className="tv-text text-muted">{nextLine}</p> : null}
    </div>
  );
}

/** «пятница, 25 сентября» → «пятница» и «25 сентября». */
function splitDate(text: string): [string, string | null] {
  const comma = text.indexOf(",");
  if (comma < 0) return [text, null];
  return [text.slice(0, comma), text.slice(comma + 1).trim()];
}
