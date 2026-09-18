"use client";

import { AnimatePresence, motion } from "framer-motion";

import { PulseMark } from "@/components/brand/PulseMark";
import { tvDate, tvTime } from "@/lib/tv/clock";
import { lineOf } from "@/lib/tv/feed";
import { useTvFeed, useTvFocus, useTvState, useTvSummary, type TvSummary } from "@/lib/tv/queries";
import { effectiveMode, guestOf, sceneOf } from "@/lib/tv/state";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

import { DayPulse } from "./DayPulse";
import { TvClock } from "./TvClock";
import { TvFocus } from "./TvFocus";
import { TvMascot } from "./TvMascot";
import { TvTeam } from "./TvTeam";
import { TvTicker } from "./TvTicker";
import { useClock, useHeartbeat, useNightReload, useOffline, useRemoteReload } from "./useKiosk";

/** Сцена «команда» до первой сводки: пустые плитки лучше пустого экрана. */
const EMPTY_TEAM: TvSummary = {
  guest: false,
  points_enabled: false,
  now: new Date(0).toISOString(),
  pulse: [] as number[],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 0, done: 0, in_work: 0 },
  rating: [],
  load: [],
  week: [],
  merch: [],
};

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5).
 * Композиция владельца (2026-09-17): бегущая строка сверху, сцена посреди экрана и
 * подпись внизу без единой рамки: марка, название компании и часы. Ниже подписи —
 * дальний слой: кривая настоящего дня компании по часам.
 *
 * Что показывать, решает строка `tv_state`, а не сам киоск (D-76): фокус на сотруднике
 * с телефона директора живёт 10 минут и гаснет по часам экрана, заставка эфира —
 * лицо, часы или команда — не истекает вовсе. Строка переживает и ночной перезапуск,
 * и деплой, поэтому команда с пульта не теряется, пока экран моргает.
 *
 * Размеры в `vh`: экран одинаково садится и на 1080p, и на 4K, и на телевизор 55".
 */
export function TvScreen({
  company,
  guest: initialGuest,
  logoUrl,
  role,
}: {
  company: string;
  guest: boolean;
  logoUrl: string | null;
  role: string;
}) {
  const now = useClock();
  const state = useTvState();

  const mode = effectiveMode(state.data ?? null, now);
  const guest = guestOf(state.data ?? null, initialGuest);
  const scene = sceneOf(state.data ?? null);

  const feed = useTvFeed();
  const summary = useTvSummary(guest);
  const focus = useTvFocus(mode === "employee");
  const offline = useOffline(summary.dataUpdatedAt);

  useNightReload();
  useHeartbeat(role, state.data?.version ?? null);
  useRemoteReload(state.data ?? null);

  const data = summary.data;
  const lines = (feed.data ?? []).map((event) => lineOf(event, guest));
  // лицо говорит о том же, что едет в строке, и пересчитывается с часами: новость
  // «стареет» сама, без отдельного таймера
  const speech = speechOf(lines, data?.today ?? { sent: 0, done: 0, in_work: 0 }, now);
  const items = tickerItems(lines, data);

  const focused = mode === "employee" && focus.data?.mode === "employee" ? focus.data : null;
  // ключ сцены: смена именно его проигрывает переход, всё остальное меняется на месте
  const sceneKey = focused ? `focus:${focused.employee.id}` : scene;

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
        <AnimatePresence mode="wait">
          <motion.div
            key={sceneKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
            // transform + opacity и ничего больше — перф-контракт стены (D-45)
            className="flex w-full items-center justify-center px-[4vh] motion-reduce:transform-none"
          >
            {focused ? (
              <TvFocus focus={focused} state={state.data ?? null} now={now} />
            ) : scene === "clock" ? (
              <TvClock company={company} logoUrl={logoUrl} now={now} />
            ) : scene === "team" ? (
              <TvTeam summary={data ?? EMPTY_TEAM} guest={guest} />
            ) : (
              <TvMascot speech={speech} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-10 flex shrink-0 items-center justify-between gap-[3vh] px-[4vh] pb-[3.4vh]">
        <div className="flex items-baseline gap-[2vh]">
          <PulseMark size="tv" />
          <span className="text-[3vh] leading-[3.8vh] text-muted">{company}</span>
          {guest ? (
            <span className="text-[2.2vh] leading-[2.8vh] text-muted">· режим посетителя</span>
          ) : null}
          {focused ? (
            <span className="text-[2.2vh] leading-[2.8vh] text-muted">· на экране: {focused.employee.name}</span>
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
