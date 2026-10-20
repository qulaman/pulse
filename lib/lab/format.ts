/** The lab's numbers in one style (D-63, D-138): the models tab, the parser tab and its API. */

export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  return value < 0.001 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`;
}

/** A share as «97,6 %». */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")} %`;
}

/** «20.10, 14:05» on the company's wall clock. */
export function whenAqtobe(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Asia/Aqtobe",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
