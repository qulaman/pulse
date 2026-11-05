"use client";

import { firstLine, type RepeatValue } from "@/components/recurrence/RepeatSheet";
import { Select } from "@/components/desk/ui/Toolbar";
import { describeRule, EVENT_REPEAT_LABEL, EVENT_REPEATS, normalizeRule, WEEKDAY_SHORT, type EventRepeat, type RepeatEvery } from "@/lib/recurrence/schedule";

const EVERY_LABEL: Record<RepeatEvery, string> = {
  day: "Каждый день",
  workday: "По будням",
  week: "По дням недели",
  month: "По числам",
};

const INTERVAL_WORD: Record<RepeatEvery, string> = { day: "дн.", workday: "", week: "нед.", month: "мес." };

/**
 * How a repeating order repeats, in one row on the desk (D-148, D-154 wave 3): the step, the
 * weekdays as keys (Tab and Space), the day of the month, «раз в N» and the hour of each
 * deadline — the rule in words under it, as the phone's sheet says it.
 */
export function RecurrenceFields({ value, onChange }: { value: RepeatValue; onChange: (next: RepeatValue) => void }) {
  const set = (patch: Partial<RepeatValue>) => {
    const next = { ...value, ...patch };
    onChange({ ...normalizeRule(next), due_time: next.due_time });
  };
  const week = value.every === "week";
  const month = value.every === "month";
  const first = firstLine(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={value.every} onChange={(event) => set({ every: event.target.value as RepeatEvery })} aria-label="Как повторять" className="pr-8">
          {(Object.keys(EVERY_LABEL) as RepeatEvery[]).map((every) => (
            <option key={every} value={every}>
              {EVERY_LABEL[every]}
            </option>
          ))}
        </Select>
        {value.every !== "workday" ? (
          <Select value={String(value.interval)} onChange={(event) => set({ interval: Number(event.target.value) })} aria-label="Как часто" className="pr-8">
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "каждый раз" : `раз в ${n} ${INTERVAL_WORD[value.every]}`}
              </option>
            ))}
          </Select>
        ) : null}
        {month ? (
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            число
            <input
              type="number"
              min={1}
              max={31}
              value={value.month_day || 1}
              onChange={(event) => set({ month_day: Number(event.target.value) })}
              aria-label="Число месяца"
              className="desk-input nums h-9 w-16 px-0 text-[14px] text-text"
            />
          </label>
        ) : null}
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          к
          <input
            type="time"
            step={900}
            value={value.due_time}
            onChange={(event) => {
              if (event.target.value) set({ due_time: event.target.value });
            }}
            aria-label="Срок каждого раза"
            className="desk-input nums h-9 px-0 text-[14px] text-text"
          />
        </label>
      </div>
      {week ? (
        <div role="group" aria-label="Дни недели" className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const on = value.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => set({ weekdays: on ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day] })}
                className={`desk-focus h-8 w-9 rounded-[2px] border text-[13px] font-medium leading-none transition-colors duration-[120ms] ${
                  on ? "border-accent text-accent" : "border-border text-muted hover:text-text"
                }`}
              >
                {WEEKDAY_SHORT[day]}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="text-[12px] leading-4 text-muted">
        {describeRule(value)} · к {value.due_time}
        {first ? ` · ${first}` : ""}
      </p>
    </div>
  );
}

/** A meeting's step: none, every day, workdays, every week, every two weeks, every month (D-148). */
export function EventRepeatField({ value, onChange }: { value: EventRepeat; onChange: (next: EventRepeat) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as EventRepeat)} aria-label="Повтор" className="w-full pr-8">
      {EVENT_REPEATS.map((repeat) => (
        <option key={repeat} value={repeat}>
          {EVENT_REPEAT_LABEL[repeat]}
        </option>
      ))}
    </Select>
  );
}
