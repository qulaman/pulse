"use client";

import { PulseMark } from "@/components/brand/PulseMark";
import { tvDate, tvTime } from "@/lib/tv/clock";
import { lineOf } from "@/lib/tv/feed";
import { useTvFeed, useTvSummary } from "@/lib/tv/queries";
import { speechOf } from "@/lib/tv/voice";

import { PulseLine } from "./PulseLine";
import { TvCarousel } from "./TvCarousel";
import { TvFeed } from "./TvFeed";
import { TvTeam } from "./TvTeam";
import { TvVerdict } from "./TvVerdict";
import { useClock, useNightReload, useOffline } from "./useKiosk";

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5).
 * Ни навигации, ни кнопок — киоск нечем «нажать», и нажимать на нём некому.
 * Размеры в `vh`: экран одинаково садится и на 1080p, и на 4K, и на телевизор 55".
 *
 * Пульт директора (канал `tv_control`, режимы фокуса, кнопка «Посетитель») в этой
 * версии не строится — гостевой режим включается стартовым `?guest=1` (D-33).
 */
export function TvScreen({ company, guest }: { company: string; guest: boolean }) {
  const feed = useTvFeed();
  const summary = useTvSummary(guest);
  const now = useClock();
  const offline = useOffline(summary.dataUpdatedAt);

  useNightReload();

  const data = summary.data;
  const events = feed.data ?? [];
  const today = data?.today ?? { sent: 0, done: 0, in_work: 0 };
  // лицо говорит о том же, что показывает лента, и пересчитывается с часами: новость
  // «стареет» сама, без отдельного таймера
  const speech = speechOf(
    events.map((event) => lineOf(event, guest)),
    today,
    now,
  );

  return (
    <div className="relative grid h-dvh w-full grid-cols-[3fr_2fr] gap-[1.8vh] overflow-hidden p-[2vh]">


      {/* левые 60%: шапка и живая лента */}
      <div className="flex min-h-0 flex-col gap-[1.6vh]">
        <header className="flex items-center justify-between gap-[2.4vh]">
          <div className="flex shrink-0 items-baseline gap-[1.6vh]">
            <PulseMark size="tv" />
            <span className="text-[2.4vh] leading-[3vh] text-muted">{company}</span>
            {guest ? (
              <span className="rounded-full bg-surface-2 px-[1.2vh] py-[0.4vh] text-[1.8vh] leading-[2.2vh] text-muted">
                режим посетителя
              </span>
            ) : null}
          </div>

          {/* пульс продукта в пустой середине шапки: единственное, что движется само по себе */}
          <PulseLine className="h-[4.6vh] min-w-0 flex-1" />

          <div className="flex shrink-0 items-baseline gap-[1.6vh]">
            {offline ? (
              <span
                className="rounded-full px-[1.2vh] py-[0.4vh] text-[1.8vh] leading-[2.2vh]"
                style={{ color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}
              >
                нет связи
              </span>
            ) : null}
            <span className="text-[2vh] leading-[2.6vh] text-muted first-letter:uppercase">{tvDate(now)}</span>
            <span className="text-[5vh] font-bold leading-[5.4vh] tabular-nums">{tvTime(now)}</span>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <TvFeed events={events} guest={guest} />
        </div>

        {/* кто сейчас несёт работу, а кому можно дать */}
        <TvTeam rows={data?.load ?? []} pulse={data?.pulse ?? []} hour={Number(tvTime(now).slice(0, 2))} />
      </div>

      {/* правые 40%: вердикт с числами дня и карусель */}
      <div className="grid min-h-0 grid-rows-[auto_1fr] gap-[1.8vh]">
        <TvVerdict
          counts={data?.counts ?? { overdue: 0, declined: 0, review: 0, questions: 0 }}
          today={today}
          speech={speech}
        />
        {data ? <TvCarousel summary={data} /> : <section className="rounded-[1.8vh] border border-border bg-surface" />}
      </div>
    </div>
  );
}
