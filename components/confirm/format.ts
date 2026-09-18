import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";

/** Aqtobe is +05:00 all year (docs/AI.md §2) — wall clock is plain arithmetic. */
const OFFSET_MS = 5 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

function wall(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

/** "14.08 13:00" — the year is noise on a deadline chip. */
export function formatDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const w = wall(date);
  return `${pad(w.getUTCDate())}.${pad(w.getUTCMonth() + 1)} ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** Aqtobe wall-clock fields as an ISO string with the explicit offset the parser uses. */
export function aqtobeIsoAt(dayShift: number, hours: number, minutes: number, now = new Date()): string {
  const w = wall(now);
  const at = new Date(
    Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + dayShift, hours, minutes, 0, 0),
  );
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:00+05:00`
  );
}

/** "2026-08-14T13:00" from <input type="datetime-local"> is Aqtobe wall clock by contract. */
export function localInputToAqtobeIso(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+05:00` : null;
}

export function aqtobeIsoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const w = wall(date);
  return (
    `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}` +
    `T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`
  );
}

export function pluralRu(count: number, forms: [string, string, string]): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = count % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const KIND_FORMS: Record<Entity["kind"], [string, string, string]> = {
  task: ["задача", "задачи", "задач"],
  announcement: ["объявление", "объявления", "объявлений"],
  reminder: ["напоминание", "напоминания", "напоминаний"],
  note: ["заметка", "заметки", "заметок"],
  event: ["мероприятие", "мероприятия", "мероприятий"],
  recurrence: ["повторяющаяся задача", "повторяющиеся задачи", "повторяющихся задач"],
  delegation: ["поручение", "поручения", "поручений"],
  points: ["начисление", "начисления", "начислений"],
  query: ["вопрос", "вопроса", "вопросов"],
};

const KIND_ORDER: Entity["kind"][] = [
  "task",
  "delegation",
  "announcement",
  "event",
  "reminder",
  "note",
  "recurrence",
  "query",
  "points",
];

/** "и" before the last item, commas before the rest — plain Russian, no lists (DESIGN §4). */
export function joinRu(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

/** "3 задачи и объявление" (docs/DESIGN.md §4): a single item drops the numeral. */
export function entitiesSummary(entities: PostprocessedEntity[]): string {
  const counts = new Map<Entity["kind"], number>();
  for (const entity of entities) counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);

  const parts = KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => {
    const count = counts.get(kind) as number;
    const word = pluralRu(count, KIND_FORMS[kind]);
    return count === 1 ? word : `${count} ${word}`;
  });

  return joinRu(parts);
}
