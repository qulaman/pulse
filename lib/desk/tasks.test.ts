import { describe, expect, it } from "vitest";

import type { DeliveryRow } from "@/lib/tasks/receipts";

import {
  deliveryLine,
  firstChanged,
  inPlaceOf,
  latestLine,
  matchesDue,
  matchesStatus,
  parseTab,
  stageOf,
  underTitle,
  withSkipped,
} from "./tasks";

// 2026-11-03 12:00 in Aqtobe (UTC+5)
const NOW = new Date("2026-11-03T07:00:00Z");
const at = (iso: string) => new Date(iso).toISOString();

const delivery = (patch: Partial<DeliveryRow>): DeliveryRow =>
  ({
    acted_at: null,
    seen_at: null,
    status: "sent",
    sent_at: at("2026-11-03T04:14:00Z"),
    created_at: at("2026-11-03T04:14:00Z"),
    last_error: null,
    deliver_after: null,
    ...patch,
  }) as DeliveryRow;

describe("filters", () => {
  it("«сегодня» is what is still ahead today; a late task is «просрочено» only", () => {
    const today = { status: "accepted" as const, deadline: at("2026-11-03T13:00:00Z") };
    const late = { status: "accepted" as const, deadline: at("2026-11-03T05:00:00Z") };
    expect(matchesDue(today, "today", NOW)).toBe(true);
    expect(matchesDue(late, "today", NOW)).toBe(false);
    expect(matchesDue(late, "overdue", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-04T10:00:00Z") }, "tomorrow", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-09T10:00:00Z") }, "week", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: at("2026-11-20T10:00:00Z") }, "week", NOW)).toBe(false);
    expect(matchesDue({ status: "sent", deadline: null }, "none", NOW)).toBe(true);
    expect(matchesDue({ status: "sent", deadline: null }, null, NOW)).toBe(true);
    // handed in three days ago against a deadline back then: neither today nor this week
    expect(matchesDue({ status: "pending_review", deadline: at("2026-10-31T10:00:00Z") }, "today", NOW)).toBe(false);
    expect(matchesDue({ status: "pending_review", deadline: at("2026-10-31T10:00:00Z") }, "week", NOW)).toBe(false);
  });

  it("«В работе» takes in_progress too", () => {
    expect(matchesStatus({ status: "in_progress" }, "accepted")).toBe(true);
    expect(matchesStatus({ status: "rework" }, "accepted")).toBe(false);
    expect(matchesStatus({ status: "rework" }, null)).toBe(true);
  });

  it("reads only the three tabs from the address", () => {
    expect(parseTab("closed")).toBe("closed");
    expect(parseTab("all")).toBeNull();
    expect(parseTab(null)).toBeNull();
  });
});

describe("a row's words", () => {
  it("the stage is the director's move by its name, else the stage", () => {
    const task = { status: "pending_review" as const, deadline: null };
    expect(stageOf(task, "review", NOW)).toEqual({ text: "на приёмке", tone: "warn" });
    expect(stageOf({ status: "sent", deadline: null }, null, NOW).text).toBe("не принята");
    // a question keeps the stage — «Последнее» says the question
    expect(stageOf({ status: "accepted", deadline: null }, "question", NOW).text).toBe("в работе");
  });

  it("«Доставка» says «не открывал с», never «не получил»; once taken — «принял»", () => {
    const sent = { status: "sent" as const, accepted_at: null };
    expect(deliveryLine(sent, delivery({}), NOW)).toEqual({ text: "не открывал с 09:14", tone: "warn" });
    expect(deliveryLine(sent, delivery({ seen_at: at("2026-11-03T04:20:00Z") }), NOW)?.text).toBe("увидел 09:20");
    expect(deliveryLine(sent, delivery({ status: "failed", last_error: "no_subscription" }), NOW)?.text).toBe("уведомления не включены");
    expect(deliveryLine(sent, null, NOW)).toBeNull();
    expect(deliveryLine({ status: "accepted", accepted_at: at("2026-11-03T04:22:00Z") }, null, NOW)).toEqual({ text: "принял 09:22", tone: "ok" });
    expect(deliveryLine({ status: "revoked", accepted_at: null }, null, NOW)).toBeNull();
  });

  it("«Последнее»: the question, the refusal, the handed-in work", () => {
    const task = { status: "accepted" as const, assignee_id: "e1" };
    const row = { question: "Какой формат?", time_request: null, decline_reason: null, partial: false, last_message: null };
    expect(latestLine(task, row, NOW)).toEqual({ text: "«Какой формат?»", tone: "warn" });
    expect(latestLine({ status: "declined", assignee_id: "e1" }, { ...row, question: null, decline_reason: "Нет доступа" }, NOW)?.text).toBe("отказ: Нет доступа");
    const handed = {
      ...row,
      question: null,
      partial: true,
      last_message: { id: "m1", content: "готово", type: "photo", sender_id: "e1", seq: 3, created_at: at("2026-11-03T06:00:00Z") },
    };
    expect(latestLine({ status: "pending_review", assignee_id: "e1" }, handed, NOW)?.text).toBe("сдал с фото · не всё · «готово»");
    expect(latestLine(task, undefined, NOW)).toBeNull();
  });

  it("the grey line under the title is the newest word unless «Последнее» says it", () => {
    const last = { id: "m1", content: "Еду", type: "text", sender_id: "e1", seq: 2, created_at: at("2026-11-03T06:00:00Z") };
    const row = { question: null, time_request: null, decline_reason: null, partial: false, last_message: last };
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, row, "d1", NOW)).toBe("Еду");
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, { ...row, last_message: { ...last, sender_id: "d1" } }, "d1", NOW)).toBe("Вы: Еду");
    expect(underTitle({ status: "accepted", assignee_id: "e1" }, { ...row, question: "Когда?" }, "d1", NOW)).toBeNull();
  });
});

describe("keeping one's place", () => {
  it("the row in the place of one that left", () => {
    expect(inPlaceOf(["a", "b", "c"], 1)).toBe("b");
    expect(inPlaceOf(["a", "b"], 5)).toBe("b");
    expect(inPlaceOf([], 0)).toBeNull();
  });

  it("skipped tasks go to the end, in the order skipped", () => {
    const items = ["a", "b", "c", "d"];
    expect(withSkipped(items, (id) => id, ["b", "a"])).toEqual(["c", "d", "b", "a"]);
    expect(withSkipped(items, (id) => id, ["x"])).toEqual(items);
  });

  it("a glow for a changed row or a new open one, not for a page of history", () => {
    const before = new Map([["a", "1"], ["b", "1"]]);
    expect(firstChanged(before, new Map([["a", "1"], ["b", "2"]]), () => "accepted")).toBe("b");
    expect(firstChanged(before, new Map([...before, ["c", "1"]]), () => "sent")).toBe("c");
    expect(firstChanged(before, new Map([...before, ["c", "1"]]), () => "done")).toBeNull();
    expect(firstChanged(new Map(), new Map([["a", "1"]]), () => "sent")).toBeNull();
  });
});
