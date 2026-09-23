import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { pluralRu } from "@/lib/tasks/status-text";

import type { PendingCreate } from "./pending";
import type { Note } from "./queries";

/** A note that exists only on the phone yet, drawn as a row of the feed or of its board (D-95, D-102). */
export function phoneRow(entry: PendingCreate): Note {
  return {
    id: entry.id,
    company_id: entry.companyId,
    user_id: entry.userId,
    text: entry.text,
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    board_id: entry.boardId ?? null,
    position: entry.position ?? null,
    done_at: null,
    client_request_id: entry.crid,
    created_at: entry.createdAt,
    updated_at: entry.createdAt,
  };
}

/**
 * Pure list arithmetic of the notes screen — three piles (thoughts, «В деле», the
 * bin), reminders and pinned first, day groups the way a notes app files them, plain
 * substring search. The screen holds the latest few hundred rows; older ones come by
 * «Показать раньше» and by the server search (D-95).
 */

export type NotePiles = { active: Note[]; converted: Note[]; trash: Note[] };

export function isConverted(note: Note): boolean {
  return note.converted_task_id !== null || note.converted_announcement_id !== null;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const newestFirst = (a: Note, b: Note) => time(b.created_at) - time(a.created_at);

/** A deleted note waits in the bin this long; then the minute sweep removes the row (D-95). */
export const TRASH_DAYS = 3;
const DAY_MS = 86_400_000;

/** When the sweep takes a note out of the bin for good. */
export function trashExpiresAt(note: Note): Date {
  return new Date(time(note.deleted_at ?? note.updated_at) + TRASH_DAYS * DAY_MS);
}

/**
 * The bin holds what was deleted, newest deletion first; «В деле» — what a note
 * became; the rest is the working feed, pinned on top. With `now`, a deletion past
 * its three days is gone already, even if the sweep has not come round yet.
 *
 * A point of a board (D-102) lives on its board, never in the feed or «В деле»; a deleted
 * point lies in the bin only while its board is alive (`liveBoards`) — the points of a
 * deleted board are represented by the board's own card there.
 */
export function splitNotes(notes: readonly Note[], now?: Date, liveBoards?: ReadonlySet<string>): NotePiles {
  const active: Note[] = [];
  const converted: Note[] = [];
  const trash: Note[] = [];
  for (const note of notes) {
    const point = note.board_id !== null;
    if (note.deleted_at !== null) {
      if (point && !liveBoards?.has(note.board_id as string)) continue;
      if (!now || trashExpiresAt(note).getTime() > now.getTime()) trash.push(note);
    }
    else if (point) continue;
    else if (isConverted(note)) converted.push(note);
    else active.push(note);
  }

  active.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return newestFirst(a, b);
  });
  converted.sort((a, b) => time(b.converted_at ?? b.created_at) - time(a.converted_at ?? a.created_at));
  trash.sort((a, b) => time(b.deleted_at) - time(a.deleted_at));
  return { active, converted, trash };
}

/**
 * Case-insensitive substring over the text and over what was said (`raw_transcript`):
 * a word the director edited away still finds its note. An empty query keeps everything.
 */
export function filterNotes(notes: readonly Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...notes];
  return notes.filter((note) => note.text.toLowerCase().includes(needle) || (note.raw_transcript ?? "").toLowerCase().includes(needle));
}

/** The card's heading: the first line with something on it. */
export function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** What is left under the heading. */
export function restLines(text: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index === -1) return "";
  return lines.slice(index + 1).join("\n").trim();
}

/**
 * A dictated note is a row before it is words (принцип 5): the recording is saved
 * first, the text arrives after STT. An empty text next to a recording is that state —
 * being transcribed right now, or left without words by a failed STT.
 */
export function awaitsWords(note: Note): boolean {
  return note.text.trim() === "" && note.audio_path !== null;
}

/* -------------------------------------------------------------------------- */
/* Day groups                                                                   */
/* -------------------------------------------------------------------------- */

export type NoteGroupKey = "reminders" | "pinned" | "today" | "yesterday" | "week" | "month" | `m-${number}-${number}` | `y-${number}`;

