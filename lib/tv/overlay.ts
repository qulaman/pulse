import { pluralRu } from "@/lib/tasks/status-text";
import { waitedSince } from "@/lib/visits/text";

import { tvTime } from "./clock";
import type { TvEventRow, TvOverlay } from "./queries";

/**
 * Что висит поверх любой сцены стены (D-96) — чистой функцией. Посетитель важнее всего:
 * человек стоит у стола секретаря сейчас. Потом — сообщение секретаря (D-116), потом —
 * мероприятие, которое вот-вот начнётся. «Подождёт» — уже не надпись во всю стену, а тихая
 * плашка в углу: директор ответил, но человек всё ещё ждёт.
 *
 * «Пусть заходит» надпись просто убирает, как и «Не приму» (D-116 §1): стена висит в
 * кабинете, посетитель стоит в приёмной — «Заходите» на ней не видел никто.
 *
 * Негатива здесь нет (D-45): имя сотрудника на стену не попадает вовсе — только слова
 * секретаря, и те гостю не приезжают (D-33).
 */

export type OverlayBanner =
  | { kind: "visit"; id: string; title: string; note: string | null; since: string; more: number }
  | { kind: "message"; id: string; title: string; text: string | null; since: string; more: number }
  /** `minutes` counts down to the start; null — the meeting is starting now. */
  | { kind: "event"; id: string; minutes: number | null; title: string; untitled: boolean; place: string | null };

/**
 * The quiet plate under the channel mark: a visitor the director answered «подождёт», and — after
 * their first minute over the whole wall — a visitor still waiting or a secretary's message (D-185).
 */
export type OverlayPill = { kind: "visit-wait" | "visit" | "message"; id: string; text: string };

export type OverlayView = { banner: OverlayBanner | null; pill: OverlayPill | null };

/** За сколько минут стена говорит о мероприятии надписью. */
export const EVENT_SOON_MIN = 15;
/** Сколько надпись о мероприятии держится — минуту в начале окна и минуту на старте. */
const EVENT_SHOW_MS = 60_000;
/**
 * A visitor or a message holds the whole wall for its first minute — the chime rings, the room
 * looks up — then folds into the plate under the channel mark until it is answered (D-185): the
 * clock, the band and the scene come back.
 */
export const FULL_MS = 60_000;
/** A message longer than this does not fit the plate: the plate names it, the phone holds the words. */
const PILL_TEXT_MAX = 56;

/** «только что», «3 мин», «1 ч 5 мин» — сколько человек ждёт; то же слово, что у телефонов. */
export const waited = waitedSince;

/** A meeting without a title is a guest's view of it (D-33): the wall names it plainly. */
const UNTITLED = "Встреча";

