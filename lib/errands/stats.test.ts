import { describe, expect, it } from "vitest";

import type { Errand } from "@/lib/errands/queries";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount } from "@/lib/errands/stats";
import { activeCount, ballTone, isActive, waitedFor } from "@/lib/errands/queries";

const AIGUL = "10000000-0000-0000-0000-000000000008";
const ERLAN = "10000000-0000-0000-0000-000000000006";

function errand(patch: Partial<Errand> = {}): Errand {
  return {
    id: Math.random().toString(36).slice(2),
    company_id: "c1",
    author_id: "d1",
    kind: "coffee",
    label: "Кофе",
    note: null,
    status: "sent",
    claimed_by: null,
    decline_reason: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    client_request_id: null,
    escalated_at: null,
    created_at: "2026-09-22T09:00:00Z",
    accepted_at: null,
    done_at: null,
    updated_at: "2026-09-22T09:00:00Z",
    claimed: null,
    author: null,
    ...patch,
  } as Errand;
}

describe("the ball", () => {
  it("counts what still waits for an answer", () => {
    const rows = [errand(), errand({ status: "accepted", claimed_by: AIGUL }), errand({ status: "done" })];
    expect(activeCount(rows)).toBe(2);
    expect(rows.filter(isActive)).toHaveLength(2);
  });

  it("stays grey while nobody has taken anything, and turns green once somebody has", () => {
    expect(ballTone([errand()])).toBe("var(--text-muted)");
    expect(ballTone([errand({ status: "accepted", claimed_by: AIGUL })])).toBe("var(--ok)");
    expect(ballTone([])).toBe("var(--text-muted)");
  });

  it("tells how long the errand has been waiting", () => {
    const now = new Date("2026-09-22T09:02:30Z");
    expect(waitedFor(errand(), now)).toBe("3 мин");
    expect(waitedFor(errand(), new Date("2026-09-22T09:00:10Z"))).toBe("только что");
    // два с половиной часа — это «2 ч»: округление вверх обещало бы больше, чем прошло
    expect(waitedFor(errand(), new Date("2026-09-22T11:30:00Z"))).toBe("2 ч");
  });
});

describe("the director's numbers", () => {
  it("counts by the person who took the errand", () => {
    const rows = [
      errand({ status: "done", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } }),
      errand({ status: "declined", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } }),
      errand({ status: "done", claimed_by: ERLAN, claimed: { full_name: "Ерлан Досов" } }),
      errand(),
    ];
    expect(tallyByPerson(rows)).toEqual([
      { name: "Айгуль", taken: 2, done: 1, declined: 1 },
      { name: "Ерлан", taken: 1, done: 1, declined: 0 },
    ]);
  });

  it("averages only what was actually finished", () => {
    const rows = [
      errand({ status: "done", created_at: "2026-09-22T09:00:00Z", done_at: "2026-09-22T09:04:00Z" }),
      errand({ status: "done", created_at: "2026-09-22T10:00:00Z", done_at: "2026-09-22T10:06:00Z" }),
      errand({ status: "cancelled" }),
    ];
    expect(averageDoneMinutes(rows)).toBe(5);
    expect(averageDoneMinutes([errand()])).toBeNull();
  });

  it("says how many requests nobody answered", () => {
    expect(unclaimedCount([errand(), errand({ status: "cancelled" }), errand({ status: "done", claimed_by: AIGUL })])).toBe(2);
  });

  it("prints minutes as time", () => {
    expect(humanMinutes(null)).toBe("—");
    expect(humanMinutes(7)).toBe("7 мин");
    expect(humanMinutes(65)).toBe("1 ч 5 мин");
    expect(humanMinutes(120)).toBe("2 ч");
  });
});
