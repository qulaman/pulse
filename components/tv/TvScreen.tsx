"use client";

import { PulseMark } from "@/components/brand/PulseMark";
import { tvDate, tvTime } from "@/lib/tv/clock";
import { lineOf } from "@/lib/tv/feed";
import { useTvFeed, useTvSummary } from "@/lib/tv/queries";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

import { DayPulse } from "./DayPulse";
import { TvMascot } from "./TvMascot";
import { TvTicker } from "./TvTicker";
import { useClock, useNightReload, useOffline } from "./useKiosk";

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5).
 * Композиция владельца (2026-09-17): бегущая строка сверху, лицо посреди экрана — как в
 * приложении, — и подпись внизу без единой рамки: марка, название компании и часы.
 * Ниже подписи — дальний слой: кривая настоящего дня компании по часам.
 *
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
  const lines = (feed.data ?? []).map((event) => lineOf(event, guest));
  // лицо говорит о том же, что едет в строке, и пересчитывается с часами: новость
  // «стареет» сама, без отдельного таймера
  const speech = speechOf(lines, data?.today ?? { sent: 0, done: 0, in_work: 0 }, now);
  const items = tickerItems(lines, data);

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      {/* дальний слой: ритм дня компании по часам, у самого низа экрана */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh]">
        <DayPulse pulse={data?.pulse ?? []} hour={Number(tvTime(now).slice(0, 2))} />
      </div>

      <header className="shrink-0 pt-[2.4vh]">
        <TvTicker items={items} />
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center">
        <TvMascot speech={speech} />
      </main>

      <footer className="relative z-10 flex shrink-0 items-center justify-between gap-[3vh] px-[4vh] pb-[3.4vh]">
        <div className="flex items-baseline gap-[2vh]">
          <PulseMark size="tv" />
          <span className="text-[3vh] leading-[3.8vh] text-muted">{company}</span>
          {guest ? (
            <span className="text-[2.2vh] leading-[2.8vh] text-muted">· режим посетителя</span>
          ) : null}
        </div>

        <div className="flex items-baseline gap-[2.4vh]">
          {offline ? <span className="text-[2.2vh] leading-[2.8vh]" style={{ color: "var(--warn)" }}>нет связи</span> : null}
          <span className="text-[2.6vh] leading-[3.4vh] text-muted first-letter:uppercase">{tvDate(now)}</span>
          <span className="text-[7vh] font-bold leading-[7.4vh] tabular-nums">{tvTime(now)}</span>
        </div>
      </footer>
    </div>
  );
}
