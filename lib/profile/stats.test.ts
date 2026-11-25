import { describe, expect, it } from "vitest";

import { handedInOnTime } from "./stats";

const DEADLINE = "2026-11-20T13:00:00+00:00";

describe("handedInOnTime (D-189)", () => {
  it("counts a task handed in by the deadline as on time even when accepted later", () => {
    expect(handedInOnTime({ deadline: DEADLINE, completed_at: "2026-11-20T12:00:00+00:00", closed_at: "2026-11-23T09:00:00+00:00" })).toBe(true);
  });

  it("counts a hand-in after the deadline as late", () => {
    expect(handedInOnTime({ deadline: DEADLINE, completed_at: "2026-11-20T13:00:01+00:00", closed_at: "2026-11-20T14:00:00+00:00" })).toBe(false);
  });

  it("judges a task closed without a hand-in by its closing", () => {
    expect(handedInOnTime({ deadline: DEADLINE, completed_at: null, closed_at: "2026-11-19T10:00:00+00:00" })).toBe(true);
    expect(handedInOnTime({ deadline: DEADLINE, completed_at: null, closed_at: "2026-11-21T10:00:00+00:00" })).toBe(false);
  });

  it("calls a task without a deadline on time", () => {
    expect(handedInOnTime({ deadline: null, completed_at: null, closed_at: null })).toBe(true);
  });

  it("compares moments, not strings: another offset of the same instant is equal", () => {
    expect(handedInOnTime({ deadline: DEADLINE, completed_at: "2026-11-20T18:00:00+05:00", closed_at: null })).toBe(true);
  });
});
