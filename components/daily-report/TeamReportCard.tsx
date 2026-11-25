"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { PersonFace } from "@/components/people/PeoplePicker";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { tasksCount, timeOf } from "@/lib/daily-report/format";
import { useSeenOnScreen } from "@/lib/daily-report/review";
import type { FeedReport } from "@/lib/daily-report/types";
import { shortName } from "@/lib/people/names";

import { DayTasks } from "./DayTasks";

/** The line icons of the card — 24 px box, currentColor (the stroke of the tasks' icons). */
const STROKE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const CheckIcon = ({ size = 16, width = 2.4 }: { size?: number; width?: number }) => (
  <svg width={size} height={size} strokeWidth={width} {...STROKE} className="shrink-0">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ChecksIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} strokeWidth={2.2} {...STROKE} className="shrink-0">
    <path d="M18 6 7 17l-5-5" />
    <path d="m22 10-7.5 7.5L13 16" />
  </svg>
);

const EyeIcon = () => (
  <svg width={14} height={14} strokeWidth={2} {...STROKE} className="shrink-0">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const TaskIcon = () => (
  <svg width={14} height={14} strokeWidth={2} {...STROKE} className="shrink-0">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="m8 12 3 3 5-6" />
  </svg>
);

/** «Смета по Северному · на проверке» for one task; «3 задачи: Смета…, Акт…» for more. */
function tasksLine(report: FeedReport): string {
  const tasks = report.tasks;
  if (tasks.length === 1) return `${tasks[0].title} · ${tasks[0].status === "done" ? "принята" : "на проверке"}`;
  return `${tasksCount(tasks.length)}: ${tasks.map((task) => task.title).join(", ")}`;
}

/**
 * One report in the director's feed (D-198, design E): whose and when, the words at once (four
 * lines and «ещё»), the day's tasks in a line, and «Проверить» at the thumb — 44 px. A report no
 * director has seen yet carries a white dot and a bolder name (never the brand colour: the pilot's
 * is green, D-195); it counts as seen once it stayed on screen (`useSeenOnScreen`). Checked, the
 * button turns into the green word «Проверено 19:05» — a tap takes it off. A tap on the name opens
 * that person's reports. No swipes.
 */
export function TeamReportCard({
  report,
  onCheck,
  onPerson,
}: {
  report: FeedReport;
  onCheck: (on: boolean) => void;
  /** The person's own feed; undefined — this is it already. */
  onPerson?: () => void;
}) {
  const fresh = !report.seen_at;
  const seenRef = useSeenOnScreen(report.id, fresh && report.status === "submitted");
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const words = useRef<HTMLParagraphElement>(null);

  // «ещё» only when the four lines really cut the words; measured again when the width changes
  useLayoutEffect(() => {
    const element = words.current;
    if (!element || open) return;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [report.summary, open]);

  const checked = Boolean(report.checked_at);
  const changed = !checked && report.changed_after_check_at ? timeOf(report.changed_after_check_at) : "";
  const meta = changed ? `изменён после проверки ${changed}` : !checked && report.seen_at ? `просмотрено ${timeOf(report.seen_at)}` : "";
  const who = (
    <>
      <span className="relative shrink-0" style={{ opacity: report.gone ? 0.55 : 1 }}>
        <PersonFace person={report} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[16px] leading-[21px] ${fresh ? "font-bold" : "font-semibold"}`}>{shortName(report.full_name)}</span>
        <span className="block truncate text-[13px] leading-[17px] text-muted">
          {report.gone ? "больше не в команде" : report.position || " "}
        </span>
      </span>
    </>
  );

  return (
    <article
      ref={seenRef}
      className="task-card relative rounded-[18px] px-3.5 pb-3 pt-3"
      data-testid="feed-report"
      data-report={report.id}
      data-fresh={fresh || undefined}
    >
      <div className="relative flex min-h-[44px] items-center gap-3">
        {/* «новый»: white, not the brand colour; it fades once the report has been seen */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: fresh ? 1 : 0, scale: fresh ? 1 : 0.4 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute -left-[11px] top-1/2 -mt-1 h-2 w-2 rounded-full bg-text"
          style={{ boxShadow: "0 0 0 3px color-mix(in srgb, var(--text) 14%, transparent)" }}
        />
        {onPerson ? (
          <button type="button" onClick={onPerson} className="relative -my-1 flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left" data-testid="feed-report-person">
            {who}
            <HapticSwitch />
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-3">{who}</span>
        )}
        <span className="nums shrink-0 self-start pt-0.5 text-[13px] leading-4 text-muted">
          {fresh ? <span className="sr-only">Новый · </span> : null}
          {timeOf(report.submitted_at)}
        </span>
      </div>

      {report.summary ? (
        <>
          <p
            ref={words}
            onClick={clamped && !open ? () => setOpen(true) : undefined}
            className={`mt-2 whitespace-pre-wrap break-words text-[15px] leading-[21px] ${open ? "" : "line-clamp-4"}`}
          >
            {report.summary}
          </p>
          {clamped || open ? (
            <button
              type="button"
              onClick={() => setOpen((was) => !was)}
              className="-mb-1.5 -ml-1 min-h-[30px] px-1 text-[14px] font-semibold leading-5 text-muted active:text-text"
              aria-expanded={open}
            >
              {open ? "свернуть" : "ещё"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[14px] leading-5 text-muted">Без слов — только задачи дня</p>
      )}

      {/* opened, the day's tasks are a list; folded — one line, in the foot when nothing else stands there */}
      {open && report.tasks.length > 0 ? (
        <div className="mt-2">
          <DayTasks tasks={report.tasks} flat />
        </div>
      ) : null}
      {!open && report.tasks.length > 0 && meta ? <TasksLine report={report} onOpen={() => setOpen(true)} className="mt-1 w-full" /> : null}

      <div className="mt-1.5 flex min-h-[44px] items-center gap-2.5">
        {!open && report.tasks.length > 0 && !meta ? (
          <TasksLine report={report} onOpen={() => setOpen(true)} className="flex-1" />
        ) : (
          <span className="nums flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-[18px] text-muted">
            {meta && !changed ? <EyeIcon /> : null}
            <span className="truncate">{meta}</span>
          </span>
        )}
        <CheckButton checked={checked} at={report.checked_at ?? null} onPress={() => onCheck(!checked)} />
      </div>
    </article>
  );
}

/** The day's tasks folded to a line; a tap opens the report with its tasks as a list. */
function TasksLine({ report, onOpen, className = "" }: { report: FeedReport; onOpen: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} className={`flex min-h-[32px] min-w-0 items-center gap-1.5 text-left text-[13px] leading-[18px] text-muted ${className}`}>
      <TaskIcon />
      <span className="min-w-0 truncate">{tasksLine(report)}</span>
    </button>
  );
}

/** «Проверить» — 44 px at the thumb; checked — «✓ Проверено 19:05», green on a pale plate; a tap takes it off. */
function CheckButton({ checked, at, onPress }: { checked: boolean; at: string | null; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={checked}
      data-testid="feed-check"
      className={`relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] border px-3.5 font-display text-[14.5px] font-semibold leading-5 tracking-[-0.01em] transition-[transform,background-color,color,border-color] duration-[160ms] active:scale-[0.96] ${
        checked ? "border-ok/25 bg-ok/10 text-ok" : "border-border bg-surface-2 text-text"
      }`}
    >
      <span className={checked ? "" : "text-muted"}>
        <CheckIcon />
      </span>
      {checked ? (
        <span className="nums">
          Проверено{at ? ` ${timeOf(at)}` : ""}
        </span>
      ) : (
        "Проверить"
      )}
      <HapticSwitch />
    </button>
  );
}

/**
 * Under «Не проверены» a checked report folds in place into one line — «✓ Гульнара О. · проверено ·
 * Отменить» — and the list below does not jump (design B).
 */
export function TeamReportFold({ report, onUndo }: { report: FeedReport; onUndo: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-[52px] items-center gap-2.5 rounded-[16px] border border-ok/20 bg-ok/[0.07] pl-3.5 pr-1.5"
      data-testid="feed-fold"
    >
      <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ok text-bg">
        <CheckIcon size={13} width={3} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-5">
        {shortName(report.full_name)} <span className="font-medium text-muted">· проверено</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="relative min-h-[44px] shrink-0 px-2.5 text-[14px] font-semibold leading-5 underline decoration-[color-mix(in_srgb,var(--text)_35%,transparent)] underline-offset-[3px]"
      >
        Отменить
        <HapticSwitch />
      </button>
    </motion.div>
  );
}
