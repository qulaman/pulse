import { describe, expect, it } from "vitest";

import rosterFixture from "../tests/stt/roster.json";
import { resolveMatchingConfig } from "./ai/config";
import { matchName, trigramSimilarity, type RosterUser } from "./matchName";

const ROSTER: RosterUser[] = rosterFixture.users.map((u) => ({ ...u, is_active: true }));

function byQuery(query: string, roster: RosterUser[] = ROSTER) {
  return matchName({ assignee_id: null, assignee_queries: [query], assignee_confidence: 0 }, roster);
}

describe("trigramSimilarity", () => {
  it("is 1 for identical strings and 0 for disjoint ones", () => {
    expect(trigramSimilarity("марат", "марат")).toBe(1);
    expect(trigramSimilarity("марат", "xyz")).toBe(0);
  });
});

describe("matchName: fuzzy fallback", () => {
  it.each([
    ["Марату", "u-003"],
    ["Сәкенге", "u-004"],
    ["Баке", "u-007"],
    ["Алие", "u-008"],
    ["Динаре", "u-006"],
    ["Жандосу", "u-010"],
    ["Ерлану Б.", "u-001"],
    ["Ерлан Д", "u-002"],
  ])("matches %s to %s", (query, userId) => {
    const result = byQuery(query);
    expect(result.status).toBe("matched");
    expect(result.user_id).toBe(userId);
  });

  it("«Ерлану» is ambiguous between the two Erlans, never auto-assigned", () => {
    const result = byQuery("Ерлану");
    expect(result.status).toBe("ambiguous");
    expect(result.user_id).toBeNull();
    expect(result.candidates.map((c) => c.user_id).slice(0, 2).sort()).toEqual(["u-001", "u-002"]);
  });

  it("«Ерлан Т.» never lands on a wrong Erlan", () => {
    const result = byQuery("Ерлан Т.");
    expect(result.status).not.toBe("matched");
    expect(result.user_id).toBeNull();
  });

  it("«абракадабра» is unmatched, never a guess", () => {
    expect(byQuery("абракадабра")).toMatchObject({ status: "unmatched", user_id: null });
  });
});

describe("matchName: model id", () => {
  it("trusts a valid active id and flags low model confidence", () => {
    expect(
      matchName(
        { assignee_id: "u-003", assignee_queries: ["Марату"], assignee_confidence: 0.6 },
        ROSTER,
      ),
    ).toMatchObject({ status: "matched", user_id: "u-003", flag: "check" });

    expect(
      matchName(
        { assignee_id: "u-003", assignee_queries: ["Марату"], assignee_confidence: 0.95 },
        ROSTER,
      ),
    ).toMatchObject({ status: "matched", flag: "ok" });
  });

  it("falls back to fuzzy when the id is not in the roster", () => {
    expect(
      matchName(
        { assignee_id: "u-999", assignee_queries: ["Марату"], assignee_confidence: 0.9 },
        ROSTER,
      ),
    ).toMatchObject({ status: "matched", user_id: "u-003" });
  });

  it("never returns an inactive user", () => {
    const roster = ROSTER.map((u) => (u.id === "u-003" ? { ...u, is_active: false } : u));
    expect(byQuery("Марат", roster)).toMatchObject({ status: "unmatched", user_id: null });
    expect(
      matchName(
        { assignee_id: "u-003", assignee_queries: ["Марат"], assignee_confidence: 0.9 },
        roster,
      ),
    ).toMatchObject({ status: "unmatched" });
  });
});

describe("matchName: thresholds come from config", () => {
  const roster: RosterUser[] = [
    { id: "a", full_name: "Марат Оспанов", aliases: ["Марат"], is_active: true },
    { id: "b", full_name: "Мурат Оспанов", aliases: ["Мурат"], is_active: true },
  ];
  const input = { assignee_id: null, assignee_queries: ["Марат"], assignee_confidence: 0 };

  it("auto-fills only while the gap clears minGap", () => {
    const scores = matchName(input, roster).candidates;
    const gap = scores[0].score - scores[1].score;

    expect(matchName(input, roster, resolveMatchingConfig({ minGap: gap - 0.01 }))).toMatchObject({
      status: "matched",
      user_id: "a",
    });
    expect(matchName(input, roster, resolveMatchingConfig({ minGap: gap + 0.01 }))).toMatchObject({
      status: "ambiguous",
      user_id: null,
    });
  });

  it("drops below autoThreshold and below ambiguousThreshold as configured", () => {
    const best = matchName(input, roster).candidates[0].score;

    expect(
      matchName(input, roster, resolveMatchingConfig({ autoThreshold: best + 0.01 })),
    ).toMatchObject({ status: "ambiguous" });
    expect(
      matchName(input, roster, resolveMatchingConfig({ ambiguousThreshold: best + 0.01 })),
    ).toMatchObject({ status: "unmatched", candidates: [] });
  });
});
