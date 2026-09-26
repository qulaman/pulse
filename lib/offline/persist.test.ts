import { describe, expect, it } from "vitest";

import { isUsable, shouldKeep, SNAPSHOT_MAX_AGE_MS, type Snapshot } from "./persist";

const query = (key: unknown[], status: "success" | "pending" | "error" = "success", meta?: Record<string, unknown>) =>
  ({ queryKey: key, state: { status }, meta }) as unknown as Parameters<typeof shouldKeep>[0];

describe("shouldKeep", () => {
  it("keeps settled data of the screens", () => {
    expect(shouldKeep(query(["tasks", "sent", "u1"]))).toBe(true);
    expect(shouldKeep(query(["people"]))).toBe(true);
  });
  it("does not keep what has not settled", () => {
    expect(shouldKeep(query(["tasks"], "pending"))).toBe(false);
    expect(shouldKeep(query(["tasks"], "error"))).toBe(false);
  });
  it("leaves out the heavy desk tools and a query that asks not to be kept", () => {
    expect(shouldKeep(query(["admin", "tasks", 0]))).toBe(false);
    expect(shouldKeep(query(["lab"]))).toBe(false);
    expect(shouldKeep(query(["people"], "success", { keep: false }))).toBe(false);
  });
});

describe("isUsable", () => {
  const now = 1_800_000_000_000;
  const snapshot = (build: string, age: number): Snapshot => ({ build, savedAt: now - age, state: { queries: [], mutations: [] } });
  it("takes this build's fresh snapshot", () => {
    expect(isUsable(snapshot("b1", 60_000), "b1", now)).toBe(true);
  });
  it("refuses another build's data — its shape may differ", () => {
    expect(isUsable(snapshot("b0", 60_000), "b1", now)).toBe(false);
  });
  it("refuses a week-old snapshot and one from the future", () => {
    expect(isUsable(snapshot("b1", SNAPSHOT_MAX_AGE_MS + 1), "b1", now)).toBe(false);
    expect(isUsable(snapshot("b1", -1), "b1", now)).toBe(false);
  });
  it("refuses nothing kept", () => {
    expect(isUsable(undefined, "b1", now)).toBe(false);
  });
});

