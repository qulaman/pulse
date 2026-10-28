"use client";

import { Icon } from "@/components/tasks/desk/icons";
import { Bone } from "@/components/ui/Skeleton";
import { addDaysYmd, dayTitle } from "@/lib/daily-report/format";
import type { Ymd } from "@/lib/datetime/calendar";

const STEP =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] btn-secondary text-text transition-transform duration-[120ms] active:scale-[0.94] disabled:opacity-35 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35";

/**
 * ‹ Среда, 28 октября › — the director's day switch. Tomorrow is not a day yet; a tap on the
 * date comes back to today. Without `onChange` (the skeleton) the date is a bone.
 */
export function DayStepper({ date, today, onChange }: { date: Ymd | null; today: Ymd | null; onChange?: (date: Ymd) => void }) {
  const isToday = date !== null && date === today;
  return (
    <div className="flex items-center gap-2" data-testid="day-stepper">
      <button
        type="button"
        aria-label="Предыдущий день"
        disabled={!onChange || !date}
        onClick={() => date && onChange?.(addDaysYmd(date, -1))}
        className={STEP}
      >
        <Icon name="left" size={18} />
      </button>
      <button
        type="button"
        disabled={!onChange || isToday}
        onClick={() => today && onChange?.(today)}
        aria-label={isToday ? undefined : "Вернуться к сегодня"}
        className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center rounded-[12px] px-2 text-center"
      >
        {date ? (
          <>
            <span className="block max-w-full truncate font-display text-[16px] font-semibold leading-5 tracking-[-0.01em]">{dayTitle(date)}</span>
            <span className={`block text-[12px] leading-4 ${isToday ? "text-accent" : "text-muted"}`}>{isToday ? "сегодня" : "к сегодня ›"}</span>
          </>
        ) : (
          <span className="skeleton flex flex-col items-center" aria-hidden>
            <Bone h={20} w={170} />
            <Bone h={14} w={56} className="mt-0.5" />
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label="Следующий день"
        disabled={!onChange || !date || isToday}
        onClick={() => date && onChange?.(addDaysYmd(date, 1))}
        className={STEP}
      >
        <Icon name="right" size={18} />
      </button>
    </div>
  );
}
