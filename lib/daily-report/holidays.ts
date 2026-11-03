/**
 * Kazakhstan's public holidays with a fixed date (D-155 §7): what «+ Праздники Казахстана» puts
 * into `settings.daily_report.holidays`. Курбан айт (lunar) and the government's moved days off
 * change every year — the director adds those himself.
 */
import { ymdOf, type Ymd } from "@/lib/datetime/calendar";

/** [month, day] of every fixed-date holiday, in calendar order. */
const KZ_FIXED: readonly (readonly [number, number])[] = [
  [1, 1], // Новый год
  [1, 2],
  [1, 7], // Рождество
  [3, 8], // Международный женский день
  [3, 21], // Наурыз
  [3, 22],
  [3, 23],
  [5, 1], // Праздник единства народа Казахстана
  [5, 7], // День защитника Отечества
  [5, 9], // День Победы
  [7, 6], // День столицы
  [8, 30], // День Конституции
  [10, 25], // День Республики
  [12, 16], // День Независимости
];

/** The fixed-date holidays of a year as "YYYY-MM-DD", in order. */
export function kzFixedHolidays(year: number): Ymd[] {
  return KZ_FIXED.map(([month, day]) => ymdOf(year, month, day));
}
