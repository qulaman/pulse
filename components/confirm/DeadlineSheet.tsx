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
  onPick: (iso: string | null) => void;
  /** «Срок для Ерлана» when a reassign asks for one (D-129); «Срок» otherwise */
  title?: string;
  /** a line above the presets: why the sheet asks */
  hint?: string | null;
};

/** Presets from docs/FRONTEND.md; everything else через календарь. */
const PRESETS: { label: string; iso: () => string | null }[] = [
  { label: "Сегодня 18:00", iso: () => aqtobeIsoAt(0, 18, 0) },
  { label: "Завтра 9:00", iso: () => aqtobeIsoAt(1, 9, 0) },
  { label: "Завтра 13:00", iso: () => aqtobeIsoAt(1, 13, 0) },
  { label: "Без срока", iso: () => null },
];

export function DeadlineSheet({ open, onClose, currentIso, onPick, title = "Срок", hint }: Props) {
  const choose = (iso: string | null) => {
    onPick(iso);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {hint ? <p className="-mt-1 mb-3 text-[14px] leading-[19px] text-muted">{hint}</p> : null}
      {/* the body lives inside the sheet so it is born with it: the picker then starts
          from the deadline this task has right now, not from the one it had at boot */}
      <DeadlineBody currentIso={currentIso} onChoose={choose} />
    </Sheet>
  );
}

function DeadlineBody({ currentIso, onChoose }: { currentIso: string | null; onChoose: (iso: string | null) => void }) {
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
        <DateTimeField value={custom} onChange={setCustom} />
      </div>
      <div className="mt-2">
        <Button block disabled={custom === null || custom === currentIso} onClick={() => onChoose(custom)}>
          Готово
        </Button>
      </div>
    </>
  );
}
