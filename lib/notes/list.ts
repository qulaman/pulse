import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { pluralRu } from "@/lib/tasks/status-text";

import type { Note } from "./queries";

/**
 * Pure list arithmetic of the notes screen — three piles (thoughts, «В деле», the
 * bin), pinned first, day groups the way a notes app files them, plain substring
 * search. The screen is a client's own feed of a few hundred rows at most (D-75 §6).
 */

export type NotePiles = { active: Note[]; converted: Note[]; trash: Note[] };

export function isConverted(note: Note): boolean {
  return note.converted_task_id !== null || note.converted_announcement_id !== null;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const newestFirst = (a: Note, b: Note) => time(b.created_at) - time(a.created_at);

/**
 * The bin holds what was deleted, newest deletion first; «В деле» — what a note
 * became; the rest is the working feed, pinned on top.
 */
export function splitNotes(notes: readonly Note[]): NotePiles {
  const active: Note[] = [];
  const converted: Note[] = [];
  const trash: Note[] = [];
  for (const note of notes) {
    if (note.deleted_at !== null) trash.push(note);
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

/** Case-insensitive substring over the text; an empty query keeps everything. */
export function filterNotes(notes: readonly Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...notes];
  return notes.filter((note) => note.text.toLowerCase().includes(needle));
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

export type NoteGroupKey = "pinned" | "today" | "yesterday" | "week" | "month" | `m-${number}-${number}` | `y-${number}`;

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
 * The feed filed the way a notes app files it: pinned, today, yesterday, the last 7
 * and 30 days, then the months of this year and whole earlier years. The input order
 * is kept inside a group, so `splitNotes` decides who comes first.
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
  return groups;
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
/* The display                                                                  */
/* -------------------------------------------------------------------------- */

export type NoteFilter = "active" | "converted" | "trash";

export type NotesSummary = { eyebrow: string; headline: string; line: string; second: string };

/** What the display says while nothing is being recorded: the chosen pile, in numbers. */
export function notesSummary(piles: NotePiles, filter: NoteFilter, now: Date): NotesSummary {
  if (filter === "converted") {
    const tasks = piles.converted.filter((note) => note.converted_task_id !== null).length;
    const announcements = piles.converted.length - tasks;
    const parts = [
      tasks > 0 ? `${tasks} ${pluralRu(tasks, ["задача", "задачи", "задач"])}` : "",
      announcements > 0 ? `${announcements} ${pluralRu(announcements, ["объявление", "объявления", "объявлений"])}` : "",
    ].filter(Boolean);
    return {
      eyebrow: "В деле",
      headline: piles.converted.length > 0 ? `${piles.converted.length} в деле` : "Пока ничего",
      line: parts.length > 0 ? parts.join(" · ") : "Сюда уходит заметка,",
      second: parts.length > 0 ? "Что стало с мыслью — на карточке" : "ставшая задачей или объявлением",
    };
  }

  if (filter === "trash") {
    const count = piles.trash.length;
    return {
      eyebrow: "Корзина",
      headline: count > 0 ? `${count} в корзине` : "Корзина пуста",
      line: count > 0 ? "Вернуть можно в любой момент" : "Удалённая заметка ждёт здесь,",
      second: count > 0 ? "Голос и текст на месте" : "пока её не удалят навсегда",
    };
  }

  const { active } = piles;
  if (active.length === 0) {
    return { eyebrow: "Заметки", headline: "Пусто", line: "Нажми микрофон и скажи мысль —", second: "запишу слово в слово" };
  }

  const pinned = active.filter((note) => note.pinned).length;
  const latest = active.reduce((a, b) => (time(b.created_at) > time(a.created_at) ? b : a));
  const weekStart = aqtobeDay(now) - 6;
  const week = active.filter((note) => aqtobeDay(new Date(note.created_at)) >= weekStart).length;
  const voiced = active.filter((note) => note.audio_path !== null).length;

  return {
    eyebrow: "Заметки",
    headline: `${active.length} ${pluralRu(active.length, ["заметка", "заметки", "заметок"])}`,
    line: [
      pinned > 0 ? `${pinned} ${pluralRu(pinned, ["закреплена", "закреплены", "закреплено"])}` : "",
      `последняя ${whenRu(latest.created_at, now)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    second: [`${week} за 7 дней`, voiced > 0 ? `${voiced} голосом` : ""].filter(Boolean).join(" · "),
  };
}