/** «Переговорная, 8 человек» — where and how many, in words, no dots between them. */
function eventPlace(event: TvEventRow): string | null {
  const people = event.people > 0 ? `${event.people} ${pluralRu(event.people, ["человек", "человека", "человек"])}` : null;
  const parts = [event.location?.trim() || null, people].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function eventBanner(events: readonly TvEventRow[], now: Date): OverlayBanner | null {
  const at = now.getTime();
  for (const event of events) {
    const start = new Date(event.starts_at).getTime();
    const soonFrom = start - EVENT_SOON_MIN * 60_000;
    const title = event.title?.trim() || UNTITLED;
    if (at >= soonFrom && at < soonFrom + EVENT_SHOW_MS) {
      const minutes = Math.max(1, Math.ceil((start - at) / 60_000));
      return { kind: "event", id: event.id, minutes, title, untitled: !event.title?.trim(), place: eventPlace(event) };
    }
    if (at >= start && at < start + EVENT_SHOW_MS) {
      return { kind: "event", id: event.id, minutes: null, title, untitled: !event.title?.trim(), place: eventPlace(event) };
    }
  }
  return null;
}

/** «только что», «3 мин назад» — когда секретарь написал. */
function sentAgo(fromIso: string, now: Date): string {
  const ago = waited(fromIso, now);
  return ago === "только что" ? ago : `${ago} назад`;
}

/**
 * When the wall first saw each notice, by the kiosk's own clock (`TvScreen` keeps it). The first
 * minute over the whole wall — and the chime — count from that moment, not from when the notice was
 * made: a kiosk with a fast clock or one back from an outage still rings for a visitor. Without
 * it (the sandbox) the minute counts from `created_at`.
 */
export type SeenAt = ReadonlyMap<string, number>;

function fresh(id: string, createdAt: string, now: Date, seen: SeenAt | undefined): boolean {
  // not stamped yet: the wall sees it this very moment
  const from = seen ? (seen.get(id) ?? now.getTime()) : new Date(createdAt).getTime();
  return now.getTime() - from < FULL_MS;
}

/**
 * The notices to stamp as seen now. A visitor — the moment it appears. A message — only once no
 * visitor holds the whole wall: a note that came in while a person stood at the door gets its own
 * minute and its own chime after the visitor's, never lost behind it.
 */
export function noticesToStamp(overlay: TvOverlay | null | undefined, now: Date, seen: SeenAt): string[] {
  const visit = overlay?.visit ?? null;
  const message = overlay?.message ?? null;
  const stamp: string[] = [];
  let visitHolds = false;
  if (visit?.status === "waiting") {
    if (!seen.has(visit.id)) stamp.push(visit.id);
    visitHolds = fresh(visit.id, visit.created_at, now, seen);
  }
  if (message && !seen.has(message.id) && !visitHolds) stamp.push(message.id);
  return stamp;
}

export function overlayOf(overlay: TvOverlay | null | undefined, events: readonly TvEventRow[], now: Date, seen?: SeenAt): OverlayView {
  const visit = overlay?.visit ?? null;
  const message = overlay?.message ?? null;

  if (visit?.status === "waiting" && fresh(visit.id, visit.created_at, now, seen)) {
    return {
      banner: {
        kind: "visit",
        id: visit.id,
        title: "К вам посетитель",
        note: visit.note?.trim() || null,
        since: `ждёт ${waited(visit.created_at, now)}`.replace("ждёт только что", "только что"),
        more: Math.max(0, (overlay?.waiting ?? 1) - 1),
      },
      pill: null,
    };
  }

  // a visitor past the first minute, or one the director asked to wait: the plate counts the waiting
  const visitPill: OverlayPill | null = visit
    ? {
        kind: visit.status === "wait" ? "visit-wait" : "visit",
        id: visit.id,
        text: `Посетитель ждёт ${waited(visit.created_at, now)}`.replace("ждёт только что", "ждёт"),
      }
    : null;

  if (message) {
    // a guest in the office: the words stay on the director's phone (D-33) — the notice and the
    // chime still come, without the words
    const text = message.note?.trim() || null;
    if (fresh(message.id, message.created_at, now, seen)) {
      return {
        banner: {
          kind: "message",
          id: message.id,
          title: "Сообщение от секретаря",
          text: text ?? "Подробности — у вас в телефоне",
          since: sentAgo(message.created_at, now),
          more: Math.max(0, (overlay?.messages ?? 1) - 1),
        },
        pill: visitPill,
      };
    }
    const messageText = text && text.length <= PILL_TEXT_MAX ? `Секретарь: ${text}` : "Сообщение — подробности у вас в телефоне";
    // one plate: a person at the door first, and the plate still says a note is waiting
    const pill: OverlayPill = visitPill
      ? { ...visitPill, text: `${visitPill.text} · есть сообщение` }
      : { kind: "message", id: message.id, text: messageText };
    return { banner: eventBanner(events, now), pill };
  }

  return { banner: eventBanner(events, now), pill: visitPill };
}

/**
 * The next meeting as one line of a scene (D-185): «Сегодня», the clock. `when` is said only
 * when it helps — «через 25 мин» within the hour, «идёт» once it started, «завтра» for tomorrow's.
 */
export type MeetingLine = { time: string; when: string | null; title: string; place: string | null };

/** Within this many minutes the wall counts down to a meeting instead of naming its hour only. */
const MEETING_SOON_MIN = 60;
const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

function aqtobeDay(ms: number): number {
  return Math.floor((ms + AQTOBE_OFFSET_MS) / DAY_MS);
}

export function meetingOf(event: TvEventRow, now: Date): MeetingLine {
  const start = new Date(event.starts_at).getTime();
  const left = Math.ceil((start - now.getTime()) / 60_000);
  const days = aqtobeDay(start) - aqtobeDay(now.getTime());
  const when = left <= 0 ? "идёт" : left < MEETING_SOON_MIN ? `через ${left} мин` : days >= 1 ? "завтра" : null;
  return {
    time: tvTime(new Date(start)),
    when,
    title: event.title?.trim() || UNTITLED,
    place: event.location?.trim() || null,
  };
}
