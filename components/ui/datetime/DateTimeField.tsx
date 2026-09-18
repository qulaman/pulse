"use client";

import { useState } from "react";

import { Calendar } from "@/components/ui/datetime/Calendar";
import { Clock } from "@/components/ui/datetime/Clock";
import { CalendarIcon, ClockIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { aqtobeIsoToYmdHm, compactYmd, todayYmd, ymdHmToAqtobeIso, type Hm, type Ymd } from "@/lib/datetime/calendar";

type Props = {
  /** An instant with the Aqtobe offset written out, or nothing chosen yet. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** The default time a bare day gets, so picking a date alone already means something. */
  defaultHm?: Hm;
  minYmd?: Ymd | null;
  now?: Date;
};

/**
 * Day and time side by side — the pair a deadline is made of. The two triggers share one
 * panel across the full width: a calendar squeezed into half a row has 22px days, which
 * is a thumb's worth of wrong day.
 */
export function DateTimeField({ value, onChange, defaultHm = "18:00", minYmd, now }: Props) {
  const [open, setOpen] = useState<"day" | "time" | null>(null);
  const box = useDismiss(open !== null, () => setOpen(null));

  const parts = aqtobeIsoToYmdHm(value);
  const ymd = parts?.ymd ?? null;
  const hm = parts?.hm ?? null;
  const min = minYmd === undefined ? todayYmd(now) : minYmd;

  const toggle = (which: "day" | "time") => setOpen((was) => (was === which ? null : which));

  return (
    <div ref={box}>
      <div className="grid grid-cols-2 gap-2">
        <PickerTrigger
          open={open === "day"}
          onClick={() => toggle("day")}
          label="Дата"
          placeholder="Дата"
          value={ymd ? compactYmd(ymd, now) : null}
          icon={<CalendarIcon />}
        />
        <PickerTrigger
          open={open === "time"}
          onClick={() => toggle("time")}
          label="Время"
          placeholder="Время"
          value={hm}
          icon={<ClockIcon />}
        />
      </div>

      {open === "day" ? (
        <PickerPanel>
          <Calendar
            value={ymd}
            min={min}
            now={now}
            onPick={(day) => {
              onChange(ymdHmToAqtobeIso(day, hm ?? defaultHm));
              // the time is the natural next tap, and it is one panel away
              setOpen(hm ? null : "time");
            }}
          />
        </PickerPanel>
      ) : null}

      {open === "time" ? (
        <PickerPanel>
          <Clock
            value={hm}
            onPick={(time) => {
              onChange(ymdHmToAqtobeIso(ymd ?? todayYmd(now), time));
              if (hm && hm.slice(0, 2) === time.slice(0, 2)) setOpen(null);
            }}
          />
        </PickerPanel>
      ) : null}
    </div>
  );
}
