"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/datetime/DateTimeField";
import { Sheet } from "@/components/ui/Sheet";
import { aqtobeIsoAt } from "@/components/confirm/format";

type Props = {
  open: boolean;
  onClose: () => void;
  currentIso: string | null;
  onPick: (iso: string) => void;
};

/**
 * When a meeting starts (D-78). The deadline sheet's twin, with one difference that
 * matters: «Без срока» is missing — a meeting without a time is not a meeting, and the
 * card stays blocked until the director picks one.
 */
const PRESETS: { label: string; iso: () => string }[] = [
  { label: "Сегодня 15:00", iso: () => aqtobeIsoAt(0, 15, 0) },
  { label: "Завтра 9:00", iso: () => aqtobeIsoAt(1, 9, 0) },
  { label: "Завтра 14:00", iso: () => aqtobeIsoAt(1, 14, 0) },
];

export function WhenSheet({ open, onClose, currentIso, onPick }: Props) {
  const choose = (iso: string) => {
    onPick(iso);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Когда?">
      {/* born with the sheet, so the picker starts from the time the event has right now */}
      <WhenBody currentIso={currentIso} onChoose={choose} />
    </Sheet>
  );
}

function WhenBody({ currentIso, onChoose }: { currentIso: string | null; onChoose: (iso: string) => void }) {
  const [custom, setCustom] = useState<string | null>(currentIso);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} variant="secondary" onClick={() => onChoose(preset.iso())}>
            {preset.label}
          </Button>
        ))}
      </div>

      <p className="mt-4 text-[13px] leading-4 text-muted">Своя дата</p>
      <div className="mt-1">
        <DateTimeField value={custom} onChange={setCustom} defaultHm="10:00" />
      </div>
      <div className="mt-2">
        <Button block disabled={custom === null || custom === currentIso} onClick={() => onChoose(custom as string)}>
          Готово
        </Button>
      </div>
    </>
  );
}
