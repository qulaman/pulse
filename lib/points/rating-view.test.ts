import { describe, expect, it } from "vitest";

import { myRatingWords, ratingLineView, ratingSummary } from "./rating-view";
import type { RatingRow } from "./queries";

const row = (patch: Partial<RatingRow> = {}): RatingRow => ({
  user_id: "u",
  display_name: "Айболат",
  points: 15,
  rank: 1,
  delta_vs_prev: 0,
  on_time_pct: 100,
  is_me: false,
  ...patch,
});

// the dev company's week of the review: 15, 0 and one's own −1 000 000
const WEEK = [row(), row({ user_id: "e", display_name: "Ербол", points: 0, rank: 2, on_time_pct: null }), row({ user_id: "y", display_name: "Юля", points: -1_000_000, rank: 3, delta_vs_prev: -1_000_000, on_time_pct: null, is_me: true })];

describe("ratingLineView (D-45)", () => {
  it("somebody else's minus is never drawn as a number, nor their fall", () => {
    expect(ratingLineView(row({ points: -1_000_000, delta_vs_prev: -1_000_000 }))).toEqual({ points: null, delta: null });
    expect(ratingLineView(row({ points: 0, delta_vs_prev: -5 }))).toEqual({ points: null, delta: null });
    expect(ratingLineView(row({ points: 15, delta_vs_prev: -292 }))).toEqual({ points: 15, delta: null });
    expect(ratingLineView(row({ points: 15, delta_vs_prev: 7 }))).toEqual({ points: 15, delta: 7 });
  });

  it("one's own line shows everything, the fall too", () => {
    expect(ratingLineView(row({ points: -1_000_000, delta_vs_prev: -1_000_000, is_me: true }))).toEqual({ points: -1_000_000, delta: -1_000_000 });
    expect(ratingLineView(row({ points: 0, delta_vs_prev: 0, is_me: true }))).toEqual({ points: 0, delta: null });
  });
});

describe("ratingSummary", () => {
  it("«очков за период» is what was earned — the minuses do not make it −999 985", () => {
    expect(ratingSummary(WEEK)).toEqual({ earned: 15, scored: 1, onTimeAvg: 100 });
  });

  it("empty", () => {
    expect(ratingSummary([])).toEqual({ earned: 0, scored: 0, onTimeAvg: null });
  });
});

describe("myRatingWords — one story about oneself", () => {
  it("a minus says the minus and the balance, not «очков пока нет»", () => {
    expect(myRatingWords(WEEK[2], WEEK[1], "week", 910)).toEqual({ kind: "minus", text: "За неделю у вас −1 000 000 · на счету 910" });
    expect(myRatingWords(WEEK[2], WEEK[1], "month")).toEqual({ kind: "minus", text: "За месяц у вас −1 000 000" });
  });

  it("nothing is «пока нет», points are the place and the gap to the one ahead", () => {
    expect(myRatingWords(row({ points: 0, is_me: true }), undefined, "week").kind).toBe("none");
    expect(myRatingWords(row({ points: 10, rank: 2, is_me: true }), row({ points: 15 }), "week")).toEqual({ kind: "place", rank: 2, gap: 5, leader: false });
    expect(myRatingWords(row({ points: 15, rank: 1, is_me: true }), undefined, "all")).toEqual({ kind: "place", rank: 1, gap: null, leader: true });
  });
});
