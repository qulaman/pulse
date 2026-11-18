import { describe, expect, it } from "vitest";

import type { DeliveryRow } from "@/lib/tasks/receipts";

import type { CalendarEvent } from "./queries";
import { meetingReceipts } from "./receipts";

const NOW = new Date("2026-11-17T12:00:00+05:00");
const CREATED = "2026-11-17T09:00:00+05:00";

type Person = { user_id: string; status: string; responded_at?: string | null };

function meeting(people: Person[], extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e-1",
    author_id: "dir",
    created_at: CREATED,
    recurrence_rule_id: null,
    participants: people.map((p) => ({
      event_id: "e-1",
      user_id: p.user_id,
      status: p.status,
      reason: null,
      responded_at: p.responded_at ?? null,
      created_at: CREATED,
      person: { full_name: "Сотрудник" },
    })),
    ...extra,
  } as unknown as CalendarEvent;
}

function row(user_id: string, extra: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: `d-${user_id}-${extra.created_at ?? "x"}`,
    company_id: "c",
    user_id,
    task_id: null,
    event_kind: "event_invite",
    channel: "push",
    status: "queued",
    tier: 1,
    attempts: 0,
    last_error: null,
    meta: {},
    created_at: "2026-11-17T09:00:05+05:00",
    sent_at: null,
    seen_at: null,
    acted_at: null,
    deliver_after: null,
    ...extra,
  } as DeliveryRow;
}

describe("meetingReceipts", () => {
  it("says, for each person who owes an answer, what became of their invitation", () => {
    const event = meeting([
      { user_id: "dir", status: "going" },
      { user_id: "seen", status: "invited" },
      { user_id: "sent", status: "invited" },
      { user_id: "held", status: "invited" },
      { user_id: "off", status: "invited" },
    ]);
    const receipts = meetingReceipts(
      [
        row("seen", { status: "sent", sent_at: "2026-11-17T09:01:00+05:00", seen_at: "2026-11-17T09:20:00+05:00" }),
        row("sent", { status: "sent", sent_at: "2026-11-17T09:14:00+05:00" }),
        row("held", { deliver_after: "2026-11-18T08:00:00+05:00" }),
        row("off", { status: "failed", last_error: "no_subscription" }),
      ],
      event,
      NOW,
    );
    expect(receipts.get("seen")).toMatchObject({ text: "увидел 09:20", tone: "muted" });
    expect(receipts.get("sent")).toMatchObject({ text: "не открывал с 09:14", tone: "warn" });
    expect(receipts.get("held")?.text).toBe("отправлю завтра 08:00");
    expect(receipts.get("off")).toMatchObject({ text: "уведомления не включены", tone: "warn" });
    expect(receipts.has("dir")).toBe(false);
  });

  it("takes the newest notice, and marks a move", () => {
    const event = meeting([{ user_id: "a", status: "invited" }]);
    const receipts = meetingReceipts(
      [
        row("a", { status: "sent", sent_at: "2026-11-17T09:01:00+05:00", seen_at: "2026-11-17T09:02:00+05:00" }),
        row("a", { event_kind: "event_moved", status: "sent", created_at: "2026-11-17T10:00:00+05:00", sent_at: "2026-11-17T10:00:10+05:00" }),
      ],
      event,
      NOW,
    );
    expect(receipts.get("a")).toEqual({ text: "не открывал с 10:00", tone: "warn", moved: true });
  });

  it("says nothing for an answer, unless a move came after it", () => {
    const event = meeting([
      { user_id: "before", status: "going", responded_at: "2026-11-17T09:30:00+05:00" },
      { user_id: "after", status: "going", responded_at: "2026-11-17T10:30:00+05:00" },
      { user_id: "plain", status: "going", responded_at: "2026-11-17T09:30:00+05:00" },
      { user_id: "no", status: "declined" },
    ]);
    const moved = { event_kind: "event_moved", status: "sent", created_at: "2026-11-17T10:00:00+05:00", sent_at: "2026-11-17T10:00:10+05:00" } as const;
    const receipts = meetingReceipts([row("before", moved), row("after", moved), row("plain", { status: "sent", sent_at: CREATED }), row("no", moved)], event, NOW);
    expect(receipts.get("before")).toMatchObject({ text: "не открывал с 10:00", moved: true });
    expect(receipts.has("after")).toBe(false);
    expect(receipts.has("plain")).toBe(false);
    expect(receipts.has("no")).toBe(false);
  });

  it("says «без приглашения» for a meeting of a series, and nothing when a plain meeting has no row", () => {
    const people = [{ user_id: "a", status: "invited" }];
    expect(meetingReceipts([], meeting(people, { recurrence_rule_id: "r-1" }), NOW).get("a")).toEqual({ text: "без приглашения", tone: "muted" });
    expect(meetingReceipts([], meeting(people), NOW).has("a")).toBe(false);
  });

  it("ignores rows older than the meeting and kinds that are not about it", () => {
    const event = meeting([{ user_id: "a", status: "invited" }]);
    const receipts = meetingReceipts(
      [
        row("a", { status: "sent", sent_at: "2026-11-16T09:00:00+05:00", created_at: "2026-11-16T09:00:00+05:00" }),
        row("a", { event_kind: "event_cancelled", status: "sent", sent_at: "2026-11-17T09:10:00+05:00" }),
      ],
      event,
      NOW,
    );
    expect(receipts.has("a")).toBe(false);
  });
});
