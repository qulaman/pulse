import { describe, expect, it } from "vitest";

import { periodLines, periodWindows, tallyTasks, type PeriodInput, type PeriodTask, type ReportTally, type TaskTally } from "./period";

const TODAY = "2026-11-04";
const { current, previous } = periodWindows(TODAY);

const handed = (patch: Partial<PeriodTask>): PeriodTask => ({ status: "done", deadline: "2026-11-02T13:00:00Z", completed_at: "2026-11-02T12:00:00Z", ...patch });
const tally = (patch: Partial<TaskTally> = {}): TaskTally => ({ handed: 0, onTime: 0, late: 0, returned: 0, ...patch });
const reports = (submitted: number, missed: number, points = 0): ReportTally => ({ submitted, missed, points });
const lines = (input: Partial<PeriodInput>) => periodLines({ tasks: null, reports: { current: null, previous: null }, pointsOn: false, ...input });
const line = (input: Partial<PeriodInput>, key: string) => lines(input).find((row) => row.key === key);

describe("periodWindows", () => {
  it("is 30 days with today and the 30 before, touching and not overlapping", () => {
    expect(current).toEqual({ from: "2026-10-06", to: "2026-11-04" });
    expect(previous).toEqual({ from: "2026-09-06", to: "2026-10-05" });
  });
});

describe("tallyTasks", () => {
  it("counts by the deadline as handInVerdict does: on the minute is in time", () => {
    const tasks = [handed({}), handed({ completed_at: "2026-11-02T13:00:00Z" }), handed({ completed_at: "2026-11-02T13:00:20Z" })];
    expect(tallyTasks(tasks, [], current)).toEqual({ handed: 3, onTime: 2, late: 1, returned: 0 });
  });

  it("a task without a deadline is handed in and counts in neither", () => {
    expect(tallyTasks([handed({ deadline: null })], [], current)).toEqual({ handed: 1, onTime: 0, late: 0, returned: 0 });
  });

  it("takes what waits for the director too, not only what he accepted", () => {
    expect(tallyTasks([handed({ status: "pending_review" })], [], current).handed).toBe(1);
  });

  it("a task sent back is not handed in, though it keeps the old completed_at", () => {
    expect(tallyTasks([handed({ status: "rework" }), handed({ status: "accepted" }), handed({ status: "revoked" })], [], current).handed).toBe(0);
  });

  it("splits the windows by the company's day, not by UTC", () => {
    // 2026-10-05 19:30 UTC is 00:30 on the 6th in Aqtobe: already the current window
    const edge = handed({ deadline: null, completed_at: "2026-10-05T19:30:00Z" });
    expect(tallyTasks([edge], [], current).handed).toBe(1);
    expect(tallyTasks([edge], [], previous).handed).toBe(0);
    const before = handed({ deadline: null, completed_at: "2026-10-05T18:30:00Z" });
    expect(tallyTasks([before], [], current).handed).toBe(0);
    expect(tallyTasks([before], [], previous).handed).toBe(1);
  });

  it("leaves out what is older than the window", () => {
    expect(tallyTasks([handed({ completed_at: "2026-08-01T10:00:00Z" })], [], previous).handed).toBe(0);
  });

  it("counts every return by its moment: one task can come back twice", () => {
    const returns = ["2026-11-01T10:00:00Z", "2026-11-03T10:00:00Z", "2026-09-20T10:00:00Z"];
    expect(tallyTasks([], returns, current).returned).toBe(2);
    expect(tallyTasks([], returns, previous).returned).toBe(1);
  });
});

