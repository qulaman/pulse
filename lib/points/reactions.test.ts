import { describe, expect, it } from "vitest";

import {
  DEFAULT_REACTION_PRICES,
  isReactable,
  isReactionCode,
  priceLabel,
  REACTION_CODES,
  REACTION_GLYPH,
  reactionPricesOf,
  showsReactionBar,
} from "./reactions";

describe("reactions of the director (D-133, И-68)", () => {
  it("seven of them, the owner's prices by default: 👍 1, 🔥 10, ❤️ 100, the rest free", () => {
    expect(REACTION_CODES.map((code) => REACTION_GLYPH[code]).join("")).toBe("👍🔥❤️👏⚡🤔👎");
    expect(DEFAULT_REACTION_PRICES).toMatchObject({ like: 1, fire: 10, heart: 100, clap: 0, dislike: 0 });
  });

  it("reads the stored prices, a broken or negative one falls back to its default (as reaction_points())", () => {
    expect(reactionPricesOf({ fire: 25, heart: -5, like: "много", zap: 2.5 })).toMatchObject({ fire: 25, heart: 100, like: 1, zap: 0 });
    expect(reactionPricesOf(null)).toEqual(DEFAULT_REACTION_PRICES);
  });

  it("knows its codes", () => {
    expect(isReactionCode("heart")).toBe(true);
    expect(isReactionCode("rocket")).toBe(false);
  });

  it("a task is reactable once it reached somebody else and was not taken back", () => {
    expect(isReactable({ status: "done", assignee_id: "u" }, "d")).toBe(true);
    expect(isReactable({ status: "scheduled", assignee_id: "u" }, "d")).toBe(false);
    expect(isReactable({ status: "revoked", assignee_id: "u" }, "d")).toBe(false);
    expect(isReactable({ status: "done", assignee_id: "d" }, "d")).toBe(false);
    expect(isReactable({ status: "done", assignee_id: null }, "d")).toBe(false);
  });

  it("the row of seven shows on handed-in and accepted work, or where a reaction already is", () => {
    expect(showsReactionBar("pending_review", false)).toBe(true);
    expect(showsReactionBar("done", false)).toBe(true);
    expect(showsReactionBar("accepted", false)).toBe(false);
    expect(showsReactionBar("accepted", true)).toBe(true);
  });

  it("«+10» under a paying reaction, nothing under a free one", () => {
    expect(priceLabel(10)).toBe("+10");
    expect(priceLabel(0)).toBeNull();
  });
});
