import { describe, expect, it } from "vitest";

import type { TvLine } from "./feed";
import { MOMENT_MS, momentOf } from "./moment";

const NOW = new Date("2026-11-20T07:00:00Z");

function line(id: string, kind: TvLine["kind"], agoMs: number, extra: Partial<TvLine> = {}): TvLine {
  return {
    id,
    kind,
    name: "Марат Ахметов",
    label: kind,
    detail: "Сдал объект «Север» на день раньше",
    amount: kind === "points" ? 50 : null,
    tone: "gold",
    at: new Date(NOW.getTime() - agoMs),
    ...extra,
  };
}

describe("momentOf", () => {
  it("shows fresh praise with its points and reason", () => {
    const moment = momentOf([line("p1", "points", 3_000)], NOW, false);
    expect(moment).toMatchObject({ id: "p1", kind: "points", amount: 50, name: "Марат Ахметов" });
  });

  it("lets the moment go once it is older than the window", () => {
    expect(momentOf([line("p1", "points", MOMENT_MS)], NOW, false)).toBeNull();
    expect(momentOf([line("p1", "points", MOMENT_MS - 1)], NOW, false)).not.toBeNull();
  });

  it("never makes a moment of a closed task or a new order", () => {
    expect(momentOf([line("t1", "task_done", 1_000), line("t2", "task_sent", 1_000)], NOW, false)).toBeNull();
  });

  it("takes the newest of two fresh moments", () => {
    const moment = momentOf([line("a1", "announcement", 9_000), line("m1", "merch", 2_000)], NOW, false);
    expect(moment?.id).toBe("m1");
    expect(moment?.amount).toBeNull();
  });

  it("has no moments with a guest in the office", () => {
    expect(momentOf([line("p1", "points", 1_000)], NOW, true)).toBeNull();
  });

  it("tolerates a kiosk clock a little behind the base", () => {
    expect(momentOf([line("p1", "points", -3_000)], NOW, false)).not.toBeNull();
    expect(momentOf([line("p1", "points", -60_000)], NOW, false)).toBeNull();
  });
});