export type NoteGroup = { key: NoteGroupKey; title: string; notes: Note[] };

const MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const OFFSET_MS = 5 * 60 * 60 * 1000;

/** Year and month of an instant on the Aqtobe wall clock (a fixed +05:00, no DST). */
function aqtobeMonth(date: Date): { year: number; month: number } {
  const wall = new Date(date.getTime() + OFFSET_MS);
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() };
}

function groupOf(note: Note, now: Date): { key: NoteGroupKey; title: string } {
  if (awaitsReminder(note)) return { key: "reminders", title: "Напоминания" };
  if (note.pinned) return { key: "pinned", title: "Закреплённые" };
  const created = new Date(note.created_at);
  const days = aqtobeDay(now) - aqtobeDay(created);
  if (days <= 0) return { key: "today", title: "Сегодня" };
  if (days === 1) return { key: "yesterday", title: "Вчера" };
  if (days < 7) return { key: "week", title: "Последние 7 дней" };
  if (days < 30) return { key: "month", title: "Последние 30 дней" };
  const at = aqtobeMonth(created);
  if (at.year === aqtobeMonth(now).year) return { key: `m-${at.year}-${at.month}`, title: MONTHS_RU[at.month] };
  return { key: `y-${at.year}`, title: String(at.year) };
}

/**
 * The feed filed the way a notes app files it: reminders still to ring (soonest first),
 * pinned, today, yesterday, the last 7 and 30 days, then the months of this year and
 * whole earlier years. Elsewhere the input order is kept, so `splitNotes` decides.
 */
