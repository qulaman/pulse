/**
 * `settings.daily_report` as the person's phone reads it (the company row under RLS, D-219) — the
 * keys and defaults of `DailyReportSettingsSchema` (lib/settings.ts) for the five the day state
 * needs. Read here by hand: the whole settings schema is the desk's and the server's, not the
 * phone's bundle. A key that does not parse reads as its default. Pure, no imports but types.
 */
import { parseYmd, type Ymd } from "@/lib/datetime/calendar";
import type { ReportRules } from "@/lib/people/stats";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOrNull = (value: unknown): Ymd | null => (typeof value === "string" && DAY.test(value) ? value : null);

export function reportRulesOf(raw: unknown): ReportRules {
  const section = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const weekdays = Array.isArray(section.workdays)
    ? [...new Set(section.workdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b)
    : [];
  const holidays = Array.isArray(section.holidays)
    ? [...new Set(section.holidays.filter((day): day is string => typeof day === "string" && parseYmd(day) !== null))].sort()
    : [];
  return {
    enabled: typeof section.enabled === "boolean" ? section.enabled : true,
    workdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5],
    holidays,
    started_on: dayOrNull(section.started_on),
    checked_on: dayOrNull(section.checked_on),
  };
}
