"use client";

import { Chip } from "@/components/ui/Chip";
import type { RatingPeriod } from "@/lib/points/queries";

const PERIODS: { key: RatingPeriod; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "all", label: "Всё время" },
];

/**
 * The rating's period switch. The screen's chrome, so the skeleton draws it too (D-122):
 * without `onChange` the chips are a picture of themselves, on the week the page opens on.
 */
export function PeriodChips({ value, onChange }: { value: RatingPeriod; onChange?: (period: RatingPeriod) => void }) {
  return (
    <div className="flex gap-2">
      {PERIODS.map((p) => (
        <Chip key={p.key} tone={value === p.key ? "accent" : "neutral"} disabled={!onChange} onClick={() => onChange?.(p.key)}>
          {p.label}
        </Chip>
      ))}
    </div>
  );
}
