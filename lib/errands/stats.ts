import type { Errand } from "@/lib/errands/queries";
import { firstNameOf } from "@/lib/text/normalize";

export type ErrandTally = { name: string; taken: number; done: number; declined: number };

/**
 * Кто сколько заявок взял за период (экран /secretary у директора). Считаем по тому,
 * кто нажал «Принял»: заявка, которую никто не взял, в таблицу людей не попадает —
 * она видна в общем счётчике «не взяли».
 */
export function tallyByPerson(rows: readonly Errand[]): ErrandTally[] {
  const map = new Map<string, ErrandTally>();
  for (const row of rows) {
    if (!row.claimed_by) continue;
    const name = firstNameOf(row.claimed?.full_name ?? "") || "Секретарь";
    const tally = map.get(row.claimed_by) ?? { name, taken: 0, done: 0, declined: 0 };
    tally.taken += 1;
    if (row.status === "done") tally.done += 1;
    if (row.status === "declined") tally.declined += 1;
    map.set(row.claimed_by, tally);
  }
  return [...map.values()].sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name, "ru"));
}

/**
 * Среднее «попросил → готово», в минутах. Только закрытые заявки: у брошенной нет
 * второго конца, и включать её означало бы хвалить за то, чего не сделали.
 */
export function averageDoneMinutes(rows: readonly Errand[]): number | null {
  const spans = rows
    .filter((row) => row.status === "done" && row.done_at)
    .map((row) => (new Date(row.done_at!).getTime() - new Date(row.created_at).getTime()) / 60_000)
    .filter((minutes) => minutes >= 0);
  if (spans.length === 0) return null;
  return Math.round(spans.reduce((sum, m) => sum + m, 0) / spans.length);
}

/** «3 мин» / «1 ч 5 мин» — время, а не число. */
export function humanMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** Сколько просьб так и остались без ответа: единственная цифра, которую стоит чинить. */
export function unclaimedCount(rows: readonly Errand[]): number {
  return rows.filter((row) => !row.claimed_by && (row.status === "cancelled" || row.status === "sent")).length;
}
