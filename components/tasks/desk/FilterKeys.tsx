"use client";

import { Dot, Key } from "@/components/ui/device/Device";

export type Filter = "active" | "review" | "closed";

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "В работе" },
  { key: "review", label: "На приёмке" },
  { key: "closed", label: "Закрытые" },
];

/**
 * Which pile the list below shows — three keys on the body, the count printed on each
 * face and a dot under the lit one, like the scenes on the TV remote. No «Все»: a list of
 * everything was the one nobody read (D-80).
 */
export function FilterKeys({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (next: Filter) => void;
}) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Какие задачи показать">
        {FILTERS.map((filter) => (
          <Key key={filter.key} on={value === filter.key} data-testid={`filter-${filter.key}`} onClick={() => onChange(filter.key)}>
            <span>{filter.label}</span>
            <span className="nums text-[12px] leading-4 opacity-70">{counts[filter.key]}</span>
          </Key>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {FILTERS.map((filter) => (
          <span key={filter.key} className="flex justify-center">
            <Dot on={value === filter.key} />
          </span>
        ))}
      </div>
    </div>
  );
}
