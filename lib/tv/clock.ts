/**
 * Часы киоска. Asia/Aqtobe — фиксированный +05:00 без перехода на летнее время
 * (та же посылка, что в lib/ai/time.ts), поэтому арифметика тут своя и без библиотек.
 */

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
/** Ночной перезапуск экрана — 04:00 по Актобе (docs/FRONTEND.md «Appliance-чеклист»). */
const RELOAD_HOUR_MS = 4 * 3_600_000;

/** Миллисекунды до ближайших 04:00 по Актобе. */
export function msUntilNightReload(now: Date = new Date()): number {
  const sinceMidnight = (now.getTime() + AQTOBE_OFFSET_MS) % DAY_MS;
  return sinceMidnight < RELOAD_HOUR_MS
    ? RELOAD_HOUR_MS - sinceMidnight
    : DAY_MS - sinceMidnight + RELOAD_HOUR_MS;
}

const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long", day: "numeric", month: "long" });
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "short" });

export function tvTime(date: Date): string {
  return timeFmt.format(date);
}

export function tvDate(date: Date): string {
  return dateFmt.format(date);
}

/** «пн», «вт» — подпись столбца недельного графика. */
export function tvWeekday(date: Date): string {
  return weekdayFmt.format(date);
}

/** Часы, минуты и секунды по Актобе — для стрелок, без Intl на каждый кадр. */
export function aqtobeClock(date: Date): { h: number; m: number; s: number; ms: number } {
  const since = (date.getTime() + AQTOBE_OFFSET_MS) % DAY_MS;
  const h = Math.floor(since / 3_600_000);
  const m = Math.floor((since % 3_600_000) / 60_000);
  const s = Math.floor((since % 60_000) / 1000);
  return { h, m, s, ms: since % 1000 };
}

/**
 * Углы стрелок в градусах от «12» по часовой (D-96). Часовая и минутая идут плавно —
 * часовая сдвигается с минутами, минутная с секундами, как у настоящих часов.
 */
export function handAngles(date: Date): { hour: number; minute: number; second: number } {
  const { h, m, s, ms } = aqtobeClock(date);
  const seconds = s + ms / 1000;
  return {
    hour: ((h % 12) + m / 60 + seconds / 3600) * 30,
    minute: (m + seconds / 60) * 6,
    second: seconds * 6,
  };
}
