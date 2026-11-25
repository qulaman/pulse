/**
 * D-198: the review marks («Просмотрено», «Проверено») written into the director's cached copies
 * of the reports — pure, so the hooks in ./review.ts patch with these and the tests pin them.
 * Every patcher keeps the very same object when nothing in it changed: a mark that is already
 * there costs no re-render.
 */
import type { InfiniteData } from "@tanstack/react-query";

import type { DailyReport, ReportsFeedPage, ReviewMark, TeamDay } from "./types";

/** The review fields of a report; `id` is the key, not a field to write. */
export const REVIEW_FIELDS = ["seen_at", "checked_at", "checked_by", "changed_after_check_at"] as const;

export type MarkIndex = ReadonlyMap<string, ReviewMark>;

/** Marks by report id; a later mark of the same report wins. */
export function indexMarks(marks: readonly ReviewMark[]): Map<string, ReviewMark> {
  const index = new Map<string, ReviewMark>();
  for (const mark of marks) if (mark?.id) index.set(mark.id, mark);
  return index;
}

/** The report with the mark's fields written in; a field the mark does not carry stays as it is. */
export function markReport<R extends DailyReport>(report: R, mark: ReviewMark | undefined): R {
  if (!mark || mark.id !== report.id) return report;
  let next: R | null = null;
  for (const field of REVIEW_FIELDS) {
    const value = mark[field];
    if (value === undefined) continue;
    // a missing field reads as null (types.ts): writing null over nothing is no change
    if ((report[field] ?? null) === value) continue;
    next ??= { ...report };
    next[field] = value;
  }
  return next ?? report;
}

/** The marks over a list of reports (one person's «Дневник», a day's reports). */
export function markReports<R extends DailyReport>(list: readonly R[], index: MarkIndex): R[] {
  let changed = false;
  const next = list.map((report) => {
    const marked = markReport(report, index.get(report.id));
    if (marked !== report) changed = true;
    return marked;
  });
  return changed ? next : (list as R[]);
}

/** The feed's pages (`useInfiniteQuery`): every day of every page. */
export function markFeedPages(
  data: InfiniteData<ReportsFeedPage, string | null> | undefined,
  index: MarkIndex,
): InfiniteData<ReportsFeedPage, string | null> | undefined {
  if (!data || index.size === 0) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const days = page.days.map((day) => {
      const reports = markReports(day.reports, index);
      if (reports === day.reports) return day;
      pageChanged = true;
      return { ...day, reports };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, days };
  });
  return changed ? { ...data, pages } : data;
}

/** The team's day (`team_daily_report_day`): the report of each row. */
export function markTeamDay(day: TeamDay | undefined, index: MarkIndex): TeamDay | undefined {
  if (!day || index.size === 0) return day;
  let changed = false;
  const rows = day.rows.map((row) => {
    if (!row.report) return row;
    const report = markReport(row.report, index.get(row.report.id));
    if (report === row.report) return row;
    changed = true;
    return { ...row, report };
  });
  return changed ? { ...day, rows } : day;
}

/** One person's reports (`person_daily_reports`). */
export function markList<R extends DailyReport>(list: R[] | undefined, index: MarkIndex): R[] | undefined {
  if (!list || index.size === 0) return list;
  return markReports(list, index);
}

/** The feed's copy of a report, wherever its day is. */
export function reportInFeed(data: InfiniteData<ReportsFeedPage, string | null> | undefined, id: string): DailyReport | undefined {
  for (const page of data?.pages ?? []) {
    for (const day of page.days) {
      const found = day.reports.find((report) => report.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

/** The team day's copy of a report. */
export function reportInTeamDay(day: TeamDay | undefined, id: string): DailyReport | undefined {
  return day?.rows.find((row) => row.report?.id === id)?.report ?? undefined;
}

/** The review fields of a report as they stand — what a rollback writes back. */
export function marksOf(report: DailyReport): ReviewMark {
  return {
    id: report.id,
    seen_at: report.seen_at ?? null,
    checked_at: report.checked_at ?? null,
    checked_by: report.checked_by ?? null,
    changed_after_check_at: report.changed_after_check_at ?? null,
  };
}

/**
 * What «Проверено» on / off changes in a report, said as a mark; null — nothing to change (not a
 * submitted report, already checked, not checked). `checked_by` waits for the server's answer.
 */
export function checkMark(report: DailyReport, on: boolean, now: string): ReviewMark | null {
  if (report.status !== "submitted") return null;
  if (on) {
    if (report.checked_at) return null;
    return { id: report.id, checked_at: now, seen_at: report.seen_at ?? now, changed_after_check_at: null };
  }
  if (!report.checked_at) return null;
  return { id: report.id, checked_at: null, checked_by: null };
}

/** Same instant, whatever the spelling: the database's and Realtime's timestamps differ in form. */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && x === y;
}

/**
 * A Realtime row of `daily_reports` that changed only the review fields: its `updated_at` is the
 * one already cached (the trigger leaves `updated_at` alone for the marks — migration
 * 20261125120000). Such a change is patched in, everything else reloads.
 */
export function isReviewOnly(row: Partial<Record<string, unknown>> | null | undefined, cached: DailyReport | undefined): boolean {
  if (!row || !cached) return false;
  const updated = typeof row.updated_at === "string" ? row.updated_at : null;
  return sameInstant(updated, cached.updated_at);
}

/** The review fields of a Realtime row, as a mark; a field the row does not carry is left out. */
export function markOfRow(row: Partial<Record<string, unknown>>): ReviewMark | null {
  if (typeof row.id !== "string") return null;
  const mark: ReviewMark = { id: row.id };
  for (const field of REVIEW_FIELDS) {
    if (field in row) mark[field] = typeof row[field] === "string" ? row[field] : null;
  }
  return mark;
}
