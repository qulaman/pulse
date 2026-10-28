"use client";

import { useRef } from "react";

import { Clock } from "@/components/ui/datetime/Clock";
import { ClockIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { useGlidingState } from "@/components/ui/motion";
import { shortHm } from "@/lib/daily-report/format";
import type { Hm } from "@/lib/datetime/calendar";

type Which = "arrived" | "left";

/**
 * «Пришёл» and «Ушёл» side by side, one clock under both across the full width — the pair
 * shape of DateTimeField: a clock squeezed into half a row is a thumb's worth of wrong hour.
 * The hour keeps the clock open, the minute (or the same hour again) closes it.
 */
export function TimePair({
  arrived,
  left,
  onArrived,
  onLeft,
  disabled = false,
}: {
  arrived: Hm | null;
  left: Hm | null;
  onArrived: (hm: Hm) => void;
  onLeft: (hm: Hm) => void;
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useGlidingState<Which | null>(null, box);
  useDismiss(open !== null, () => setOpen(null), box);

  const toggle = (which: Which) => {
    if (disabled) return;
    setOpen((was) => (was === which ? null : which));
  };
  const value = open === "arrived" ? arrived : left;

  return (
    <div ref={box}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 px-1 text-[13px] leading-4 text-muted">Пришёл</p>
          <PickerTrigger
            open={open === "arrived"}
            onClick={() => toggle("arrived")}
            label="Пришёл"
            placeholder="Время"
            value={arrived ? shortHm(arrived) : null}
            icon={<ClockIcon />}
          />
        </div>
        <div>
          <p className="mb-1 px-1 text-[13px] leading-4 text-muted">Ушёл</p>
          <PickerTrigger
            open={open === "left"}
            onClick={() => toggle("left")}
            label="Ушёл"
            placeholder="Время"
            value={left ? shortHm(left) : null}
            icon={<ClockIcon />}
          />
        </div>
      </div>

      {open ? (
        <PickerPanel>
          <Clock
            key={open}
            value={value}
            onPick={(hm) => {
              (open === "arrived" ? onArrived : onLeft)(hm);
              if (value && value.slice(0, 2) === hm.slice(0, 2)) setOpen(null);
            }}
          />
        </PickerPanel>
      ) : null}
    </div>
  );
}
