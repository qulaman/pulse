import { describe, expect, it } from "vitest";

import { handedLabel } from "./handed";

const NOW = new Date("2026-09-25T09:00:00Z");

describe("handedLabel", () => {
  it("says who has it and how it is doing", () => {
    expect(handedLabel({ status: "accepted", deadline: null, assignee: { full_name: "Марат Ахметов" } }, NOW)).toBe("→ Марат · в работе");
  });

  it("says «просрочена» past the deadline", () => {
    expect(handedLabel({ status: "sent", deadline: "2026-09-25T08:00:00Z", assignee: { full_name: "Айгуль" } }, NOW)).toBe("→ Айгуль · просрочена");
  });

  it("is «→ поручено» before the tasks have loaded", () => {
    expect(handedLabel(undefined, NOW)).toBe("→ поручено");
  });
});