describe("periodLines", () => {
  const worked: PeriodInput["tasks"] = { current: tally({ handed: 12, onTime: 10, late: 2, returned: 1 }), previous: tally({ handed: 9, onTime: 8, late: 1, returned: 3 }) };

  it("says nothing happened with no lines at all, not with zeros", () => {
    expect(lines({ tasks: { current: tally(), previous: tally() }, reports: { current: reports(0, 0), previous: null } })).toEqual([]);
  });

  it("a quiet month after a busy one is also the phrase: nothing to count now", () => {
    expect(lines({ tasks: { current: tally(), previous: tally({ handed: 8 }) } })).toEqual([]);
  });

  it("no share without a deadline: the line is gone, never 0% or NaN", () => {
    const input = { tasks: { current: tally({ handed: 4 }), previous: tally() } };
    expect(lines(input).map((row) => row.key)).toEqual(["handed", "returned"]);
  });

  it("the share and its numbers, against the 30 days before in points", () => {
    expect(line({ tasks: worked }, "handed")).toMatchObject({ value: "12", change: "↑ 3" });
    expect(line({ tasks: worked }, "onTime")).toMatchObject({ value: "83%", detail: "10 из 12", change: "↓ 6 п. п." });
    expect(line({ tasks: worked }, "returned")).toMatchObject({ value: "1", change: "↓ 2" });
  });

  it("equal periods read as words", () => {
    const same = { current: tally({ handed: 5, onTime: 5 }), previous: tally({ handed: 5, onTime: 5 }) };
    expect(line({ tasks: same }, "handed")?.change).toBe("как раньше");
    expect(line({ tasks: same }, "onTime")?.change).toBe("как раньше");
  });

  it("no comparison when the 30 days before are empty: a newcomer did not grow from zero", () => {
    const input = { tasks: { current: tally({ handed: 3, onTime: 3 }), previous: tally() } };
    expect(lines(input).every((row) => row.change === null)).toBe(true);
  });

  it("no comparison of shares when the time before had no deadlines", () => {
    const input = { tasks: { current: tally({ handed: 3, onTime: 3 }), previous: tally({ handed: 2 }) } };
    expect(line(input, "handed")?.change).toBe("↑ 1");
    expect(line(input, "onTime")?.change).toBeNull();
  });

  it("a side quiet now but busy before still stands: the fall is the news", () => {
    const input = { tasks: { current: tally(), previous: tally({ handed: 8, onTime: 8 }) }, reports: { current: reports(5, 0), previous: null } };
    expect(line(input, "handed")).toMatchObject({ value: "0", change: "↓ 8" });
    expect(line(input, "onTime")).toBeUndefined();
  });

  it("reports: handed in of those due, the share against the time before", () => {
    const input = { reports: { current: reports(18, 3), previous: reports(20, 0) } };
    expect(line(input, "reports")).toMatchObject({ value: "18 из 21", change: "↓ 14 п. п." });
  });

  it("reports off or no row: no line, whatever the tasks say", () => {
    expect(lines({ tasks: worked }).some((row) => row.key === "reports" || row.key === "points")).toBe(false);
  });

  it("nothing due: no «0 из 0»", () => {
    expect(line({ tasks: worked, reports: { current: reports(0, 0), previous: reports(4, 1) } }, "reports")).toBeUndefined();
  });

  it("a person with reports only stands on those, without zero tasks", () => {
    expect(lines({ tasks: { current: tally(), previous: tally() }, reports: { current: reports(5, 0), previous: null } }).map((row) => row.key)).toEqual(["reports"]);
  });

  it("points come with the reports and only while the game is on", () => {
    const input = { reports: { current: reports(4, 1, -6), previous: reports(5, 0, 5) } };
    expect(line(input, "points")).toBeUndefined();
    expect(line({ ...input, pointsOn: true }, "points")).toMatchObject({ value: "−6", change: "↓ 11" });
    expect(line({ reports: { current: reports(5, 0, 5), previous: null }, pointsOn: true }, "points")).toMatchObject({ value: "+5", change: null });
  });

  it("no task line at all when the tasks could not be read", () => {
    expect(lines({ tasks: null, reports: { current: reports(5, 0), previous: null } }).map((row) => row.key)).toEqual(["reports"]);
  });
});
