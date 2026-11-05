import type { CompanyRow } from "@/lib/ops/contract";

/** A queue older than this means the minute tick has stopped reaching the company. */
const QUEUE_ALARM_SECONDS = 600;

export function queueStuck(company: Pick<CompanyRow, "queue_age_seconds">): boolean {
  return (company.queue_age_seconds ?? 0) > QUEUE_ALARM_SECONDS;
}

/** The company needs a look: parsing errors, failed deliveries, or a queue that stopped moving. */
export function isAlarmed(company: Pick<CompanyRow, "parse_errors_24h" | "failed_7d" | "queue_age_seconds">): boolean {
  return company.parse_errors_24h > 0 || company.failed_7d > 0 || queueStuck(company);
}

/** Why a company asks for attention, in words; null when it does not. */
export function alarmWhy(company: Pick<CompanyRow, "parse_errors_24h" | "failed_7d" | "queue_age_seconds">): string | null {
  const parts: string[] = [];
  if (company.parse_errors_24h > 0) parts.push(`ошибок разбора: ${company.parse_errors_24h}`);
  if (queueStuck(company)) parts.push(`очередь стоит ${ageLabel(company.queue_age_seconds ?? 0)}`);
  if (company.failed_7d > 0) parts.push(`не дошло: ${company.failed_7d}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** «40 с», «12 мин», «3 ч»: how long the oldest item has waited. */
export function ageLabel(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600)} ч`;
}
