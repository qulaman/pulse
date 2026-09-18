"use client";

import { useState } from "react";

import { Clock } from "@/components/ui/datetime/Clock";
import { ClockIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { parseHm, type Hm } from "@/lib/datetime/calendar";

type Props = {
  value: Hm | null;
  onChange: (hm: Hm) => void;
  step?: number;
  label?: string;
  placeholder?: string;
};

/**
 * A time, chosen from our own clock. The hour leaves the panel open — the minute is
 * usually the next tap — and the minute closes it, which makes «:00» the confirm.
 */
export function TimeField({ value, onChange, step, label = "Время", placeholder = "Выбрать время" }: Props) {
  const [open, setOpen] = useState(false);
  const box = useDismiss(open, () => setOpen(false));
  const before = parseHm(value);

  return (
    <div ref={box}>
      <PickerTrigger
        open={open}
        onClick={() => setOpen((was) => !was)}
        label={label}
        placeholder={placeholder}
        value={value}
        icon={<ClockIcon />}
      />
      {open ? (
        <PickerPanel>
          <Clock
            value={value}
            step={step}
            onPick={(hm) => {
              onChange(hm);
              const after = parseHm(hm);
              if (before && after && before.hours === after.hours) setOpen(false);
            }}
          />
        </PickerPanel>
      ) : null}
    </div>
  );
}
