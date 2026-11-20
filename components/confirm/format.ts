import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";
import { atAqtobe, toAqtobeIso } from "@/lib/ai/time";
import { aqtobeIsoToYmdHm } from "@/lib/datetime/calendar";
import { pluralRu } from "@/lib/tasks/status-text";

/** @deprecated moved — import `pluralRu` from "@/lib/tasks/status-text". */
export { pluralRu };

/** "14.08 13:00" on the Aqtobe clock — the year is noise on a deadline chip. */
export function formatDeadline(iso: string): string {
  const at = aqtobeIsoToYmdHm(iso);
  if (!at) return iso;
  const [, month, day] = at.ymd.split("-");
  return `${day}.${month} ${at.hm}`;
}

/** Aqtobe wall-clock fields as an ISO string with the explicit offset the parser uses. */
export function aqtobeIsoAt(dayShift: number, hours: number, minutes: number, now = new Date()): string {
  return toAqtobeIso(atAqtobe(now, dayShift, hours, minutes));
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
