import type { CalendarEvent } from "@/lib/calendar/queries";

import { CAST, ROSTER } from "../fixtures/people";

/** The sandbox director and the employee the «Сотрудник» view is: ids of the cast, not real rows. */
export const DIRECTOR = CAST.director.id;
export const MARAT = CAST.marat.id;
export { ROSTER };

const nameOf = (id: string) => ROSTER.find((person) => person.id === id)?.full_name ?? "Сотрудник";

type Who = [id: string, status: "going" | "invited" | "declined", reason?: string];

const MIN = 60_000;

/** An instant on the Aqtobe clock: `days` from today at hh:mm. */
function atDay(now: Date, days: number, hm: string): string {
  const wall = new Date(now.getTime() + 5 * 60 * MIN);
  const [h, m] = hm.split(":").map(Number);
  const day = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + days, h - 5, m));
  return day.toISOString();
}

/** An instant so many minutes from now, on a round five minutes. */
function fromNow(now: Date, minutes: number): string {
  const t = new Date(now.getTime() + minutes * MIN);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(Math.round(t.getUTCMinutes() / 5) * 5);
  return t.toISOString();
}

function meeting(
  id: string,
  title: string,
  starts_at: string,
  ends_at: string | null,
  location: string | null,
  who: Who[],
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  const people: Who[] = [[DIRECTOR, "going"], ...who];
  return {
    id,
    company_id: "fx-company",
    author_id: DIRECTOR,
    title,
    body: null,
    location,
    starts_at,
    ends_at,
    remind_before_min: 30,
    everyone: false,
    reminded_at: null,
    cancelled_at: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    created_at: starts_at,
    updated_at: starts_at,
    participants: people.map(([user_id, status, reason]) => ({
      event_id: id,
      user_id,
      status,
      reason: reason ?? null,
      responded_at: null,
      created_at: starts_at,
      person: { full_name: nameOf(user_id) },
    })),
    ...extra,
  } as CalendarEvent;
}

const everyone = (overrides: Record<string, Who[1]> = {}, reasons: Record<string, string> = {}): Who[] =>
  ROSTER.filter((person) => person.id !== DIRECTOR).map((person) => [
    person.id,
    overrides[person.id] ?? "going",
    reasons[person.id],
  ]);

/** A believable fortnight around now: a morning meeting that is over, one on, one soon, the week ahead. */
export function buildEvents(now: Date): CalendarEvent[] {
  return [
    meeting("fx-e1", "Обучение по охране труда", atDay(now, -3, "14:00"), atDay(now, -3, "15:30"), "Актовый зал", everyone()),
    meeting("fx-e2", "Планёрка отдела продаж", atDay(now, 0, "09:00"), atDay(now, 0, "09:30"), "Переговорка 1", [
      [MARAT, "going"],
      [CAST.aigul.id, "going"],
    ]),
    meeting("fx-e3", "Созвон с «Казхромом» по поставке", fromNow(now, -25), fromNow(now, 35), "Zoom", [
      [MARAT, "going"],
      [CAST.erlan.id, "going"],
      [CAST.dana.id, "invited"],
    ]),
    meeting(
      "fx-e4",
      "Встреча с поставщиком арматуры",
      fromNow(now, 12),
      fromNow(now, 72),
      "Офис, 3 этаж",
      [
        [MARAT, "invited"],
        [CAST.askhat.id, "going"],
        [CAST.madi.id, "going"],
      ],
      { body: "Сверить цены на А500С, условия отсрочки. Взять акт сверки за август." },
    ),
    meeting(
      "fx-e5",
      "Разбор недели",
      atDay(now, 0, "17:00"),
      atDay(now, 0, "18:00"),
      "Переговорка 1",
      everyone({ [CAST.timur.id]: "declined", [CAST.saule.id]: "invited", [CAST.dana.id]: "invited" }, { [CAST.timur.id]: "Буду в отъезде" }),
      { everyone: true },
    ),
    meeting("fx-e6", "Выезд на объект «Жубанова 12»", atDay(now, 1, "10:00"), atDay(now, 1, "12:30"), "ЖК «Жубанова»", [
      [MARAT, "invited"],
      [CAST.askhat.id, "going"],
      [CAST.timur.id, "going"],
    ]),
    meeting("fx-e7", "Приёмка сметы с ПТО", atDay(now, 1, "15:00"), null, null, [[CAST.madi.id, "going"]]),
    meeting("fx-e8", "Корпоратив ко Дню строителя", atDay(now, 2, "19:00"), atDay(now, 2, "23:00"), "Ресторан «Дастархан»", everyone(), {
      everyone: true,
    }),
    meeting("fx-e9", "Совещание в акимате", atDay(now, 5, "11:00"), atDay(now, 5, "12:00"), "Акимат, каб. 214", [
      [CAST.dana.id, "going"],
      [MARAT, "declined", "Занят срочным"],
    ]),
    meeting("fx-e10", "Планёрка", atDay(now, 7, "09:00"), atDay(now, 7, "09:30"), "Переговорка 1", everyone(), { everyone: true }),
    meeting("fx-e11", "Аудит склада", atDay(now, 12, "10:00"), atDay(now, 12, "13:00"), "Склад №2", [[CAST.erlan.id, "going"]]),
  ];
}

/** What the employee sees: only the meetings he is on (RLS does the same on the server). */
export function visibleTo(events: CalendarEvent[], meId: string): CalendarEvent[] {
  return meId === DIRECTOR ? events : events.filter((event) => event.participants.some((p) => p.user_id === meId));
}

/** ?many=1 — a crowded month: three meetings a day for three weeks, to see «Показать ещё». */
export function buildMany(now: Date): CalendarEvent[] {
  const titles = ["Планёрка", "Созвон с поставщиком", "Разбор объекта"];
  const list: CalendarEvent[] = [];
  for (let day = 0; day < 21; day++) {
    titles.forEach((title, i) => {
      const hour = String(9 + i * 3).padStart(2, "0");
      list.push(meeting(`fx-m${day}-${i}`, title, atDay(now, day, `${hour}:00`), atDay(now, day, `${hour}:45`), "Переговорка 1", [[MARAT, "going"]]));
    });
  }
  return list;
}
