"use client";

import { useState } from "react";

import { Icon } from "@/components/tasks/icons";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/datetime/DateTimeField";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import { deadlineShifts, isAhead, sameInstant, sheetPresets } from "@/lib/tasks/deadline-choices";
import { flyInto } from "@/lib/ui/flyAway";

type Props = {
  open: boolean;
  onClose: () => void;
  currentIso: string | null;
  onPick: (iso: string | null) => void;
  /** «Срок для Ерлана» when a reassign asks for one (D-128); «Когда сдать?» otherwise */
  title?: string;
  /** a line above the choices: why the sheet asks */
  hint?: string | null;
  /** the task's title under the question, so the sheet says what it is about */
  subject?: string | null;
  /** «Без срока» is offered; by default only when there is a deadline to take away */
  none?: boolean;
  /** the task whose capsule (`data-deadline-target`) the chosen date flies into (D-187) */
  flyTo?: string;
  /** a task held for later: a deadline before it goes out would reach the person late (D-187) */
  after?: string | null;
};

/**
 * «Когда сдать?» — the deadline of a task (D-187): the deadline it has now, a step later than it
 * («+1 день» keeps the minute), four presets ahead of the clock (lib/tasks/deadline-choices — the
 * desk's picker takes the same), another date, and a quiet «Убрать срок». Every choice is ahead of
 * now: the evening that has passed is not offered, a date in the past cannot be sent. The current
 * deadline is outlined and changes nothing when tapped.
 */
export function DeadlineSheet({ open, onClose, currentIso, onPick, title = "Когда сдать?", hint, subject, none, flyTo, after }: Props) {
  const choose = (iso: string | null) => {
    // the deadline the task has already changes nothing; a sheet that starts from none (a handover's
    // «Срок для …») always answers — its «Без срока» is the choice that sends the task on
    if (currentIso === null || !sameInstant(iso, currentIso)) onPick(iso);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {subject ? <p className="-mt-1 mb-3 line-clamp-2 text-[14px] leading-[19px] text-muted">{subject}</p> : null}
      {hint ? <p className="-mt-1 mb-3 text-[14px] leading-[19px] text-muted">{hint}</p> : null}
      {/* the body lives inside the sheet so it is born with it: the choices count from this
          moment's clock and from the deadline the task has right now */}
      <DeadlineBody currentIso={currentIso} none={none ?? currentIso !== null} flyTo={flyTo} after={after ?? null} onChoose={choose} />
    </Sheet>
  );
}

/** The chosen date flies from its button into the task's capsule, which nods as it lands. */
function landOn(from: HTMLElement, taskId: string) {
  const capsule = document.querySelector<HTMLElement>(`[data-deadline-target="${CSS.escape(taskId)}"]`);
  if (!capsule) return;
  flyInto(from, capsule, {
    duration: 420,
    lifted: false,
    arrivesAs: Math.min(1, capsule.offsetWidth / Math.max(1, from.offsetWidth)),
    onLand: () => {
      capsule.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    },
  });
}

function DeadlineBody({
  currentIso,
  none,
  flyTo,
  after,
  onChoose,
}: {
  currentIso: string | null;
  none: boolean;
  flyTo?: string;
  after: string | null;
  onChoose: (iso: string | null) => void;
}) {
  const [now] = useState(() => new Date());
  // the earliest a deadline may be: now, or the moment a held task goes out
  const [floor] = useState(() => (after && isAhead(after, now) ? new Date(after) : now));
  const [shifts] = useState(() => deadlineShifts(currentIso, now).filter((shift) => isAhead(shift.iso, floor)));
  const [presets] = useState(() => sheetPresets(now).filter((preset) => isAhead(preset.iso, floor)));
  // a deadline already behind is no starting point: the field starts empty rather than in red
  const [custom, setCustom] = useState<string | null>(() => (isAhead(currentIso, floor) ? currentIso : null));

  const pick = (iso: string | null, from?: HTMLElement) => {
    haptic(10);
    // the copy is taken before the data moves: the capsule takes the new date as it lands
    if (from && flyTo && iso && !sameInstant(iso, currentIso)) landOn(from, flyTo);
    onChoose(iso);
  };
  const customReady = custom !== null && isAhead(custom, floor) && !sameInstant(custom, currentIso);

  return (
    <div data-testid="deadline-sheet">
      {currentIso ? (
        <p className="-mt-1 mb-3 flex items-center gap-1.5 text-[14px] leading-[19px] text-muted" data-testid="deadline-now">
          <Icon name="clock" size={14} />
          сейчас <span className="nums text-text">{humanAqtobe(new Date(currentIso), now)}</span>
        </p>
      ) : null}

      {/* the deadline moved by a step, its minute kept — «то же, но завтра» in one tap */}
      {shifts.length > 0 ? (
        <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${shifts.length}, minmax(0, 1fr))` }} data-testid="deadline-shifts">
          {shifts.map((shift) => (
            <button
              key={shift.label}
              type="button"
              onClick={(event) => pick(shift.iso, event.currentTarget)}
              className="btn-secondary flex min-h-[54px] flex-col items-center justify-center rounded-[12px] px-1 transition-transform duration-100 active:scale-[0.97]"
            >
              <span className="text-[15px] font-semibold leading-5">{shift.label}</span>
              <span className="nums text-[12px] leading-4 text-muted">{shift.result}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2" data-testid="deadline-presets">
        {presets.map((preset) => {
          const current = sameInstant(preset.iso, currentIso);
          return (
            <Button
              key={preset.label}
              variant="secondary"
              aria-pressed={current}
              className={current ? "!ring-2 !ring-accent/70" : ""}
              onClick={(event) => pick(preset.iso, event.currentTarget)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] leading-4 text-muted">Другая дата</p>
      <div className="mt-1">
        <DateTimeField value={custom} onChange={setCustom} now={now} />
      </div>
      {custom !== null && !isAhead(custom, floor) ? (
        <p className="mt-1 text-[13px] leading-4 text-danger">{isAhead(custom, now) ? "Задача уйдёт позже — выберите время после" : "Это время уже прошло"}</p>
      ) : null}
      <div className="mt-2">
        <Button block disabled={!customReady} onClick={(event) => pick(custom, event.currentTarget)} data-testid="deadline-custom">
          {customReady && custom ? `Назначить · ${humanAqtobe(new Date(custom), now)}` : "Назначить"}
        </Button>
      </div>

      {none ? (
        <button
          type="button"
          onClick={() => pick(null)}
          data-testid="deadline-none"
          className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-[12px] text-[14px] font-medium text-muted transition-colors duration-[120ms] active:bg-surface-2"
        >
          {currentIso ? "Убрать срок" : "Без срока"}
        </button>
      ) : null}
    </div>
  );
}
