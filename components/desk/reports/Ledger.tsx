"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";

import { Face } from "@/components/desk/ui/Face";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { hoursText, rangeText, spanText, taskMeta, tasksCount, timeOf } from "@/lib/daily-report/format";
import type { DailyReport, DailyReportTask, TeamDayRow } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm } from "@/lib/datetime/calendar";
import { pluralRu } from "@/lib/tasks/status-text";


/** «Только что» stays teal this long after the report came. */
const FRESH_MS = 10 * 60_000;
/** An edit later than this after the submit is said: «правка 21:40». */
const EDIT_MS = 60_000;

/** A row of the ledger: a handed-in report and its person. */
export type LedgerRow = TeamDayRow & { report: DailyReport };

/** Newest handed-in first; the same minute — by name, so the order never flickers. */
export function ledgerOrder(a: LedgerRow, b: LedgerRow): number {
  const at = (row: LedgerRow) => row.report.submitted_at ?? row.report.updated_at;
  return at(b).localeCompare(at(a)) || a.full_name.localeCompare(b.full_name, "ru");
}

/** The person's words, or nothing: a report handed in with one tap has none. */
function wordsOf(report: DailyReport): string {
  return report.summary?.trim() ?? "";
}

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

/** «1 новый отчёт», «3 новых отчёта», «5 новых отчётов». */
export function newReportsText(count: number): string {
  return `${count} ${pluralRu(count, ["новый отчёт", "новых отчёта", "новых отчётов"])}`;
}

/** A double click on a control inside a row stays the control's. */
const fromControl = (event: MouseEvent) => (event.target as HTMLElement).closest("button, a, input, textarea") !== null;

/**
 * The words in full at reading size, six lines at most until «ещё» opens them in place. Whether
 * they overflow is measured after layout and drawn before paint: the button never jumps in.
 */
function Words({ text, open, onMore }: { text: string; open: boolean; onMore: () => void }) {
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
      <p ref={box} className="rep-day-words" data-open={open ? "" : undefined}>
        {text}
      </p>
      {clamped && !open ? (
        <button type="button" className="rep-day-more desk-focus" onClick={onMore}>
          ещё
        </button>
      ) : null}
    </>
  );
}

