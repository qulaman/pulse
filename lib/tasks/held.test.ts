import { describe, expect, it } from "vitest";

import { heldLine, whenHeld, type HeldRow } from "./held";

// 2026-09-17 23:30 Aqtobe (UTC+5): the window opens tomorrow at 08:00
const NOW = new Date("2026-09-17T18:30:00Z");
const MORNING = "2026-09-18T03:00:00Z";

const row = (patch: Partial<HeldRow>): HeldRow => ({
  event_kind: "task_sent",
  deliver_after: MORNING,
  created_at: "2026-09-17T18:20:00Z",
  ...patch,
});

describe("whenHeld", () => {
  it("says «в 16:00» today and «завтра 08:00» with a day word", () => {
    expect(whenHeld("2026-09-17T11:00:00Z", new Date("2026-09-17T07:00:00Z"))).toBe("в 16:00");
    expect(whenHeld(MORNING, NOW)).toBe("завтра 08:00");
  });
});

describe("heldLine", () => {
  it("names what waits by what the director did", () => {
    expect(heldLine([row({})], NOW)).toBe("отправлю завтра 08:00");
    expect(heldLine([row({ event_kind: "rework" })], NOW)).toBe("доработка уйдёт завтра 08:00");
    expect(heldLine([row({ event_kind: "done" })], NOW)).toBe("«Принято» уйдёт завтра 08:00");
    expect(heldLine([row({ event_kind: "deadline_extended" })], NOW)).toBe("новый срок уйдёт завтра 08:00");
  });

  it("the newest move leads the line", () => {
    const rows = [row({ event_kind: "task_sent", created_at: "2026-09-17T18:00:00Z" }), row({ event_kind: "deadline_extended", created_at: "2026-09-17T18:25:00Z" })];
    expect(heldLine(rows, NOW)).toBe("новый срок уйдёт завтра 08:00");
  });

  it("leaves a message to the thread and says nothing once the morning has come", () => {
    expect(heldLine([row({ event_kind: "message" })], NOW)).toBeNull();
    expect(heldLine([row({})], new Date("2026-09-18T03:00:01Z"))).toBeNull();
    expect(heldLine([], NOW)).toBeNull();
  });
});
