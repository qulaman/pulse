"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { aqtobeIsoAt, aqtobeIsoToLocalInput, localInputToAqtobeIso } from "@/components/confirm/format";

type Props = {
  open: boolean;
  onClose: () => void;
  currentIso: string | null;
  onPick: (iso: string | null) => void;
};

/** Presets from docs/FRONTEND.md; everything else через календарь. */
const PRESETS: { label: string; iso: () => string | null }[] = [
  { label: "Сегодня 18:00", iso: () => aqtobeIsoAt(0, 18, 0) },
  { label: "Завтра 9:00", iso: () => aqtobeIsoAt(1, 9, 0) },
  { label: "Завтра 13:00", iso: () => aqtobeIsoAt(1, 13, 0) },
  { label: "Без срока", iso: () => null },
];

export function DeadlineSheet({ open, onClose, currentIso, onPick }: Props) {
  const [custom, setCustom] = useState(currentIso ? aqtobeIsoToLocalInput(currentIso) : "");

  const choose = (iso: string | null) => {
    onPick(iso);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Срок">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} variant="secondary" onClick={() => choose(preset.iso())}>
            {preset.label}
          </Button>
        ))}
      </div>

      <label className="mt-4 block text-[13px] leading-4 text-muted" htmlFor="deadline-custom">
        Своя дата
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="deadline-custom"
          type="datetime-local"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="min-h-[44px] flex-1 field px-3 text-[16px] leading-[22px] outline-none focus:border-accent"
        />
        <Button
          disabled={localInputToAqtobeIso(custom) === null}
          onClick={() => choose(localInputToAqtobeIso(custom))}
        >
          Готово
        </Button>
      </div>
    </Sheet>
  );
}
