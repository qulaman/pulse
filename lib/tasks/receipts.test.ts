import { describe, expect, it } from "vitest";

import { receiptLine, type DeliveryRow } from "./receipts";

// 2026-09-17 14:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-17T09:00:00Z");

function delivery(extra: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: "d1",
    company_id: "c",
    user_id: "u",
    task_id: "t",
    event_kind: "message",
    channel: "push",
    status: "queued",
    tier: 1,
    attempts: 0,
    last_error: null,
    meta: {},
    created_at: "2026-09-17T04:00:00Z",
    deliver_after: "2026-09-17T04:00:00Z",
    sent_at: null,
    seen_at: null,
    acted_at: null,
    ...extra,
  } as DeliveryRow;
}

describe("receiptLine (принцип 8, D-32)", () => {
  it("«прочитал» wins over «увидел», and both over «не открывал»", () => {
    const seen = "2026-09-17T04:14:00Z";
    const acted = "2026-09-17T04:20:00Z";
    expect(receiptLine(delivery({ status: "sent", sent_at: seen, seen_at: seen, acted_at: acted }), NOW)).toEqual({
      text: "прочитал 09:20",
      tone: "ok",
    });
    expect(receiptLine(delivery({ status: "sent", sent_at: seen, seen_at: seen }), NOW)).toEqual({
      text: "увидел 09:14",
      tone: "muted",
    });
  });

  it("sent and untouched is «не открывал с …», never «не получил»", () => {
    const line = receiptLine(delivery({ status: "sent", sent_at: "2026-09-17T04:14:00Z" }), NOW)!;
    expect(line).toEqual({ text: "не открывал с 09:14", tone: "warn" });
  });

  it("no subscription is a channel problem, said plainly", () => {
    expect(receiptLine(delivery({ status: "failed", last_error: "no_subscription" }), NOW)).toEqual({
      text: "уведомления не включены",
      tone: "warn",
    });
    expect(receiptLine(delivery({ status: "failed", last_error: "push 500" }), NOW)).toBeNull();
  });

  it("quiet hours promise a time; a row about to go says nothing", () => {
    expect(receiptLine(delivery({ deliver_after: "2026-09-18T03:00:00Z" }), NOW)).toEqual({
      text: "отправлю завтра 08:00",
      tone: "muted",
    });
    expect(receiptLine(delivery({ deliver_after: "2026-09-17T11:00:00Z" }), NOW)?.text).toBe("отправлю в 16:00");
    expect(receiptLine(delivery(), NOW)).toBeNull();
    expect(receiptLine(null, NOW)).toBeNull();
  });
});
