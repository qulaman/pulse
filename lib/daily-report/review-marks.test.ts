import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  checkMark,
  indexMarks,
  isReviewOnly,
  markFeedPages,
  markList,
  markOfRow,
  markReport,
  markTeamDay,
  reportInFeed,
  sameInstant,
} from "./review-marks";
import type { DailyReport, FeedReport, ReportsFeedPage, TeamDay } from "./types";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function report(id: string, over: Partial<DailyReport> = {}): DailyReport {
  return {
    id,
    user_id: "u",
    report_date: "2026-11-25",
    status: "submitted",
    arrived_at: null,
    left_at: null,
    summary: "сделал",
    tasks: [],
    submitted_at: "2026-11-25T12:52:00+00:00",
    updated_at: "2026-11-25T12:52:00.123456+00:00",
    points: 1,
    excused_at: null,
    excused_reason: null,
    ...over,
  };
}

function feedReport(id: string, over: Partial<DailyReport> = {}): FeedReport {
  return { ...report(id, over), full_name: "Айгуль", position: null, avatar_url: null };
}

function feed(...reports: FeedReport[]): InfiniteData<ReportsFeedPage, string | null> {
  return {
    pageParams: [null],
    pages: [
      {
        from: "2026-11-19",
        next_before: "2026-11-19",
        days: [
          { date: "2026-11-25", today: true, workday: true, due: 2, submitted: 1, missed: 0, excused: 0, pending: 1, reports, missed_people: [] },
          { date: "2026-11-24", today: false, workday: true, due: 2, submitted: 0, missed: 2, excused: 0, pending: 0, reports: [], missed_people: [] },
        ],
      },
    ],
  };
}

describe("markReport", () => {
  it("writes only the fields the mark carries", () => {
    const before = report(A, { checked_at: "2026-11-25T13:00:00Z", checked_by: "d" });
    const after = markReport(before, { id: A, seen_at: "2026-11-25T13:05:00Z" });
    expect(after.seen_at).toBe("2026-11-25T13:05:00Z");
    expect(after.checked_at).toBe("2026-11-25T13:00:00Z");
    expect(after.checked_by).toBe("d");
    expect(before.seen_at).toBeUndefined();
  });

  it("keeps the same object when nothing changes — a missing field reads as null", () => {
    const before = report(A);
    expect(markReport(before, { id: A, checked_at: null, changed_after_check_at: null })).toBe(before);
    expect(markReport(before, { id: B, seen_at: "x" })).toBe(before);
    expect(markReport(before, undefined)).toBe(before);
  });
});

describe("cache patchers", () => {
  it("patch the feed's report and keep untouched days and pages", () => {
    const data = feed(feedReport(A), feedReport(B));
    const next = markFeedPages(data, indexMarks([{ id: B, checked_at: "2026-11-25T14:00:00Z" }]));
    expect(next).not.toBe(data);
    expect(next?.pages[0]?.days[0]?.reports[0]).toBe(data.pages[0]?.days[0]?.reports[0]);
    expect(next?.pages[0]?.days[0]?.reports[1]?.checked_at).toBe("2026-11-25T14:00:00Z");
    expect(next?.pages[0]?.days[1]).toBe(data.pages[0]?.days[1]);
    expect(reportInFeed(next, B)?.checked_at).toBe("2026-11-25T14:00:00Z");
  });

  it("leave the feed as it is for a report it does not hold", () => {
    const data = feed(feedReport(A));
    expect(markFeedPages(data, indexMarks([{ id: B, seen_at: "x" }]))).toBe(data);
    expect(markFeedPages(undefined, indexMarks([{ id: B, seen_at: "x" }]))).toBeUndefined();
  });

  it("patch the team day's row report and one person's list", () => {
    const day: TeamDay = {
      date: "2026-11-25",
      today: true,
      workday: true,
      totals: { team: 1, submitted: 1, missed: 0, pending: 0, away: 0, excused: 0, handed_over: 0, closed: 0 },
      rows: [
        {
          user_id: "u",
          full_name: "Айгуль",
          position: null,
          avatar_url: null,
          availability: "active",
          state: "submitted",
          report: report(A),
          tasks: [],
          activity: { accepted: 0, handed_over: 0, closed: 0, messages: 0 },
          hours: null,
          reminded: null,
        },
      ],
    };
    const index = indexMarks([{ id: A, seen_at: "2026-11-25T13:00:00Z" }]);
    expect(markTeamDay(day, index)?.rows[0]?.report?.seen_at).toBe("2026-11-25T13:00:00Z");
    const list = [report(B), report(A)];
    const next = markList(list, index);
    expect(next?.[0]).toBe(list[0]);
    expect(next?.[1]?.seen_at).toBe("2026-11-25T13:00:00Z");
    expect(markList(list, indexMarks([]))).toBe(list);
  });
});

describe("checkMark", () => {
  const now = "2026-11-25T15:00:00.000Z";

  it("checks a submitted report once, sees it too and clears «изменён после проверки»", () => {
    expect(checkMark(report(A, { changed_after_check_at: "2026-11-25T14:00:00Z" }), true, now)).toEqual({
      id: A,
      checked_at: now,
      seen_at: now,
      changed_after_check_at: null,
    });
    expect(checkMark(report(A, { seen_at: "2026-11-25T13:00:00Z" }), true, now)?.seen_at).toBe("2026-11-25T13:00:00Z");
    expect(checkMark(report(A, { checked_at: now }), true, now)).toBeNull();
  });

  it("takes the check off a checked report only; a missed day has none", () => {
    expect(checkMark(report(A, { checked_at: now, checked_by: "d" }), false, now)).toEqual({ id: A, checked_at: null, checked_by: null });
    expect(checkMark(report(A), false, now)).toBeNull();
    expect(checkMark(report(A, { status: "missed", submitted_at: null }), true, now)).toBeNull();
  });
});

describe("Realtime rows", () => {
  it("a change with the cached updated_at is the review fields alone, whatever the spelling", () => {
    const cached = report(A);
    expect(isReviewOnly({ id: A, updated_at: "2026-11-25T12:52:00.123456+00:00" }, cached)).toBe(true);
    expect(isReviewOnly({ id: A, updated_at: "2026-11-25T12:52:00.123Z" }, cached)).toBe(true);
    expect(isReviewOnly({ id: A, updated_at: "2026-11-25T12:59:00+00:00" }, cached)).toBe(false);
    expect(isReviewOnly({ id: A, updated_at: "2026-11-25T12:52:00.123456+00:00" }, undefined)).toBe(false);
    expect(sameInstant(null, "x")).toBe(false);
  });

  it("reads the marks of a row and leaves out what it does not carry", () => {
    expect(markOfRow({ id: A, seen_at: "s", checked_at: null, updated_at: "u" })).toEqual({ id: A, seen_at: "s", checked_at: null });
    expect(markOfRow({ seen_at: "s" })).toBeNull();
  });
});
