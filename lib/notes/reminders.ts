"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { toast } from "@/components/ui/Toast";
import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { playChime, reminderSoundOn, unlockAudio } from "@/lib/desk/chime";
import { useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { pluralRu } from "@/lib/tasks/status-text";

import { firstLine } from "./list";
import { noteKeys, type Note } from "./queries";

/**
 * Reminders on time while the desk is open (D-177). The server's sweep runs once a day on the
 * current plan (08:00 Aqtobe, В-8), so «через час» would ring tomorrow morning; an open desk rings
 * it itself, on the minute: the chime, a toast «Напоминание: …» with «Открыть», the tab's words —
 * and writes `reminded_at` (guarded by `reminded_at is null`, RLS: the author's own rows), so the
 * morning push does not repeat it and another tab or device does not ring it twice. A moved
 * reminder rings again: the trigger clears `reminded_at` when `remind_at` changes.
 *
 * It reads only what it needs — the author's reminders still to ring, up to the end of today (or
 * two hours ahead near midnight) — never the 300 notes of «Заметки» on every screen. The same
 * read gives «Сегодня» its line «Напомню сегодня · N».
 */

export type DueReminder = Pick<Note, "id" | "text" | "remind_at" | "board_id" | "audio_path">;

export const reminderKeys = {
  due: (userId: string) => [...noteKeys.root, "due", userId] as const,
};

/** How far ahead the read looks at least: a reminder set near midnight still rings on time. */
const AHEAD_MS = 2 * 60 * 60_000;
/** The read again: a reminder set on another device is seen within this. */
const REFRESH_MS = 5 * 60_000;
/** How often the open desk looks at the clock: within the minute of the reminder. */
const TICK_MS = 15_000;
/** Late by more than this, the words say for when it was set — as the server's push does. */
const LATE_MS = 15 * 60_000;
/** A rung reminder stays in the tab's words while the person is away, at most this long. */
const FLAG_MAX_MS = 30 * 60_000;
/** …and this long once the tab is in front of them. */
const FLAG_SEEN_MS = 60_000;
/** The browser remembers what it rang for two days: a write that failed does not ring again. */
const MEMORY_MS = 2 * 24 * 60 * 60_000;
const MEMORY_KEY = "pulse.desk.rang";
const OFFSET_MS = 5 * 60 * 60_000;

/** The end of the Aqtobe day `now` is in. */
export function endOfAqtobeDay(now: Date): Date {
  return new Date((aqtobeDay(now) + 1) * 86_400_000 - OFFSET_MS);
}

/** The read's upper bound: the end of today, at least two hours ahead. */
export function horizonOf(now: Date): Date {
  return new Date(Math.max(endOfAqtobeDay(now).getTime(), now.getTime() + AHEAD_MS));
}

const at = (row: Pick<DueReminder, "remind_at">) => (row.remind_at ? new Date(row.remind_at).getTime() : Number.POSITIVE_INFINITY);

/** The browser's memory of a ring: the note and the time it was set for (a moved one rings again). */
export function rangKey(row: Pick<DueReminder, "id" | "remind_at">): string {
  return `${row.id}|${row.remind_at ?? ""}`;
}

/** What rings now: its time has come and this browser has not rung it yet — the earliest first. */
export function dueToRing(rows: readonly DueReminder[], now: Date, rang: ReadonlySet<string>): DueReminder[] {
  return rows.filter((row) => at(row) <= now.getTime() && !rang.has(rangKey(row))).sort((a, b) => at(a) - at(b));
}

/** «Напомню сегодня»: the reminders of today's Aqtobe date still ahead, the earliest first — a time gone by is no promise. */
export function leftToday(rows: readonly DueReminder[], now: Date): DueReminder[] {
  const today = aqtobeDay(now);
  return rows.filter((row) => row.remind_at !== null && at(row) > now.getTime() && aqtobeDay(new Date(row.remind_at)) === today).sort((a, b) => at(a) - at(b));
}

/** The first line of a reminder as words: a voice note without words yet is «Голосовая заметка». */
export function reminderHead(row: Pick<DueReminder, "text">): string {
  return firstLine(row.text ?? "").trim() || "Голосовая заметка";
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Where «Открыть» leads: the note itself, a board's point on its board. */
export function reminderHref(row: Pick<DueReminder, "id" | "board_id">): string {
  return row.board_id ? `/desk/boards/${row.board_id}` : `/desk/notes?n=${row.id}`;
}

/**
 * The toast of a ring: «Напоминание: Позвонить в банк», «… · было на 15.11 18:30» when it is
 * late; several at once — «Напоминания: 3 — Банк, Смета и ещё 1» and «Открыть» leads to the list.
 */
export function ringWords(rows: readonly DueReminder[], now: Date): { text: string; href: string } {
  const first = rows[0];
  if (!first) return { text: "", href: "/desk/notes" };
  if (rows.length === 1) {
    const late = now.getTime() - at(first) > LATE_MS && first.remind_at ? ` · было на ${humanAqtobe(new Date(first.remind_at), now)}` : "";
    return { text: `Напоминание: ${clip(reminderHead(first), 80)}${late}`, href: reminderHref(first) };
  }
  const heads = rows.slice(0, 2).map((row) => clip(reminderHead(row), 32));
  const more = rows.length > 2 ? ` и ещё ${rows.length - 2}` : "";
  return { text: `${pluralRu(rows.length, ["Напоминание", "Напоминания", "Напоминаний"])}: ${rows.length} — ${heads.join(", ")}${more}`, href: "/desk/notes" };
}

/** The tab's words while a rung reminder waits to be seen. */
export function flagWords(rows: readonly DueReminder[]): string {
  const first = rows[0];
  if (!first) return "";
  return rows.length === 1 ? clip(reminderHead(first), 28) : `${rows.length} ${pluralRu(rows.length, ["напоминание", "напоминания", "напоминаний"])}`;
}

/* ------------------------------------------------------------------------------- the read */

async function fetchDue(userId: string): Promise<DueReminder[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("notes")
    .select("id, text, remind_at, board_id, audio_path")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .is("reminded_at", null)
    .not("remind_at", "is", null)
    .lte("remind_at", horizonOf(new Date()).toISOString())
    .order("remind_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The author's reminders still to ring, up to the end of today. */
export function useDueReminders(userId: string | undefined) {
  return useQuery({
    queryKey: reminderKeys.due(userId ?? ""),
    queryFn: () => fetchDue(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
  });
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

function writeMemory(memory: Map<string, number>): void {
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // a private window: this page's own memory (below) still keeps it from ringing twice
  }
}

/** Rung in this page — also when the browser keeps no storage. */
const rangHere = new Set<string>();

function rangSet(): Set<string> {
  return new Set([...readMemory().keys(), ...rangHere]);
}

function remember(rows: readonly DueReminder[]): void {
  const memory = readMemory();
  for (const row of rows) {
    rangHere.add(rangKey(row));
    memory.set(rangKey(row), Date.now());
  }
  writeMemory(memory);
}

/* ------------------------------------------------------------------------------ the write */

type Mark = "won" | "lost" | "failed";

/**
 * «Rang on the desk»: `reminded_at = now()` while it is still null. «lost» — another tab, device
 * or the server's push took it first (it rang there); «failed» — no network: the person is here,
 * it rings anyway and the morning push may say it once more.
 */
async function markRung(row: Pick<DueReminder, "id" | "remind_at">): Promise<Mark> {
  if (!row.remind_at) return "lost";
  try {
    const supabase = createBrowserSupabase();
    // only the time this desk saw: a reminder moved meanwhile (its trigger cleared reminded_at)
    // must not be stamped as rung before its new time
    const { data, error } = await supabase
      .from("notes")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("remind_at", row.remind_at)
      .is("reminded_at", null)
      .select("id");
    if (error) return "failed";
    return (data ?? []).length > 0 ? "won" : "lost";
  } catch {
    return "failed";
  }
}

/* ----------------------------------------------------------------------- the tab's words */

let flag: { words: string; at: number } | null = null;
const flagListeners = new Set<() => void>();

function setFlag(next: { words: string; at: number } | null): void {
  flag = next;
  for (const listener of flagListeners) listener();
}

/** Takes the rung reminder off the tab: it has been seen, or opened. */
export function clearReminderFlag(): void {
  if (flag) setFlag(null);
}

function subscribeFlag(listener: () => void): () => void {
  flagListeners.add(listener);
  return () => flagListeners.delete(listener);
}

/** What the tab says about a reminder that has just rung, or null (DeskShell → signals). */
export function useReminderFlag(): string | null {
  return useSyncExternalStore(
    subscribeFlag,
    () => flag?.words ?? null,
    () => null,
  );
}

/** The flag goes a minute after the tab is in front of the person, or after half an hour anyway. */
function useFlagFades(): void {
  const words = useReminderFlag();
  useEffect(() => {
    if (!words) return;
    let seen: ReturnType<typeof setTimeout> | null = null;
    const watch = () => {
      const front = document.visibilityState === "visible" && document.hasFocus();
      if (front && !seen) seen = setTimeout(clearReminderFlag, FLAG_SEEN_MS);
      if (!front && seen) {
        clearTimeout(seen);
        seen = null;
      }
    };
    watch();
    const cap = setTimeout(clearReminderFlag, FLAG_MAX_MS);
    document.addEventListener("visibilitychange", watch);
    window.addEventListener("focus", watch);
    window.addEventListener("blur", watch);
    return () => {
      if (seen) clearTimeout(seen);
      clearTimeout(cap);
      document.removeEventListener("visibilitychange", watch);
      window.removeEventListener("focus", watch);
      window.removeEventListener("blur", watch);
    };
  }, [words]);
}

/* ------------------------------------------------------------------------------- the ring */

/**
 * Mounted once on the director's desk (DeskShell): looks at the clock every few seconds and rings
 * what is due. Data first, then the effect (principle 1a): the write decides whether this page
 * rings, the chime and the toast play on top. `open` — the desk's navigation for «Открыть».
 */
export function useReminderRinger(me: { userId: string } | undefined, open: (href: string) => void): void {
  const queryClient = useQueryClient();
  const userId = me?.userId;
  const due = useDueReminders(userId);
  const latest = useRef({ rows: due.data, open });
  useEffect(() => {
    latest.current = { rows: due.data, open };
  });
  const checkNow = useRef<(() => void) | null>(null);
  useFlagFades();

  // a reminder set or moved elsewhere (the phone, another tab, «Заметки» here) is read again at
  // once; the socket of «Заметки» is shared — a typed word without a reminder changes nothing
  useRealtimeListener<Note>(
    { table: "notes", filter: userId ? `user_id=eq.${userId}` : undefined },
    (payload) => {
      if (!userId) return;
      const row = payload.new as Partial<Note> | undefined;
      const known = latest.current.rows?.some((r) => r.id === row?.id) ?? false;
      if (row?.remind_at || known) void queryClient.invalidateQueries({ queryKey: reminderKeys.due(userId) });
    },
    () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: reminderKeys.due(userId) }, { cancelRefetch: false });
    },
    "note-reminders",
    Boolean(userId),
  );

  // the browser lets a page sound only after a click or a key: the first one wakes the audio
  useEffect(() => {
    const wake = () => {
      if (reminderSoundOn()) unlockAudio(true);
    };
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    return () => {
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let busy = false;
    const check = async () => {
      const rows = latest.current.rows;
      if (busy || !rows || rows.length === 0) return;
      const now = new Date();
      const fresh = dueToRing(rows, now, rangSet());
      if (fresh.length === 0) return;
      busy = true;
      try {
        remember(fresh);
        const marks = await Promise.all(fresh.map((row) => markRung(row)));
        const ringing = fresh.filter((_, index) => marks[index] !== "lost");
        // the cache of «Заметки», if it is here, shows the trace at once; the realtime echo agrees
        const stamp = new Date().toISOString();
        const rung = new Set(fresh.map((row) => row.id));
        queryClient.setQueryData<Note[]>(noteKeys.mine(userId), (list) =>
          list?.map((note) => (rung.has(note.id) && note.reminded_at === null ? { ...note, reminded_at: stamp } : note)),
        );
        void queryClient.invalidateQueries({ queryKey: reminderKeys.due(userId) });
        if (ringing.length === 0) return;
        if (reminderSoundOn()) {
          unlockAudio();
          playChime();
        }
        const words = ringWords(ringing, now);
        setFlag({ words: flagWords(ringing), at: Date.now() });
        toast(words.text, {
          lifetimeMs: 12_000,
          action: {
            label: "Открыть",
            onClick: () => {
              clearReminderFlag();
              latest.current.open(words.href);
            },
          },
        });
      } finally {
        busy = false;
      }
    };
    checkNow.current = () => void check();
    void check();
    const timer = setInterval(() => void check(), TICK_MS);
    // a tab that comes back from the background looks at once
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      checkNow.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [userId, queryClient]);

  // the read landed (the desk opened, a reminder was set or moved): something may be due already
  const rows = due.data;
  useEffect(() => {
    if (rows && rows.length > 0) checkNow.current?.();
  }, [rows]);
}

/** «Напомню сегодня · N» for «Сегодня»: today's reminders still to ring, and the soonest. */
export function useRemindersToday(userId: string | undefined, now: Date): { count: number; next: Date | null } {
  const due = useDueReminders(userId);
  const today = leftToday(due.data ?? [], now);
  const first = today[0];
  return { count: today.length, next: first?.remind_at ? new Date(first.remind_at) : null };
}
