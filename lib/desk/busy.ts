import { aqtobeIsoToYmdHm, daysBetween, humanYmd, todayYmd, ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";

/**
 * When the director is busy, as the secretary sees it (owner, 2026-11-04; RPC `director_busy`):
 * spans of time, merged on the server, with no word about the meetings. What the desk draws of
 * them — blocks on the week of hours and one line by the «Посетитель» button. Pure functions over
 * the Aqtobe wall clock.
 */

export type BusySpan = { starts_at: string; ends_at: string };

/** A span on one day: minutes past the wall clock's midnight. */
export type BusyBlock = { start: number; end: number };

const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;

/** The spans cut to the days on screen, in order; a span across midnight stands on both days. */
export function busyByDay(spans: readonly BusySpan[], days: readonly Ymd[]): Map<Ymd, BusyBlock[]> {
  const map = new Map<Ymd, BusyBlock[]>();
  for (const ymd of days) {
    const midnight = Date.parse(ymdHmToAqtobeIso(ymd, "00:00") as string);
    const blocks: BusyBlock[] = [];
    for (const span of spans) {
      const start = Math.floor((Date.parse(span.starts_at) - midnight) / MINUTE_MS);
      const end = Math.ceil((Date.parse(span.ends_at) - midnight) / MINUTE_MS);
      if (end <= 0 || start >= DAY_MIN || end <= start) continue;
      blocks.push({ start: Math.max(0, start), end: Math.min(DAY_MIN, end) });
    }
    if (blocks.length > 0) map.set(ymd, blocks.sort((a, b) => a.start - b.start));
  }
  return map;
}

/** The minutes the week's grid has to hold for these blocks (`hourRange`'s `extra`). */
export function busyMinutes(byDay: ReadonlyMap<Ymd, readonly BusyBlock[]>): number[] {
  return [...byDay.values()].flat().flatMap((block) => [block.start, block.end - 1]);
}

/** «до 15:00», «до завтра 10:00», «до чт, 12 ноября». */
function untilWords(iso: string, now: Date): string {
  const at = aqtobeIsoToYmdHm(iso) as { ymd: Ymd; hm: string };
  const ahead = daysBetween(todayYmd(now), at.ymd);
  if (ahead <= 0) return `до ${at.hm}`;
  return ahead === 1 ? `до завтра ${at.hm}` : `до ${humanYmd(at.ymd, now)}`;
}

/**
 * The line by the «Посетитель» button: «Директор на встрече до 15:00», «Директор свободен до
 * 16:30»; with nothing more today — «Директор свободен».
 */
export function busyLine(spans: readonly BusySpan[], now: Date): { busy: boolean; text: string } {
  const at = now.getTime();
  const current = spans.find((span) => Date.parse(span.starts_at) <= at && at < Date.parse(span.ends_at));
  if (current) return { busy: true, text: `Директор на встрече ${untilWords(current.ends_at, now)}` };
  const today = todayYmd(now);
  const next = spans
    .map((span) => span.starts_at)
    .filter((start) => Date.parse(start) > at && aqtobeIsoToYmdHm(start)?.ymd === today)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return { busy: false, text: next ? `Директор свободен ${untilWords(next, now)}` : "Директор свободен" };
}
