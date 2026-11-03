/**
 * Numbers on the desk (D-154): thousands apart by a no-break space, a real minus sign, and
 * a sign only where it says something (points). Pure — the screens render, this one formats.
 */

// a no-break space: the narrow one comes out hair-thin in Manrope at 14 px and the groups merge
const THIN = " ";
const MINUS = "−";

/** 1000880 → «1 000 880», −30 → «−30»; `signed` puts «+» on a positive number (points). */
export function formatNum(value: number, { signed = false }: { signed?: boolean } = {}): string {
  const abs = Math.abs(Math.round(value));
  const digits = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  if (value < 0 && abs !== 0) return `${MINUS}${digits}`;
  if (signed && abs !== 0) return `+${digits}`;
  return digits;
}

/** The tone a points figure is drawn in: a gain is the reward's gold, a loss and nothing are quiet (DESIGN §1.3). */
export function pointsTone(value: number): "gold" | "muted" {
  return value > 0 ? "gold" : "muted";
}
