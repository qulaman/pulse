import { describe, expect, it } from "vitest";

import { parseCost, sttCost } from "./pricing";

describe("parseCost", () => {
  it("bills each token class at its own rate", () => {
    const cost = parseCost("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1 + 5 + 0.1 + 1.25, 6);
  });

  it("returns null for a model without a price", () => {
    expect(
      parseCost("gpt-99", {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ).toBeNull();
  });
});

describe("sttCost", () => {
  it("bills per minute of audio", () => {
    expect(sttCost("openai-4o", 30_000)).toBeCloseTo(0.003, 6);
  });

  it("returns null without a duration or a price", () => {
    expect(sttCost("openai-4o", null)).toBeNull();
    expect(sttCost("openai-4o", 0)).toBeNull();
    expect(sttCost("nobody", 1000)).toBeNull();
  });
});
