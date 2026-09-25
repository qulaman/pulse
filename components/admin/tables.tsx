"use client";

import { Chip } from "@/components/ui/Chip";
import { ADMIN_TABLES } from "@/lib/admin/tables";

/**
 * One chip per table of «Данные» — the page's and the skeleton's same chrome (D-122); without
 * `onPick` they are only a picture of themselves.
 */
export function TableChips({ active, onPick }: { active: string; onPick?: (table: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {ADMIN_TABLES.map((t) => (
        <Chip key={t.table} tone={t.table === active ? "accent" : "neutral"} disabled={!onPick} onClick={() => onPick?.(t.table)}>
          {t.title}
        </Chip>
      ))}
    </div>
  );
}
