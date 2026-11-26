"use client";

import { Check, Eye } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { Face } from "@/components/desk/ui/Face";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { rangeText, taskMeta, tasksCount, timeOf } from "@/lib/daily-report/format";
import { useSeenOnScreen } from "@/lib/daily-report/review";
import type { DailyReport, DailyReportTask, FeedReport } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm } from "@/lib/datetime/calendar";
import { firstLine, highlightParts, isChecked, isSeen } from "@/lib/desk/reports-feed";

/** «Только что» stays teal this long after the report came. */
const FRESH_MS = 10 * 60_000;
/** An edit later than this after the submit is said: «правка 21:40». */
const EDIT_MS = 60_000;

/** «3 задачи: Акт сверки, Отчёт Казахтелеком» — what a report without words did. */
export function tasksLine(tasks: readonly DailyReportTask[]): string {
  return tasks.length ? `${tasksCount(tasks.length)}: ${tasks.map((task) => task.title).join(", ")}` : "";
}

/** «правка 21:40» when the report was changed after it was handed in. */
export function editedText(report: DailyReport): string {
  if (!report.submitted_at) return "";
  const edited = new Date(report.updated_at).getTime() - new Date(report.submitted_at).getTime();
  return edited > EDIT_MS ? `правка ${timeOf(report.updated_at)}` : "";
}

/** A report handed in on another day than its own (the next morning): that day, «18 нояб.». */
export function lateText(report: DailyReport): string {
  const at = aqtobeIsoToYmdHm(report.submitted_at);
  return at && at.ymd !== report.report_date ? rangeText(at.ymd, at.ymd) : "";
}

export function isFresh(report: DailyReport, now: Date): boolean {
  if (!report.submitted_at) return false;
  const age = now.getTime() - new Date(report.submitted_at).getTime();
  return age >= -60_000 && age < FRESH_MS;
}

/** A press on a control inside a row stays the control's; a drag that selected words is reading, not a click. */
const notForRow = (event: MouseEvent) =>
  (event.target as HTMLElement).closest("button, a, input, textarea") !== null || Boolean(window.getSelection()?.toString());

