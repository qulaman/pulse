"use client";

import { useState } from "react";

import { Calendar } from "@/components/ui/datetime/Calendar";
import { CalendarIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { compactYmd, humanYmd, type Ymd } from "@/lib/datetime/calendar";

type Props = {
  value: Ymd | null;
  onChange: (ymd: Ymd) => void;
  min?: Ymd | null;
  max?: Ymd | null;
  label?: string;
  placeholder?: string;
  /** Half-width field (a deadline pair): the day is shown as «21.09», not spelled out. */
  compact?: boolean;
  now?: Date;
};

/** A day, chosen from our own calendar. The panel closes on the pick — a day is one tap. */
export function DateField({ value, onChange, min, max, label = "Дата", placeholder = "Выбрать дату", compact = false, now }: Props) {
  const [open, setOpen] = useState(false);
  const box = useDismiss(open, () => setOpen(false));

  return (
    <div ref={box}>
      <PickerTrigger
        open={open}
        onClick={() => setOpen((was) => !was)}
        label={label}
        placeholder={placeholder}
        value={value ? (compact ? compactYmd(value, now) : humanYmd(value, now)) : null}
        icon={<CalendarIcon />}
      />
      {open ? (
        <PickerPanel>
          <Calendar
            value={value}
            min={min}
            max={max}
            now={now}
            onPick={(ymd) => {
              onChange(ymd);
              setOpen(false);
            }}
          />
        </PickerPanel>
      ) : null}
    </div>
  );
}
