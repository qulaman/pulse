import type { ReactNode } from "react";

/**
 * One cell of a company's numbers (`.ops-stats`): a word and a value read at a glance. A zero is
 * grey and never coloured: only a number that says something takes its tone, and the cell with it.
 */
export function OpsStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "danger" }) {
  const quiet = value === 0 || value === "0";
  const color = tone && !quiet ? tone : undefined;
  return (
    <div className="ops-stat" data-quiet={quiet ? "" : undefined} data-tone={color} data-testid="stat-tile">
      <span className="ops-stat-label" title={label}>
        {label}
      </span>
      <span className="ops-stat-value nums" style={color ? { color: `var(--${color})` } : undefined}>
        {value}
      </span>
    </div>
  );
}
