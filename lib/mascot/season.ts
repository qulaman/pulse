import { toAqtobeIso } from "@/lib/ai/time";

/**
 * The holidays the faces dress for (D-119): a hat for the New Year, a tulip for Наурыз. The
 * calendar is the company's wall clock (Asia/Aqtobe); the switch is `company.settings.mascot_seasons`
 * (on unless turned off in «Настройки → Программа»).
 */
export type MascotSeason = "new_year" | "nauryz";

/** Month and day on the Aqtobe wall clock, as "MM-DD" — string order is calendar order. */
function monthDay(now: Date): string {
  return toAqtobeIso(now).slice(5, 10);
}

/** New Year from December 20 to January 7; Наурыз from March 20 to March 23; otherwise none. */
export function seasonOf(now: Date): MascotSeason | null {
  const md = monthDay(now);
  if (md >= "12-20" || md <= "01-07") return "new_year";
  if (md >= "03-20" && md <= "03-23") return "nauryz";
  return null;
}