export function groupNotes(notes: readonly Note[], now: Date): NoteGroup[] {
  const groups: NoteGroup[] = [];
  const byKey = new Map<NoteGroupKey, NoteGroup>();
  for (const note of notes) {
    const { key, title } = groupOf(note, now);
    let group = byKey.get(key);
    if (!group) {
      group = { key, title, notes: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.notes.push(note);
  }
  const reminders = byKey.get("reminders");
  if (!reminders) return groups;
  reminders.notes.sort((a, b) => time(a.remind_at) - time(b.remind_at));
  return [reminders, ...groups.filter((group) => group !== reminders)];
}

const pad = (n: number) => String(n).padStart(2, "0");

const WEEKDAYS_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

/**
 * A past moment as a person says it: «сегодня 09:14», «вчера 09:14», «пт 09:14» within
 * the week, the date further back. (`humanAqtobe` looks forward — it names weekdays of
 * the coming week, and a note is always in the past.)
 */
export function whenRu(iso: string, now: Date): string {
  const date = new Date(iso);
  const wall = new Date(date.getTime() + OFFSET_MS);
  const hour = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
  const days = aqtobeDay(now) - aqtobeDay(date);
  if (days === 0) return `сегодня ${hour}`;
  if (days === 1) return `вчера ${hour}`;
  if (days > 1 && days < 7) return `${WEEKDAYS_SHORT_RU[wall.getUTCDay()]} ${hour}`;
  return humanAqtobe(date, now);
}

/** Under «Сегодня» and «Вчера» the day is already the heading, so the card says the hour. */
export function noteTime(iso: string, group: NoteGroupKey, now: Date): string {
  if (group === "today" || group === "yesterday") return whenRu(iso, now).split(" ")[1];
  return whenRu(iso, now);
}

/* -------------------------------------------------------------------------- */
/* Search highlight                                                             */
/* -------------------------------------------------------------------------- */

export type Segment = { text: string; hit: boolean };

/** The text cut into plain and matching runs — every occurrence, case-insensitive. */
export function markMatches(text: string, query: string): Segment[] {
  if (!text) return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const haystack = text.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}

/* -------------------------------------------------------------------------- */
/* The status screen                                                            */
/* -------------------------------------------------------------------------- */

export type NoteFilter = "active" | "boards" | "converted" | "trash";

/** The status screen of «Заметки» (D-93): one number, its word, and two quiet lines. */
export type NotesHero = { value: number | null; label: string; detail: string; second: string };

/**
 * What the head of the screen says about the thoughts, whatever tab is open below — the
 * way the status screen of «Задачи» speaks for all of them: how many (the server's `total`
 * when it knows more than the screen loaded), pinned, the latest, the soonest reminder,
 * the week, how many were spoken.
 */
export function notesHero(piles: NotePiles, now: Date, total = 0): NotesHero {
  const { active } = piles;
  // the server may hold more than the screen loaded (D-95): the number is the server's
  const count = Math.max(active.length, total);
  if (active.length === 0) {
    return { value: null, label: "Пока пусто", detail: "Зажмите микрофон и скажите мысль —", second: "запишу слово в слово" };
  }
  const pinned = active.filter((note) => note.pinned).length;
  const latest = active.reduce((a, b) => (time(b.created_at) > time(a.created_at) ? b : a));
  const weekStart = aqtobeDay(now) - 6;
  const week = active.filter((note) => aqtobeDay(new Date(note.created_at)) >= weekStart).length;
  const voiced = active.filter((note) => note.audio_path !== null).length;
  const soon = nextReminder(active);
  return {
    value: count,
    label: pluralRu(count, ["заметка", "заметки", "заметок"]),
    detail: [pinned > 0 ? `${pinned} ${pluralRu(pinned, ["закреплена", "закреплены", "закреплено"])}` : "", `последняя ${whenRu(latest.created_at, now)}`]
      .filter(Boolean)
      .join(" · "),
    // a reminder still to ring outranks «голосом»: it is the one line with a promise in it
    second: [soon ? reminderRu(soon, now) : "", `${week} за 7 дней`, !soon && voiced > 0 ? `${voiced} голосом` : ""].filter(Boolean).join(" · "),
  };
}

/* -------------------------------------------------------------------------- */
/* Reminders (D-95)                                                             */
/* -------------------------------------------------------------------------- */

/** A note with a time that has not rung yet — «напомни мне …» said or set on the card. */
export function awaitsReminder(note: Note): boolean {
  return note.remind_at !== null && note.reminded_at === null && note.deleted_at === null;
}

/** The reminder of a note in words: «напомню завтра 09:00», «напомнил вчера 09:00». */
export function reminderRu(note: Note, now: Date): string | null {
  if (!note.remind_at) return null;
  const at = new Date(note.remind_at);
  if (note.reminded_at) return `напомнил ${whenRu(note.remind_at, now)}`;
  // the tick has not come round yet: it rings within the minute
  if (at.getTime() <= now.getTime()) return "напомню сейчас";
  return `напомню ${humanAqtobe(at, now)}`;
}

/** The soonest reminder still to ring among the thoughts. */
export function nextReminder(notes: readonly Note[]): Note | null {
  let soonest: Note | null = null;
  for (const note of notes) {
    if (awaitsReminder(note) && (!soonest || time(note.remind_at) < time(soonest.remind_at))) soonest = note;
  }
  return soonest;
}

/** An instant at hh:mm on the Aqtobe wall clock, `dayShift` days from today there. */
function aqtobeAt(now: Date, dayShift: number, hours: number, minutes: number): Date {
  const wall = new Date(now.getTime() + OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + dayShift, hours, minutes) - OFFSET_MS);
}

export type RemindPreset = { label: string; at: Date };

/**
 * The one-tap times of «Напомнить»: in an hour (on a five-minute mark), this evening
 * while it is still ahead, tomorrow morning, Monday morning when Monday is not tomorrow.
 */
export function remindPresets(now: Date): RemindPreset[] {
  const step = 5 * 60_000;
  const presets: RemindPreset[] = [{ label: "Через час", at: new Date(Math.ceil((now.getTime() + 3_600_000) / step) * step) }];
  const evening = aqtobeAt(now, 0, 18, 0);
  if (evening.getTime() - now.getTime() >= 3_600_000) presets.push({ label: "Сегодня 18:00", at: evening });
  presets.push({ label: "Завтра 9:00", at: aqtobeAt(now, 1, 9, 0) });
  const weekday = new Date(now.getTime() + OFFSET_MS).getUTCDay();
  const toMonday = ((8 - weekday) % 7) || 7;
  if (toMonday > 1) presets.push({ label: "Пн 9:00", at: aqtobeAt(now, toMonday, 9, 0) });
  return presets;
}
