"use client";

import { useState, useSyncExternalStore } from "react";

import { shiftDay, ymdOfEvent } from "@/lib/calendar/agenda";
import { addMonths, monthOf, parseYmd, todayYmd, ymdOf, type Month, type Ymd } from "@/lib/datetime/calendar";

export type GridMode = "month" | "week";

const MODE_KEY = "pulse.calendar.grid";

const noSubscribe = () => () => {};

function readMode(): GridMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "week" ? "week" : "month";
  } catch {
    return "month";
  }
}

/**
 * Where /calendar is looking (D-100): the month on screen, the chosen day the ribbon starts
 * at, and whether the grid shows the month or only the chosen week — a per-phone habit,
 * kept in the browser (a small screen folds the month away once and keeps it folded).
 * `step` moves by a month or by a week, whichever the grid shows.
 */
export function useCalendarNav() {
  const [month, setMonth] = useState<Month>(() => monthOf(null));
  const [selected, setSelected] = useState<Ymd>(() => todayYmd());
  // the stored habit is read after hydration: the server renders the month, the phone may fold it
  const stored = useSyncExternalStore(noSubscribe, readMode, () => "month" as const);
  const [chosen, setChosen] = useState<GridMode | null>(null);
  const mode = chosen ?? stored;
  // which way the grid last moved — the new month slides in from that side
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);

  const pick = (day: Ymd) => {
    const parts = parseYmd(day);
    if (!parts) return;
    // a day of the neighbouring month, seen at the grid's edge, takes its month along
    if (parts.year !== month.year || parts.month !== month.month) {
      setDirection(day < selected ? -1 : 1);
      setMonth({ year: parts.year, month: parts.month });
    }
    setSelected(day);
  };

  const step = (delta: -1 | 1) => {
    setDirection(delta);
    if (mode === "week") {
      const day = shiftDay(selected, delta * 7);
      setSelected(day);
      setMonth(monthOf(day));
      return;
    }
    const next = addMonths(month, delta);
    const today = parseYmd(todayYmd())!;
    setMonth(next);
    // today when the month has it, its first day otherwise
    setSelected(today.year === next.year && today.month === next.month ? todayYmd() : ymdOf(next.year, next.month, 1));
  };

  const goToday = () => {
    const today = todayYmd();
    setDirection(today < selected ? -1 : 1);
    setMonth(monthOf(today));
    setSelected(today);
  };

  /** A meeting saved on another day: the grid and the ribbon go there. */
  const follow = (startsAt: string) => {
    const day = ymdOfEvent({ starts_at: startsAt });
    if (day === selected) return;
    setDirection(day < selected ? -1 : 1);
    setSelected(day);
    setMonth(monthOf(day));
  };

  const setMode = (next: GridMode) => {
    if (next === mode) return;
    // folding is not a step sideways: the new shape appears in place
    setDirection(0);
    setChosen(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // a private window keeps the choice for this visit only
    }
  };

  return { month, selected, mode, direction, pick, step, goToday, follow, setMode };
}

export type CalendarNav = ReturnType<typeof useCalendarNav>;
