"use client";

import { lineOf } from "@/lib/tv/feed";
import { overlayOf } from "@/lib/tv/overlay";
import { useTvBoard, useTvCalendar, useTvFeed, useTvFocus, useTvOverlay, useTvState, useTvSummary } from "@/lib/tv/queries";
import { MONTH_DAYS, monthGridFrom } from "@/lib/tv/calendar";
import { awakeUntil, calendarViewOf, clockStyleOf, effectiveMode, focusRemainingMs, guestOf, isNight, sceneOf } from "@/lib/tv/state";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

import { TvFrame } from "./TvFrame";
import { useClock, useHeartbeat, useNightReload, useOffline, useRemoteReload } from "./useKiosk";

/**
 * Киоск: данные стены и её appliance-часть. Раскладку рисует `TvFrame` — чистый вид на
 * пропсах, его же на фикстурах показывает песочница `/dev/tv`.
 *
 * Что показывать, решает строка `tv_state`, а не сам киоск (D-76): фокус на сотруднике
 * с телефона директора живёт 10 минут и гаснет по часам экрана, заставка эфира — лицо,
 * часы, команда или календарь — не истекает вовсе, вид часов — цифры или стрелки (D-96).
 * Строка переживает и ночной перезапуск, и деплой, поэтому команда с пульта не теряется,
 * пока экран моргает. Посетитель от секретаря приходит той же строкой: визит поднимает её
 * версию, киоск перечитывает надпись `tv_overlay()`. Доска директора — тоже: правка доски на
 * стене поднимает версию строки, киоск перечитывает `tv_board()` (D-102). Ночь стена
 * считает по своим часам, но разбудка с пульта — отметка `awake_until` в той же строке (D-105).
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
  const row = state.data ?? null;

  const mode = effectiveMode(row, now);
  const guest = guestOf(row, initialGuest, now);
  const scene = sceneOf(row, now);

  const feed = useTvFeed();
  const summary = useTvSummary(guest);
  const focus = useTvFocus(mode === "employee");
  // the week from today, or six weeks from the Monday the month starts in (D-98)
  const calendarView = calendarViewOf(row);
  const calendar = useTvCalendar(
    guest,
    scene === "calendar",
    calendarView === "month" ? { from: monthGridFrom(now), days: MONTH_DAYS } : { from: null, days: 7 },
  );
  const overlay = useTvOverlay();
  // the director's board, only while it is on the wall (D-102)
  const board = useTvBoard(guest, scene === "board");
  const offline = useOffline(summary.dataUpdatedAt);

  useNightReload();
  useHeartbeat(role, row?.version ?? null);
  useRemoteReload(row);

  const data = summary.data;
  const lines = (feed.data ?? []).map((event) => lineOf(event, guest));
  // лицо говорит о том же, что едет в строке, и пересчитывается с часами: новость
  // «стареет» сама, без отдельного таймера
  const speech = speechOf(lines, data?.today ?? { sent: 0, done: 0, in_work: 0 }, now);
  const focused = mode === "employee" && focus.data?.mode === "employee" ? focus.data : null;

  return (
    <div className="h-dvh w-full">
      <TvFrame
        company={company}
        logoUrl={logoUrl}
        now={now}
        guest={guest}
        scene={scene}
        clock={clockStyleOf(row)}
        // the director woke the wall from the remote: the night waits till the mark (D-105)
        night={isNight(now) && !awakeUntil(row, now)}
        offline={offline}
        items={tickerItems(lines, data)}
        speech={speech}
        summary={data ?? null}
        focus={focused}
        focusRemainingMs={focusRemainingMs(row, now)}
        calendar={calendar.data ?? null}
        calendarView={calendarView}
        board={scene === "board" ? (board.data ?? null) : null}
        overlay={overlayOf(overlay.data, data?.events ?? [], now)}
        // only the kiosk rings: the director peeking at /tv from a laptop is not the wall
        sound={role === "tv"}
      />
    </div>
  );
}
