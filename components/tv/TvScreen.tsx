"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MONTH_DAYS, monthGridFrom } from "@/lib/tv/calendar";
import { lineOf } from "@/lib/tv/feed";
import { kioskAlive, kioskApplied, kioskBusy } from "@/lib/tv/kiosk-signal";
import { overlayOf } from "@/lib/tv/overlay";
import { programNext, programRound, programWindowOf, type WallScene } from "@/lib/tv/program";
import { useTvBoard, useTvCalendar, useTvFeed, useTvFocus, useTvOverlay, useTvRating, useTvState, useTvSummary } from "@/lib/tv/queries";
import {
  awakeUntil,
  clockStyleOf,
  effectiveMode,
  focusRemainingMs,
  guestOf,
  isNight,
  programOn,
  ratingViewOf,
  wallCalendarView,
  wallSceneOf,
  weekInRound,
} from "@/lib/tv/state";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

import { TvFrame } from "./TvFrame";
import { useClock, useOffline } from "./useKiosk";

/** The program's next scene is drawn ahead this long before its turn (D-182). */
const PREPARE_MS = 15_000;

/**
 * Киоск: данные стены. Раскладку рисует `TvFrame` — чистый вид на пропсах, его же на фикстурах
 * показывает песочница `/dev/tv`. Жизнь киоска без присмотра — перезагрузка в 04:00, перезапуск с
 * пульта, квитанция, Wake Lock, сторож — держит `KioskLife` в layout (D-182); стена говорит ему
 * сигналами `lib/tv/kiosk-signal.ts`: жива (тик часов), какую версию строки показала, занята ли.
 *
 * Что показывать, решает строка `tv_state` (D-76) и программа дня (D-182, `lib/tv/program.ts`):
 * фокус на человеке или деле живёт 10 минут; доска — до своего срока; заставка, поставленная
 * руками, — до конца отрезка дня; дальше стена сама идёт по программе. Окно ночи и вечера —
 * из сводки (`tv_summary.program`). Следующую сцену программы стена готовит за 15 секунд до
 * границы, и граница приходит точно в свой момент, а не со следующим тиком часов.
 */
export function TvScreen({
  company,
  companyId,
  guest: initialGuest,
  logoUrl,
  role,
}: {
  company: string;
  companyId?: string;
  guest: boolean;
  logoUrl: string | null;
  role: string;
}) {
  const [boundary, setBoundary] = useState(0);
  const clock = useClock();
  const nowMs = Math.max(boundary, clock.getTime());
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const state = useTvState(companyId);
  const row = state.data ?? null;

  const mode = effectiveMode(row, now);
  const guest = guestOf(row, initialGuest, now);

  const feed = useTvFeed(companyId);
  const summary = useTvSummary(guest);
  const data = summary.data;
  const w = programWindowOf(data);
  // the rating needs points (D-48); before the summary comes, the base decides (D-123)
  const points = data?.points_enabled ?? true;
  const opts = { points, guest, announcement: Boolean(data?.announcement) && !guest, weekBoard: weekInRound(row, now, guest, w) };
  const scene = wallSceneOf(row, now, opts, w);
  const program = programOn(row, now, w) && scene !== "welcome";
  const upcoming = program ? programNext(now, w, opts) : null;
  const next: WallScene | null = upcoming && upcoming.at.getTime() - now.getTime() <= PREPARE_MS ? upcoming.scene : null;
  // the program's round and its next scene prefetch their data, so a turn never lands on an empty screen (D-123)
  const round: WallScene[] = program ? [...programRound(now, w, opts), ...(next ? [next] : [])] : [];
  const needs = (s: WallScene) => scene === s || round.includes(s);

  const focus = useTvFocus(mode !== "ether");
  // the week from today, or six weeks from the Monday the month starts in (D-98); the morning program — «Сегодня»
  const calendarView = wallCalendarView(row, now, w);
  const calendar = useTvCalendar(
    guest,
    needs("calendar"),
    calendarView === "month" ? { from: monthGridFrom(now), days: MONTH_DAYS } : { from: null, days: 7 },
  );
  const overlay = useTvOverlay();
  // the director's board, only while it is on the wall (D-102) — or the week board's turn is in the round (D-144)
  const board = useTvBoard(guest, needs("board"), scene === "board" ? (row?.board_id ?? null) : (row?.week_board_id ?? null));
  // the rating scene: the first five, the riser, the rewards (D-123)
  const rating = useTvRating(guest, needs("rating"), ratingViewOf(row));
  const offline = useOffline(summary.dataUpdatedAt);

  // the turn of the program lands on its second, not on the next tick of the clock
  const turnAt = upcoming?.at.getTime() ?? null;
  useEffect(() => {
    if (turnAt === null) return;
    const wait = turnAt - Date.now();
    if (wait <= 0 || wait > PREPARE_MS + 10_000) return;
    const timer = setTimeout(() => setBoundary(turnAt), wait + 30);
    return () => clearTimeout(timer);
    // the clock's tick re-checks: the turn comes into reach only some ticks after it is known
  }, [turnAt, now]);

  const events = feed.data ?? [];
  const lines = events.map((event) => lineOf(event, guest));
  // лицо говорит о свежей новости и пересчитывается с часами: новость «стареет» сама
  const speech = speechOf(lines, data?.today ?? null, now, w);
  // a person after an order or an order after a person: the one on the wall stays until the next one's data
  // is there — one transition, not two through the ether scene underneath
  const switching = mode !== "ether" && focus.data != null && focus.data.mode !== mode && focus.isFetching;
  const focused = focus.data?.mode === "employee" && (mode === "employee" || switching) ? focus.data : null;
  const task = focus.data?.mode === "task" && (mode === "task" || switching) ? focus.data : null;
  const banner = overlayOf(overlay.data, data?.events ?? [], now);
  const [celebrating, setCelebrating] = useState(false);
  const onCelebrate = useCallback((busy: boolean) => setCelebrating(busy), []);

  // the kiosk's signals (I5): alive on every tick, the version shown, busy while a reload would cut something
  useEffect(() => kioskAlive(), [nowMs]);
  const version = row?.version ?? null;
  useEffect(() => kioskApplied(version), [version]);
  const busy = banner.banner !== null || focused !== null || task !== null || scene === "board" || celebrating;
  useEffect(() => kioskBusy(busy), [busy]);

  return (
    <div className="h-dvh w-full">
      <TvFrame
        company={company}
        logoUrl={logoUrl}
        now={now}
        guest={guest}
        scene={scene}
        next={next}
        clock={clockStyleOf(row)}
        // the director woke the wall from the remote: the night waits till the mark (D-105)
        night={isNight(now, w) && !awakeUntil(row, now)}
        offline={offline}
        items={tickerItems(lines, data)}
        speech={speech}
        summary={data ?? null}
        focus={focused}
        task={task}
        focusRemainingMs={focusRemainingMs(row, now)}
        rating={needs("rating") ? (rating.data ?? null) : null}
        calendar={calendar.data ?? null}
        calendarView={calendarView}
        board={needs("board") ? (board.data ?? null) : null}
        overlay={banner}
        // only the kiosk rings: the director peeking at /tv from a laptop is not the wall
        sound={role === "tv"}
        scale={row?.scale ?? 100}
        events={events}
        onCelebrate={onCelebrate}
      />
    </div>
  );
}
