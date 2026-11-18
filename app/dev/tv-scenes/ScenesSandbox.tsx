"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { TvAnnouncement } from "@/components/tv/TvAnnouncement";
import { TvCalendar } from "@/components/tv/TvCalendar";
import { TvDayResult } from "@/components/tv/TvDayResult";
import { TvFocus } from "@/components/tv/TvFocus";
import { TvLeaders } from "@/components/tv/TvLeaders";
import { TvPace } from "@/components/tv/TvPace";
import { TvTaskFocus } from "@/components/tv/TvTaskFocus";
import { TvTeam } from "@/components/tv/TvTeam";
import { TvWeekResult } from "@/components/tv/TvWeekResult";
import { TvWelcome } from "@/components/tv/TvWelcome";
import "@/components/tv/tv-type.css";

import {
  announcementFixture,
  calendarFixture,
  dayFixture,
  focusFixture,
  paceFixture,
  ratingFixture,
  taskFixture,
  teamSummary,
  weekFixture,
  type FocusCase,
  type TaskCase,
} from "./fixtures";
import type { SceneCase } from "./scenes";



/** A logo for the welcome scene: a plain mark drawn inline, no network. */
const LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect x="4" y="10" width="60" height="60" rx="16" fill="#2ED3B7"/><path d="M18 42h10l6-14 8 26 6-12h8" fill="none" stroke="#0B0F14" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="78" y="54" font-family="Arial" font-weight="700" font-size="34" fill="#E8EEF5">Компания</text></svg>`,
  );

/**
 * One wall scene on its own (D-182), on the wall's dark ground at the wall's proportions: the ticker's
 * band on top and the footer's at the bottom are kept empty, so the scene gets exactly the middle the
 * frame gives it. `k` is the remote's «Крупность» (`--tv-k`).
 */
export function ScenesSandbox({ scene, guest, k, base }: { scene: SceneCase; guest: boolean; k: number; base: number }) {
  // `base` — the moment the server drew the page: fixtures are laid out around it, the server and the
  // browser draw the same times, and the scene stands still for screenshots
  const now = new Date(base);
  const swapped = useSwap(scene === "rating-swap");

  let body: ReactNode;
  if (scene.startsWith("team")) {
    const count = Number(scene.split("-")[1]) || 10;
    body = <TvTeam summary={teamSummary(base, guest, count)} guest={guest} />;
  } else if (scene.startsWith("focus")) {
    body = <TvFocus focus={focusFixture(base, guest, scene as FocusCase)} remainingMs={7 * 60_000} now={now} />;
  } else if (scene.startsWith("task")) {
    body = <TvTaskFocus focus={taskFixture(base, guest, scene as TaskCase)} remainingMs={7 * 60_000} now={now} />;
  } else if (scene.startsWith("calendar")) {
    const kind = scene === "calendar-month" ? "month" : scene === "calendar-empty" ? "empty" : "week";
    body = <TvCalendar calendar={calendarFixture(base, guest, kind)} now={now} view={kind === "month" ? "month" : "week"} />;
  } else if (scene.startsWith("rating")) {
    body = <TvLeaders data={ratingFixture(base, guest, swapped)} now={now} />;
  } else if (scene === "day" || scene === "day-quiet") {
    body = <TvDayResult day={dayFixture(base, guest, scene)} guest={guest} now={now} />;
  } else if (scene === "week") {
    body = <TvWeekResult week={weekFixture(base, guest)} guest={guest} now={now} />;
  } else if (scene.startsWith("announcement")) {
    const kind = scene === "announcement-long" ? "long" : scene === "announcement-max" ? "max" : "short";
    body = <TvAnnouncement announcement={announcementFixture(base, kind)} now={now} />;
  } else if (scene.startsWith("welcome")) {
    body = <TvWelcome company="Компания" logoUrl={scene === "welcome" ? LOGO : null} now={now} />;
  } else {
    body = (
      <div className="flex flex-col items-center gap-[3vh]">
        {/* where the face stands on the wall: a placeholder of its size */}
        <span className="block h-[44vh] w-[44vh] rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--surface))" }} />
        <TvPace pace={paceFixture(scene as "pace" | "pace-low" | "pace-high" | "pace-record")} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full items-center justify-center overflow-hidden bg-bg" style={{ cursor: "none" }}>
      <div
        className="relative flex aspect-video max-h-full w-full max-w-[177.78vh] flex-col text-text"
        style={{ "--tv-k": String(k) } as CSSProperties}
        data-scene={scene}
        data-k={k}
      >
        {/* the ticker's band: 2.4vh + 6.2vh in the frame, grown by «Крупность» like the frame grows it */}
        <div className="h-[calc(2.4vh+6.2vh*var(--tv-k))] shrink-0" data-band="ticker" />
        <main className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex w-full items-center justify-center px-[4vh]">{body}</div>
        </main>
        {/* the footer's band: the clock line (7.4vh) and its margin (3.4vh) */}
        <div className="h-[calc(7.4vh*var(--tv-k)+3.4vh)] shrink-0" data-band="footer" />
      </div>
    </div>
  );
}

/** The rating's overtake on a loop: every four seconds the order flips, so the ride and the flash can be filmed. */
function useSwap(on: boolean): boolean {
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setSwapped((value) => !value), 4_000);
    return () => clearInterval(timer);
  }, [on]);
  return swapped;
}
