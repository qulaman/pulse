import { describe, expect, it } from "vitest";

import { restoreOne } from "./mutations";

const row = (id: string, status: string) => ({ id, status });

describe("«Отменить» puts back one task only (D-139)", () => {
  it("restores the row in place and keeps what changed on the others meanwhile", () => {
    const before = [row("a", "pending_review"), row("b", "pending_review")];
    // a — taken back; b — accepted in its own window, still shown as done
    const now = [row("a", "done"), row("b", "done")];
    expect(restoreOne(before, now, "a")).toEqual([row("a", "pending_review"), row("b", "done")]);
  });

  it("brings a deleted row back to its old place", () => {
    const before = [row("a", "accepted"), row("b", "sent"), row("c", "sent")];
    const now = [row("a", "accepted"), row("c", "sent")];
    expect(restoreOne(before, now, "b")).toEqual(before);
  });

  it("restores the task's own object, leaves other caches alone", () => {
    expect(restoreOne(row("a", "pending_review"), row("a", "done"), "a")).toEqual(row("a", "pending_review"));
    const other = row("z", "sent");
    expect(restoreOne(row("z", "accepted"), other, "a")).toBe(other);
    // a list that never held the task stays as it is now
    const list = [row("x", "sent")];
    expect(restoreOne([row("y", "sent")], list, "a")).toBe(list);
  });
});
