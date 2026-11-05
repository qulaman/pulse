import { describe, expect, it } from "vitest";

import { canCancel, cancelWord } from "@/components/desk/errands/words";

const ME = "me";

describe("«Отменить» of a request", () => {
  it("is for who asked, while the request is alive — the rule of transition_errand", () => {
    expect(canCancel({ status: "sent", author_id: ME }, ME)).toBe(true);
    expect(canCancel({ status: "accepted", author_id: ME }, ME)).toBe(true);
  });

  it("is not for another director or a secretary", () => {
    expect(canCancel({ status: "sent", author_id: "other" }, ME)).toBe(false);
    expect(canCancel({ status: "sent", author_id: ME }, "")).toBe(false);
  });

  it("is gone once the request is closed", () => {
    for (const status of ["done", "declined", "cancelled"] as const) expect(canCancel({ status, author_id: ME }, ME)).toBe(false);
  });

  it("speaks as the phone does: an alarm is «Ложная тревога»", () => {
    expect(cancelWord({ urgent: false })).toBe("Отменить");
    expect(cancelWord({ urgent: true })).toBe("Ложная тревога");
  });
});
