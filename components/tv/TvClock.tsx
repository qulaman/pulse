"use client";

import { PulseMark } from "@/components/brand/PulseMark";
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
 * циферблат стоит слева, а дата, ближайшее мероприятие и марка — справа от него.
 *
 * Бегущая строка, подпись и пульс дня остаются — их рисует TvScreen поверх сцены.
 */
export function TvClock({
  company,
  logoUrl,
  now,
  next,
  clock,
}: {
  company: string;
  logoUrl: string | null;
  now: Date;
  /** Ближайшее мероприятие компании; у гостя без названия (D-33). */
  next: TvEventRow | null;
  clock: ClockStyle;
}) {
  const nextLine = next ? `Ближайшее: ${tvTime(new Date(next.starts_at))} · ${next.title ?? "Мероприятие"}` : null;
  const brand = (
    <div className="flex items-center gap-[2.4vh]">
      <PulseMark size="tv" />
      <span className="text-[3vh] leading-[3.8vh] text-muted">{company}</span>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
        <img src={logoUrl} alt="" className="h-[8vh] w-auto object-contain" />
      ) : null}
    </div>
  );

  if (clock === "analog") {
    const [weekday, date] = splitDate(tvDate(now));
    return (
      <div className="flex items-center gap-[8vh]" data-testid="tv-clock" data-clock="analog">
        <TvAnalogClock now={now} size="58vh" />
        <div className="flex min-w-0 max-w-[46vw] flex-col gap-[1.6vh]">
          <p className="text-[8vh] font-bold leading-[9vh] tracking-[-0.02em] first-letter:uppercase">{weekday}</p>
          {date ? <p className="text-[4.4vh] leading-[5.4vh] text-muted">{date}</p> : null}
          {nextLine ? <p className="mt-[2vh] text-[3.2vh] leading-[4.2vh] text-muted">{nextLine}</p> : null}
          <div className="mt-[4vh]">{brand}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-[2vh]" data-testid="tv-clock" data-clock="digital">
      <p className="text-[22vh] font-bold leading-[24vh] tabular-nums">{tvTime(now)}</p>
      <p className="text-[4vh] leading-[5vh] text-muted first-letter:uppercase">{tvDate(now)}</p>
      {nextLine ? <p className="text-[3.2vh] leading-[4vh] text-muted">{nextLine}</p> : null}
      <div className="mt-[3vh]">{brand}</div>
    </div>
  );
}

/** «пятница, 25 сентября» → «пятница» и «25 сентября». */
function splitDate(text: string): [string, string | null] {
  const comma = text.indexOf(",");
  if (comma < 0) return [text, null];
  return [text.slice(0, comma), text.slice(comma + 1).trim()];
}
