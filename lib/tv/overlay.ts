import { pluralRu } from "@/lib/tasks/status-text";
import { waitedSince } from "@/lib/visits/text";

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
  | { kind: "event"; id: string; title: string; detail: string };

export type OverlayPill = { kind: "visit-wait"; id: string; text: string };

export type OverlayView = { banner: OverlayBanner | null; pill: OverlayPill | null };

/** За сколько минут стена говорит о мероприятии надписью. */
export const EVENT_SOON_MIN = 15;
/** Сколько надпись о мероприятии держится — минуту в начале окна и минуту на старте. */
const EVENT_SHOW_MS = 60_000;

/** «только что», «3 мин», «1 ч 5 мин» — сколько человек ждёт; то же слово, что у телефонов. */
export const waited = waitedSince;

function eventDetail(event: TvEventRow): string {
  const people = event.people > 0 ? `${event.people} чел.` : null;
  return [event.title?.trim() || "Мероприятие", event.location?.trim() || null, people].filter(Boolean).join(" · ");
}

function eventBanner(events: readonly TvEventRow[], now: Date): OverlayBanner | null {
  const at = now.getTime();
  for (const event of events) {
    const start = new Date(event.starts_at).getTime();
    const soonFrom = start - EVENT_SOON_MIN * 60_000;
    if (at >= soonFrom && at < soonFrom + EVENT_SHOW_MS) {
      const minutes = Math.max(1, Math.ceil((start - at) / 60_000));
      return {
        kind: "event",
        id: event.id,
        title: `Через ${minutes} ${pluralRu(minutes, ["минуту", "минуты", "минут"])}`,
        detail: eventDetail(event),
      };
    }
    if (at >= start && at < start + EVENT_SHOW_MS) {
      return { kind: "event", id: event.id, title: "Начинается", detail: eventDetail(event) };
    }
  }
  return null;
}

/** «только что», «3 мин назад» — когда секретарь написал. */
function sentAgo(fromIso: string, now: Date): string {
  const ago = waited(fromIso, now);
  return ago === "только что" ? ago : `${ago} назад`;
}

export function overlayOf(overlay: TvOverlay | null | undefined, events: readonly TvEventRow[], now: Date): OverlayView {
  const visit = overlay?.visit ?? null;
  const message = overlay?.message ?? null;

  if (visit?.status === "waiting") {
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

  const pill: OverlayPill | null =
    visit?.status === "wait"
      ? { kind: "visit-wait", id: visit.id, text: `Посетитель ждёт · ${waited(visit.created_at, now)}` }
      : null;

  if (message) {
    return {
      banner: {
        kind: "message",
        id: message.id,
        title: "Сообщение от секретаря",
        // a guest in the office: the words stay on the director's phone (D-33)
        text: message.note?.trim() || null,
        since: sentAgo(message.created_at, now),
        more: Math.max(0, (overlay?.messages ?? 1) - 1),
      },
      pill,
    };
  }

  return { banner: eventBanner(events, now), pill };
}