/** The words with what the search found marked. */
function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.hit ? (
          <mark key={index} className="rep-feed-hit">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/**
 * The words in full at reading size, six lines at most until «ещё» opens them in place (a search
 * opens them all: the match may be further down). Whether they overflow is measured after layout
 * and drawn before paint: the button never jumps in.
 */
function Words({ text, query, open, onMore }: { text: string; query: string; open: boolean; onMore: () => void }) {
  const box = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || open || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.scrollHeight > node.clientHeight + 1;
      flushSync(() => setClamped(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, text]);
  return (
    <>
      <p ref={box} className="rep-day-words rep-feed-words" data-open={open ? "" : undefined}>
        <Marked text={text} query={query} />
      </p>
      {clamped && !open ? (
        <button type="button" className="rep-day-more desk-focus" onClick={onMore}>
          ещё
        </button>
      ) : null}
    </>
  );
}

function TaskLines({ tasks, query }: { tasks: readonly DailyReportTask[]; query: string }) {
  if (tasks.length === 0) return null;
  return (
    <ul className="rep-day-tasks" aria-label="Задачи дня">
      {tasks.map((task) => (
        <li key={task.id} className="rep-day-task">
          <StatusGlyph status={task.status} size={15} />
          <Link href={`/desk/tasks?id=${task.id}`} className="rep-day-task-title desk-focus" title={task.title}>
            <Marked text={task.title} query={query} />
          </Link>
          <span className="rep-day-task-meta" data-late={task.on_time === false ? "" : undefined}>
            {taskMeta(task)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** When the report came: «только что», «18:04», another day, «правка 21:40». Never arrival, leaving or hours (D-198). */
function Stamp({ report, now }: { report: DailyReport; now: Date }) {
  const fresh = isFresh(report, now);
  const late = lateText(report);
  const edited = editedText(report);
  return (
    <span className="rep-day-stamp" title={late ? `Сдан ${late} в ${timeOf(report.submitted_at)}` : `Сдан в ${timeOf(report.submitted_at)}`}>
      {fresh ? <span className="rep-day-fresh">только что</span> : null}
      {late ? <span className="rep-day-late">{late}</span> : null}
      <span className="nums rep-feed-time">{timeOf(report.submitted_at)}</span>
      {edited ? <span className="rep-day-edited">{edited}</span> : null}
    </span>
  );
}

/**
 * «Проверить» — a grey plate with a ring; checked — «Проверено 16:30», green words on a pale plate,
 * a press takes the mark off (D-198). Who checked it is in the hint when it was somebody else; the
 * key A is said where it works (the feed's chosen report).
 */
export function CheckButton({
  report,
  onCheck,
  checker,
  size = "md",
  keys = ["A"],
  testId = "desk-feed-check",
}: {
  report: Pick<DailyReport, "id" | "checked_at">;
  onCheck: (on: boolean) => void;
  /** The name of the director who checked it, when not me. */
  checker?: string | null;
  size?: "md" | "sm";
  keys?: string[];
  testId?: string;
}) {
  const checked = isChecked(report);
  return (
    <Tooltip label={checked ? `Проверено${checker ? ` · ${checker}` : ""} — снять отметку` : "Отметить проверенным"} keys={keys.length ? keys : undefined}>
      <button
        type="button"
        className="rep-feed-check desk-focus"
        data-on={checked ? "" : undefined}
        data-size={size}
        aria-pressed={checked}
        data-testid={testId}
        onClick={(event) => {
          event.stopPropagation();
          onCheck(!checked);
        }}
      >
        <Check size={14} strokeWidth={2.4} aria-hidden />
        {checked ? (
          <>
            Проверено <span className="nums rep-feed-check-at">{timeOf(report.checked_at)}</span>
          </>
        ) : (
          "Проверить"
        )}
      </button>
    </Tooltip>
  );
}

/** «просмотрено 17:41» — quiet: an eye and the time the director first had it whole on screen. */
export function SeenLine({ report }: { report: Pick<DailyReport, "seen_at"> }) {
  if (!report.seen_at) return null;
  return (
    <span className="rep-feed-seen nums" title={`Просмотрено в ${timeOf(report.seen_at)}`} data-testid="desk-feed-seen">
      <Eye size={13} strokeWidth={2} aria-hidden />
      просмотрено {timeOf(report.seen_at)}
    </span>
  );
}

/** «изменён после проверки 19:12» — the person changed the words after the check; the mark came off. */
export function ChangedLine({ report }: { report: Pick<DailyReport, "changed_after_check_at" | "checked_at"> }) {
  if (!report.changed_after_check_at || report.checked_at) return null;
  return (
    <span className="rep-feed-changed nums" data-testid="desk-feed-changed">
      изменён после проверки {timeOf(report.changed_after_check_at)}
    </span>
  );
}

export type EntryProps = {
  report: FeedReport;
  now: Date;
  /** The words a search found, marked; "" — none. */
  query: string;
  /** The director reads: «новый» and «Проверить» are theirs (D-198). */
  director: boolean;
  selected: boolean;
  /** Its person's diary is open in the panel. */
  opened: boolean;
  /** A checked report stands as one line — who and the first line of the words — until a click opens it (D-201). */
  fold: boolean;
  /** Its folded line offers «Отменить»: checked in this visit, or under «Не проверены». */
  undo: boolean;
  checker: string | null;
  onSelect: (id: string) => void;
  onOpen: (report: FeedReport) => void;
  onCheck: (ids: string[], on: boolean) => void;
};

/**
 * One report of the feed (D-198): who on the left (a teal dot while nobody has looked at
 * it yet), the person's words in full at reading size and the day's tasks under them, and on the
 * right when it came, «просмотрено 17:41», «Проверить» / «Проверено 16:30». A press on the row
 * opens the person's «Дневник» on that day; the choice stays for the keys (↑ ↓, A). The report
 * counts as seen once it stayed whole on screen (`useSeenOnScreen`). A checked report folds in
 * place into one line «✓ Имя · первая строка слов · проверено 19:05» (D-201): the day gets shorter
 * as it is read; a click opens it again, «Отменить» takes the mark off.
 */
export function LedgerEntry({ report, now, query, director, selected, opened, fold, undo, checker, onSelect, onOpen, onCheck }: EntryProps) {
  const [open, setOpen] = useState(false);
  const checked = isChecked(report);
  // a folded report opened by hand stays open until it is checked anew
  const [unfolded, setUnfolded] = useState(false);
  const [wasChecked, setWasChecked] = useState(checked);
  if (checked !== wasChecked) {
    setWasChecked(checked);
    if (checked) setUnfolded(false);
  }
  // «новый» until a director had it on screen; a checked report has been read whatever the mark says
  const fresh = director && !isSeen(report) && !checked;
  const seenRef = useSeenOnScreen(report.id, fresh && report.status === "submitted");
  const words = report.summary?.trim() ?? "";

  if (fold && checked && !unfolded) {
    const line = firstLine(words) || tasksLine(report.tasks);
    return (
      <li
        className="rep-feed-folded"
        data-testid="desk-feed-folded"
        data-row-key={report.id}
        data-user={report.user_id}
        data-checked=""
        data-selected={selected ? "" : undefined}
        aria-current={selected ? "true" : undefined}
        aria-label={`${report.full_name} — проверено, открыть отчёт`}
        onClick={(event) => {
          if (notForRow(event)) return;
          onSelect(report.id);
          setUnfolded(true);
        }}
      >
        <Check size={14} strokeWidth={2.4} className="rep-feed-folded-tick" aria-hidden />
        <Face person={{ id: report.user_id, full_name: report.full_name, avatar_url: report.avatar_url }} size={20} />
        <span className="rep-feed-folded-name">{report.full_name}</span>
        {line ? <span className="rep-feed-folded-line">{line}</span> : null}
        <span className="rep-feed-folded-word nums" title={checker ? `Проверил ${checker}` : undefined}>
          проверено {timeOf(report.checked_at)}
        </span>
        {undo ? (
          <button type="button" className="rep-feed-folded-undo desk-focus" onClick={() => onCheck([report.id], false)} data-testid="desk-feed-uncheck">
            Отменить
          </button>
        ) : null}
      </li>
    );
  }

  const face = <Face person={{ id: report.user_id, full_name: report.full_name, avatar_url: report.avatar_url }} size={words ? 32 : 24} />;
  const marks: ReactNode = (
    <div className="rep-feed-marks">
      <Stamp report={report} now={now} />
      {director && !checked ? <SeenLine report={report} /> : null}
      {director ? <ChangedLine report={report} /> : null}
      {director ? <CheckButton report={report} checker={checker} onCheck={(on) => onCheck([report.id], on)} /> : null}
    </div>
  );
  return (
    <li
      ref={seenRef}
      className="rep-day-entry rep-feed-entry"
      data-testid="desk-feed-entry"
      data-row-key={report.id}
      data-user={report.user_id}
      data-words={words ? "1" : "0"}
      data-new={fresh ? "" : undefined}
      data-checked={checked ? "" : undefined}
      data-selected={selected ? "" : undefined}
      data-open={opened ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      aria-label={report.full_name}
      onClick={(event) => {
        if (notForRow(event)) return;
        onSelect(report.id);
        onOpen(report);
      }}
    >
      <div className="rep-day-who">
        <span className="rep-feed-face">
          {fresh ? <span className="rep-feed-dot" aria-label="новый" data-testid="desk-feed-new" /> : null}
          {face}
        </span>
        <div className="min-w-0">
          <p className="rep-day-name">{report.full_name}</p>
          {report.gone ? <p className="rep-day-position">больше не в команде</p> : report.position ? <p className="rep-day-position">{report.position}</p> : null}
        </div>
      </div>
      {words ? (
        <div className="rep-day-body">
          <Words text={words} query={query} open={open || Boolean(query)} onMore={() => setOpen(true)} />
          <TaskLines tasks={report.tasks} query={query} />
        </div>
      ) : (
        // a one-tap report from «Пульс» has no words: its tasks, one line
        <p className="rep-day-compact" title={tasksLine(report.tasks) || undefined}>
          {report.tasks.length ? <Marked text={tasksLine(report.tasks)} query={query} /> : "без слов и задач"}
        </p>
      )}
      {marks}
    </li>
  );
}
