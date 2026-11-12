import { describe, expect, it } from "vitest";

import { awaitsMyMove, myMoveFilter } from "./my-move";

const NOW = new Date("2026-11-12T10:00:00Z");

describe("awaitsMyMove — the orders waiting for the employee (D-173)", () => {
  it("counts a new order, a rework and an overdue one in work", () => {
    expect(awaitsMyMove({ status: "sent", deadline: null }, NOW)).toBe(true);
    expect(awaitsMyMove({ status: "rework", deadline: "2026-11-13T10:00:00Z" }, NOW)).toBe(true);
    expect(awaitsMyMove({ status: "accepted", deadline: "2026-11-12T09:59:00Z" }, NOW)).toBe(true);
  });
  it("leaves out work on time, handed in, closed and unscheduled", () => {
    expect(awaitsMyMove({ status: "accepted", deadline: "2026-11-12T10:01:00Z" }, NOW)).toBe(false);
    expect(awaitsMyMove({ status: "accepted", deadline: null }, NOW)).toBe(false);
    expect(awaitsMyMove({ status: "pending_review", deadline: "2026-11-11T10:00:00Z" }, NOW)).toBe(false);
    expect(awaitsMyMove({ status: "done", deadline: "2026-11-11T10:00:00Z" }, NOW)).toBe(false);
    expect(awaitsMyMove({ status: "scheduled", deadline: null }, NOW)).toBe(false);
  });
  it("says the same rule to PostgREST", () => {
    expect(myMoveFilter(NOW)).toBe("status.in.(sent,rework),and(status.eq.accepted,deadline.lt.2026-11-12T10:00:00.000Z)");
  });
});
