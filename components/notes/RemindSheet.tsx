"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/datetime/DateTimeField";
import { Sheet } from "@/components/ui/Sheet";
import { toAqtobeIso } from "@/lib/ai/time";
import { remindPresets } from "@/lib/notes/list";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The reminder the note has now (still to ring or already rung), UTC ISO or null. */
  currentIso: string | null;
  /** A new moment, or null — «Не напоминать». */
  onPick: (iso: string | null) => void;
};

/**
 * «Напомнить» on a note (D-95): the usual moments in one tap, any other through the
 * calendar. A push comes at that minute, whatever the quiet hours — the director chose it.
 */
export function RemindSheet({ open, onClose, currentIso, onPick }: Props) {
  const choose = (iso: string | null) => {
    onPick(iso);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Напомнить">
      {/* born with the sheet: the picker starts from the reminder this note has right now */}
      <RemindBody currentIso={currentIso} onChoose={choose} />
    </Sheet>
  );
}

function RemindBody({ currentIso, onChoose }: { currentIso: string | null; onChoose: (iso: string | null) => void }) {
  const [now] = useState(() => new Date());
  const current = currentIso ? toAqtobeIso(new Date(currentIso)) : null;
  const [custom, setCustom] = useState<string | null>(current);
  const presets = remindPresets(now);
  const past = custom !== null && new Date(custom).getTime() <= now.getTime();

  return (
    <>
      <div className="grid grid-cols-2 gap-2" data-testid="remind-presets">
        {presets.map((preset) => (
          <Button key={preset.label} variant="secondary" onClick={() => onChoose(preset.at.toISOString())}>
            {preset.label}
          </Button>
        ))}
      </div>

      <p className="mt-4 text-[13px] leading-4 text-muted">Своё время</p>
      <div className="mt-1">
        <DateTimeField value={custom} onChange={setCustom} defaultHm="09:00" now={now} />
      </div>
      {past ? (
        <p className="mt-1.5 text-[13px] leading-4" style={{ color: "var(--warn)" }}>
          Это время уже прошло
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button block disabled={custom === null || custom === current || past} onClick={() => onChoose(custom)}>
          Готово
        </Button>
        {currentIso ? (
          <Button variant="secondary" block data-testid="remind-clear" onClick={() => onChoose(null)}>
            Не напоминать
          </Button>
        ) : null}
      </div>
    </>
  );
}
