"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TimeField } from "@/components/ui/datetime/TimeField";
import {
  describeDay,
  describeRule,
  EVENT_REPEAT_LABEL,
  EVENT_REPEATS,
  firstOn,
  normalizeRule,
  parseClock,
  WEEKDAY_SHORT,
  type EventRepeat,
  type RepeatEvery,
  type RepeatRule,
} from "@/lib/recurrence/schedule";

/** The delivery window most companies keep (settings.delivery_window); the card's preview only. */
const WINDOW_FROM = { hours: 8, minutes: 0 };

const EVERY_LABEL: Record<RepeatEvery, string> = {
  day: "Каждый день",
  workday: "По будням",
  week: "По дням недели",
  month: "По числам",
};

export type RepeatValue = RepeatRule & { due_time: string };

/** «каждый понедельник · к 18:00» — the rule and its deadline in one line. */
export function repeatLine(value: RepeatValue): string {
  return `${describeRule(value)} · к ${value.due_time}`;
}

/** «первая — пн, 27 окт.»: when the first task of a new rule will come. */
export function firstLine(value: RepeatValue, now: Date = new Date()): string | null {
  const due = parseClock(value.due_time);
  const first = due ? firstOn(value, now, due, WINDOW_FROM) : null;
  return first === null ? null : `первая — ${describeDay(first)}`;
}

/**
 * How a repeating order repeats (D-148): the step, the days, the deadline of each day. The same
 * sheet edits a card before it is sent and a rule already running («Повторы» in «Задачи»).
 */
export function RepeatSheet({
  open,
  onClose,
  value,
  onDone,
  title = "Как повторять",
}: {
  open: boolean;
  onClose: () => void;
  value: RepeatValue;
  onDone: (value: RepeatValue) => void;
  title?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* born with the sheet: a second opening starts from the rule as it is now */}
      {open ? (
        <RepeatBody
          value={value}
          onDone={(next) => {
            onDone(next);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

function RepeatBody({ value, onDone }: { value: RepeatValue; onDone: (value: RepeatValue) => void }) {
  const [draft, setDraft] = useState<RepeatValue>(() => ({ ...normalizeRule(value), due_time: value.due_time }));
  const set = (patch: Partial<RepeatValue>) => setDraft((was) => ({ ...was, ...patch }));
  const rule = normalizeRule(draft);
  const result: RepeatValue = { ...rule, due_time: draft.due_time };
  const first = firstLine(result);

  const toggleDay = (day: number) => {
    const on = draft.weekdays.includes(day);
    const next = on ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day];
    // the last day cannot go: a week rule with no day is nothing
    if (next.length > 0) set({ weekdays: next.sort((a, b) => a - b) });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(EVERY_LABEL) as RepeatEvery[]).map((every) => (
          <Chip
            key={every}
            tone={draft.every === every ? "accent" : "neutral"}
            aria-pressed={draft.every === every}
            onClick={() =>
              set({
                every,
                interval: every === draft.every ? draft.interval : 1,
                weekdays: every === "week" && draft.weekdays.length === 0 ? [1] : draft.weekdays,
                month_day: every === "month" && !draft.month_day ? 1 : draft.month_day,
              })
            }
          >
            {EVERY_LABEL[every]}
          </Chip>
        ))}
      </div>

      {draft.every === "week" ? (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Дни недели">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`flex h-11 items-center justify-center rounded-[12px] border font-display text-[14px] font-semibold transition-colors duration-[120ms] ${
                    on ? "border-accent bg-accent text-bg" : "border-border bg-surface-2 text-text"
                  }`}
                >
                  {WEEKDAY_SHORT[day]}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Chip tone={draft.interval === 1 ? "accent" : "neutral"} aria-pressed={draft.interval === 1} onClick={() => set({ interval: 1 })}>
              Каждую неделю
            </Chip>
            <Chip tone={draft.interval === 2 ? "accent" : "neutral"} aria-pressed={draft.interval === 2} onClick={() => set({ interval: 2 })}>
              Раз в две недели
            </Chip>
          </div>
        </>
      ) : null}

      {draft.every === "month" ? (
        <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Число месяца">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={draft.month_day === day}
              onClick={() => set({ month_day: day })}
              className={`nums flex h-10 items-center justify-center rounded-[11px] border text-[14px] font-semibold transition-colors duration-[120ms] ${
                draft.month_day === day ? "border-accent bg-accent text-bg" : "border-border bg-surface-2 text-text"
              }`}
            >
              {day}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={draft.month_day >= 29}
            onClick={() => set({ month_day: 31 })}
            className={`col-span-7 flex h-10 items-center justify-center rounded-[11px] border text-[14px] font-semibold transition-colors duration-[120ms] ${
              draft.month_day >= 29 ? "border-accent bg-accent text-bg" : "border-border bg-surface-2 text-text"
            }`}
          >
            Последний день месяца
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <TimeField label="Срок в этот день" value={draft.due_time} onChange={(hm) => set({ due_time: hm })} />
      </div>

      <p className="mt-4 text-[15px] leading-[21px]">
        {repeatLine(result)}
        {first ? <span className="text-muted"> · {first}</span> : null}
      </p>

      <div className="mt-3">
        <Button block onClick={() => onDone(result)}>
          Готово
        </Button>
      </div>
    </>
  );
}

/** A meeting repeats in one step a person can name; its day is the first meeting's own (D-148). */
export function EventRepeatSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: EventRepeat;
  onPick: (repeat: EventRepeat) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Повторять встречу?">
      <div className="flex flex-col gap-1">
        {EVENT_REPEATS.map((repeat) => (
          <button
            key={repeat}
            type="button"
            aria-pressed={value === repeat}
            onClick={() => {
              onPick(repeat);
              onClose();
            }}
            className={`flex min-h-[50px] items-center justify-between rounded-[14px] px-3 text-left text-[16px] font-medium transition-colors duration-[120ms] active:bg-surface-2 ${
              value === repeat ? "bg-surface-2" : ""
            }`}
          >
            {EVENT_REPEAT_LABEL[repeat]}
            {value === repeat ? <span className="text-accent">✓</span> : null}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-[18px] text-muted">
        День недели и время — как у первой встречи. Следующая встреча появится в календаре, когда начнётся эта.
      </p>
    </Sheet>
  );
}