function TaskLines({ tasks }: { tasks: readonly DailyReportTask[] }) {
  if (tasks.length === 0) return null;
  return (
    <ul className="rep-day-tasks" aria-label="Задачи дня">
      {tasks.map((task) => (
        <li key={task.id} className="rep-day-task">
          <StatusGlyph status={task.status} size={15} />
          <Link href={`/desk/tasks?id=${task.id}`} className="rep-day-task-title desk-focus" title={task.title}>
            {task.title}
          </Link>
          <span className="rep-day-task-meta" data-late={task.on_time === false ? "" : undefined}>
            {taskMeta(task)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** When the report came, on the right: «только что», «18:04», «правка 21:40», another day. */
function Stamp({ report, now }: { report: DailyReport; now: Date }) {
  const fresh = isFresh(report, now);
  const late = lateText(report);
  const edited = editedText(report);
  return (
    <span className="rep-day-stamp" title={late ? `Сдан ${late} в ${timeOf(report.submitted_at)}` : `Сдан в ${timeOf(report.submitted_at)}`}>
      {fresh ? <span className="rep-day-fresh">только что</span> : null}
      {late ? <span className="rep-day-late">{late}</span> : null}
      <span className="nums">{timeOf(report.submitted_at)}</span>
      {edited ? <span className="rep-day-edited">{edited}</span> : null}
    </span>
  );
}

function Entry({
  row,
  now,
  open,
  rise,
  selected,
  opened,
  onMore,
  onSelect,
  onOpen,
}: {
  row: LedgerRow;
  now: Date;
  open: boolean;
  rise: boolean;
  selected: boolean;
  opened: boolean;
  onMore: () => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const report = row.report;
  const words = wordsOf(report);
  const span = spanText(report.arrived_at, report.left_at);
  const hours = hoursText(row.hours);
  const face = <Face person={{ id: row.user_id, full_name: row.full_name, avatar_url: row.avatar_url }} size={words ? 32 : 24} />;
  return (
    <li
      className="rep-day-entry"
      data-testid="desk-ledger-entry"
      data-row-key={row.user_id}
      data-words={words ? "1" : "0"}
      data-selected={selected ? "" : undefined}
      data-open={opened ? "" : undefined}
      data-rise={rise ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      aria-label={row.full_name}
      onClick={() => onSelect(row.user_id)}
      onDoubleClick={(event) => {
        if (!fromControl(event)) onOpen(row.user_id);
      }}
    >
      {words ? (
        <>
          <div className="rep-day-who">
            {face}
            <div className="min-w-0">
              <p className="rep-day-name">{row.full_name}</p>
              {row.position ? <p className="rep-day-position">{row.position}</p> : null}
              {span ? (
                <p className="rep-day-span nums">
                  {span}
                  {hours ? <span className="rep-day-hours"> · {hours}</span> : null}
                </p>
              ) : null}
            </div>
          </div>
          <div className="rep-day-body">
            <Words text={words} open={open} onMore={onMore} />
            <TaskLines tasks={report.tasks} />
          </div>
        </>
      ) : (
        <>
          <div className="rep-day-who" title={row.position ?? undefined}>
            {face}
            <p className="rep-day-name">{row.full_name}</p>
          </div>
          <p className="rep-day-compact" title={tasksLine(report.tasks) || undefined}>
            {span ? <span className="nums rep-day-compact-span">{span}</span> : null}
            {span && report.tasks.length ? " · " : null}
            {tasksLine(report.tasks)}
          </p>
        </>
      )}
      <Stamp report={report} now={now} />
    </li>
  );
}

/**
 * «Сводка»'s ledger (D-183): only the handed-in reports, newest first — who and when on the left,
 * the person's words in full at reading size, the day's tasks under them, the time it came on the
 * right. A report without words is one short line of its times and its tasks. What arrives while
 * the director reads waits behind «1 новый отчёт» on top (`held`); shown, it rises into place.
 */
export function Ledger({
  rows,
  held,
  risen,
  onShowHeld,
  empty,
  now,
  selectedId,
  openId,
  onSelect,
  onOpen,
}: {
  /** Shown entries, in order. */
  rows: readonly LedgerRow[];
  /** How many came after the director started reading. */
  held: number;
  /** Ids that have just been let in: they rise into place. */
  risen: ReadonlySet<string>;
  onShowHeld: () => void;
  /** What the empty ledger says. */
  empty: { title: string; hint?: string } | null;
  now: Date;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <section className="rep-day-ledger" data-testid="desk-ledger" aria-label="Что сделано">
      <header className="rep-day-ledger-head">
        <h2 className="rep-day-ledger-title">Что сделано</h2>
        {rows.length > 0 ? (
          <span className="rep-day-ledger-sub">
            <span className="nums">{rows.length}</span> {pluralRu(rows.length, ["отчёт", "отчёта", "отчётов"])}
            {rows.length > 1 ? " · сначала новые" : ""}
          </span>
        ) : null}
        {/* the head stays on top while one scrolls: what came meanwhile is said there, nothing moves */}
        {held > 0 ? (
          <button type="button" className="rep-day-pill desk-focus" data-testid="desk-new-reports" onClick={onShowHeld}>
            <span className="rep-day-pill-dot" aria-hidden />
            {newReportsText(held)}
          </button>
        ) : null}
      </header>
      {rows.length === 0 && empty ? (
        <div className="rep-day-ledger-empty">
          <p className="rep-day-ledger-empty-title">{empty.title}</p>
          {empty.hint ? <p className="rep-day-ledger-empty-hint">{empty.hint}</p> : null}
        </div>
      ) : (
        <ol className="rep-day-entries">
          {rows.map((row) => (
            <Entry
              key={row.user_id}
              row={row}
              now={now}
              open={opened.has(row.report.id)}
              rise={risen.has(row.user_id)}
              selected={selectedId === row.user_id}
              opened={openId === row.user_id}
              onMore={() => setOpened((prev) => new Set(prev).add(row.report.id))}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
