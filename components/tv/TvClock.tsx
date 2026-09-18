"use client";

import { PulseMark } from "@/components/brand/PulseMark";
import { tvDate, tvTime } from "@/lib/tv/clock";
import type { TvEventRow } from "@/lib/tv/queries";

/**
 * Заставка «часы»: тихий экран для совещаний (D-76 §8). В комнате идёт разговор —
 * стена не должна тянуть взгляд лентой и лицом, но и чернеть ей нельзя: погашенный
 * телевизор читается как сломанный.
 *
 * Бегущая строка, подпись и пульс дня остаются — их рисует TvScreen поверх сцены.
 */
export function TvClock({
  company,
  logoUrl,
  now,
  next,
}: {
  company: string;
  logoUrl: string | null;
  now: Date;
  /** Ближайшее мероприятие компании; у гостя без названия (D-33). */
  next: TvEventRow | null;
}) {
  return (
    <div className="flex flex-col items-center gap-[2vh]">
      <p className="text-[22vh] font-bold leading-[24vh] tabular-nums">{tvTime(now)}</p>
      <p className="text-[4vh] leading-[5vh] text-muted first-letter:uppercase">{tvDate(now)}</p>
      {next ? (
        <p className="text-[3.2vh] leading-[4vh] text-muted">
          Ближайшее: {tvTime(new Date(next.starts_at))} · {next.title ?? "Мероприятие"}
        </p>
      ) : null}

      <div className="mt-[3vh] flex items-center gap-[2.4vh]">
        <PulseMark size="tv" />
        <span className="text-[3vh] leading-[3.8vh] text-muted">{company}</span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
          <img src={logoUrl} alt="" className="h-[8vh] w-auto object-contain" />
        ) : null}
      </div>
    </div>
  );
}
