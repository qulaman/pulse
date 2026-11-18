"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useSettled } from "@/components/desk/ui/SideNav";
import { toast } from "@/components/ui/Toast";
import { playChime, reminderSoundOn, unlockAudio } from "@/lib/desk/chime";

import { useCalendar, type CalendarEvent } from "./queries";

/**
 * A meeting rings on an open desk a quarter of an hour before it starts (D-180), the way «Заметки»
 * ring their reminders (D-177): the chime — unless this browser was told «Без звука» — and a toast
 * «Через 15 мин: Планёрка · Переговорная» with «Открыть». Once per browser: what has rung is kept
 * in localStorage (a moved meeting rings again — the key holds its start); without storage, this
 * page's memory keeps it from ringing twice. Nothing is written anywhere: the push of the meeting
 * is the server's (its own «Напомнить»), this is the desk's nudge for the person at it.
 *
 * It reads nothing of its own: the calendar's list (yesterday to a month on) is the one the side
 * navigation already counts with.
 */

/** How long before its start a meeting rings. */
export const RING_BEFORE_MS = 15 * 60_000;
/** How often the open desk looks at the clock: within the minute. */
const TICK_MS = 15_000;
/** The browser remembers what rang for two days. */
const MEMORY_MS = 2 * 24 * 60 * 60_000;
const MEMORY_KEY = "pulse.desk.meeting-rang";
/** The toast stays as long as a note's reminder does. */
const TOAST_MS = 12_000;

type Ringable = Pick<CalendarEvent, "id" | "starts_at" | "title" | "location" | "author_id" | "cancelled_at" | "participants">;

/** The browser's memory of a ring: the meeting and the start it rang for. */
export function ringKey(event: Pick<CalendarEvent, "id" | "starts_at">): string {
  // the cache writes `…Z`, the server `…+00:00` for the same moment: the key is the moment itself
  return `${event.id}|${Date.parse(event.starts_at)}`;
}

/** A meeting of this person: they made it, or they are asked and have not refused. */
export function isMine(event: Ringable, meId: string): boolean {
  if (!meId || event.cancelled_at) return false;
  if (event.author_id === meId) return true;
  return event.participants.some((person) => person.user_id === meId && person.status !== "declined");
}

/**
 * What rings now: this person's meetings that start within the quarter of an hour ahead and have
 * not rung in this browser — the soonest first. One already begun does not ring: it is too late
 * to get up and go, and its own push said it.
 */
export function dueMeetings<T extends Ringable>(events: readonly T[], meId: string, now: Date, rang: ReadonlySet<string>): T[] {
  const at = now.getTime();
  return events
    .filter((event) => {
      const start = Date.parse(event.starts_at);
      return start > at && start - at <= RING_BEFORE_MS && isMine(event, meId) && !rang.has(ringKey(event));
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** «Через 15 мин: Планёрка · Переговорная» — the minutes left, rounded up. */
export function ringWords(event: Pick<CalendarEvent, "starts_at" | "title" | "location">, now: Date): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(event.starts_at) - now.getTime()) / 60_000));
  const title = event.title.replace(/\s+/g, " ").trim();
  const place = event.location?.trim();
  return `Через ${minutes} мин: ${title}${place ? ` · ${place}` : ""}`;
}

/** Where «Открыть» leads: the meeting on the desk's calendar. */
export function ringHref(event: Pick<CalendarEvent, "id">): string {
  return `/desk/calendar?e=${event.id}`;
}

/* --------------------------------------------------------------------------- the memory */

function readMemory(): Map<string, number> {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const cutoff = Date.now() - MEMORY_MS;
    return new Map(Object.entries(parsed).filter(([, when]) => typeof when === "number" && when > cutoff));
  } catch {
    return new Map();
  }
}

/** Rung in this page — also when the browser keeps no storage. */
const rangHere = new Set<string>();

function rangSet(): Set<string> {
  return new Set([...readMemory().keys(), ...rangHere]);
}

function remember(events: readonly Ringable[]): void {
  const memory = readMemory();
  for (const event of events) {
    rangHere.add(ringKey(event));
    memory.set(ringKey(event), Date.now());
  }
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // a private window: this page's own memory still keeps it from ringing twice
  }
}

/* ------------------------------------------------------------------------------- the ring */

/**
 * Mounted once on the desk (DeskShell), for the director and the secretary alike: looks at the
 * clock every few seconds and rings this person's meeting a quarter of an hour before it.
 */
export function MeetingRing({ meId }: { meId: string }): null {
  const router = useRouter();
  const settled = useSettled();
  const calendar = useCalendar(settled);
  const latest = useRef({ events: calendar.data, router });
  useEffect(() => {
    latest.current = { events: calendar.data, router };
  });
  const checkNow = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!meId) return;
    // the browser lets a page sound only after a click or a key: the first one wakes the audio
    const wake = () => {
      if (reminderSoundOn()) unlockAudio(true);
    };
    const check = () => {
      const events = latest.current.events;
      if (!events || events.length === 0) return;
      const now = new Date();
      const due = dueMeetings(events, meId, now, rangSet());
      if (due.length === 0) return;
      remember(due);
      if (reminderSoundOn()) {
        unlockAudio();
        playChime();
      }
      for (const event of due) {
        toast(ringWords(event, now), {
          lifetimeMs: TOAST_MS,
          action: { label: "Открыть", onClick: () => latest.current.router.push(ringHref(event)) },
        });
      }
    };
    checkNow.current = check;
    check();
    const timer = setInterval(check, TICK_MS);
    // a tab that comes back from the background looks at once
    const onShow = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      checkNow.current = null;
      clearInterval(timer);
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [meId]);

  // the list landed or changed (a meeting made or moved a minute ago): it may be due already
  const events = calendar.data;
  useEffect(() => {
    if (events && events.length > 0) checkNow.current?.();
  }, [events]);

  return null;
}
