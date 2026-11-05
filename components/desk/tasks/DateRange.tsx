"use client";

import { useState, type KeyboardEvent } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { addMonths, isWithin, monthOf, type Month, type Ymd } from "@/lib/datetime/calendar";
import { daysWords, rangePresets, rangeWords, type DayRange } from "@/lib/desk/archive";
import { shiftYmd, wallYmd } from "@/lib/desk/tasks";

import { MonthGrid, PickerHead, useOwnFocus } from "./Pickers";

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * The days of a history: the quick choices under digits, or two days of a month — the first press
 * starts the range, the second ends it, the same day twice is that one day. The arrows walk the
 * days and Enter presses the one they stand on. History has no future: the days ahead are off.
 */
function RangePicker({ value, now, onPick }: { value: DayRange | null; now: Date; onPick: (range: DayRange | null) => void }) {
  const today = wallYmd(now);
  const [start, setStart] = useState<Ymd | null>(null);
  const [hovered, setHovered] = useState<Ymd | null>(null);
  const [cursor, setCursor] = useState<Ymd | null>(null);
  const [month, setMonth] = useState<Month>(() => monthOf(value?.to ?? value?.from ?? today, now));
  const box = useOwnFocus<HTMLDivElement>();
  const presets = rangePresets(now);
  const choices = value ? [...presets, null] : presets;

  const press = (day: Ymd) => {
    if (!start) {
      setStart(day);
      setCursor(day);
      return;
    }
    onPick(start <= day ? { from: start, to: day } : { from: day, to: start });
  };

  // the range being drawn, else the one in force
  const reach = start ? (hovered ?? cursor ?? start) : null;
  const low = start && reach ? (start <= reach ? start : reach) : (value?.from ?? null);
  const high = start && reach ? (start <= reach ? reach : start) : (value?.to ?? null);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^Digit[1-9]$/.test(event.code)) {
      const choice = choices[Number(event.code.slice(5)) - 1];
      if (choice === undefined) return;
      event.preventDefault();
      onPick(choice ? { from: choice.from, to: choice.to } : null);
      return;
    }
    if (event.code in STEP) {
      event.preventDefault();
      const next = shiftYmd(cursor ?? start ?? today, cursor || start ? STEP[event.code] : 0);
      const held = next > today ? today : next;
      setCursor(held);
      setMonth(monthOf(held, now));
      return;
    }
    if ((event.code === "Enter" || event.code === "NumpadEnter") && cursor && (event.target as HTMLElement).tagName !== "BUTTON") {
      event.preventDefault();
      press(cursor);
      return;
    }
    if (event.code === "PageUp" || event.code === "PageDown") {
      event.preventDefault();
      setMonth((was) => addMonths(was, event.code === "PageUp" ? -1 : 1));
    }
  };

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKey} className="outline-none" data-testid="desk-range-picker">
      <PickerHead title="Период" />
      <ul className="py-1">
        {choices.map((choice, index) => (
          <li key={choice?.key ?? "all"}>
            <button
              type="button"
              onClick={() => onPick(choice ? { from: choice.from, to: choice.to } : null)}
              className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              data-testid="desk-range-preset"
            >
              <span className="min-w-0 flex-1 truncate">{choice?.label ?? "Все даты"}</span>
              {choice ? <span className="nums text-[12px] text-muted">{daysWords(choice, now)}</span> : null}
              <Kbd>{index + 1}</Kbd>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-border/70 px-3 pb-3 pt-2">
        <MonthGrid
          month={month}
          onMonth={setMonth}
          today={today}
          label="Период"
          off={(day) => day > today}
          on={(day) => day === low || day === high}
          within={(day) => low !== null && high !== null && isWithin(day, low, high)}
          cursor={cursor}
          onDay={press}
          onHover={start ? setHovered : undefined}
        />
        <p className="mt-2 text-[12px] leading-4 text-muted" data-testid="desk-range-hint">
          {start ? "Теперь последний день" : "Или два дня в месяце: первый и последний"}
        </p>
      </div>
    </div>
  );
}

/** The range as a field of a tool bar: it says what is in force and opens the picker under itself. */
export function DateRangeField({ value, onChange, now }: { value: DayRange | null; onChange: (range: DayRange | null) => void; now: Date }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Период"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => {
          const button = event.currentTarget;
          setAnchor((was) => (was ? null : button));
        }}
        className="field desk-focus flex h-9 max-w-[232px] items-center gap-2 pl-3 pr-2.5 text-[14px] leading-5"
        data-testid="desk-range"
        data-set={value ? "" : undefined}
      >
        <span className="min-w-0 truncate">{rangeWords(value, now)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 text-muted">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} width={324} label="Период">
        <RangePicker
          value={value}
          now={now}
          onPick={(range) => {
            setAnchor(null);
            onChange(range);
          }}
        />
      </Popover>
    </>
  );
}
