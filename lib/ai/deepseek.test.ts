import { describe, expect, it } from "vitest";

import { isDeepSeekModel, readDeepSeekUsage, toChatMessages } from "./deepseek";

describe("toChatMessages", () => {
  it("joins the system blocks, appends the schema and flattens text blocks", () => {
    const out = toChatMessages(
      [
        { type: "text", text: "Ты парсер." },
        { type: "text", text: "[ростер]", cache_control: { type: "ephemeral" } },
      ],
      [
        { role: "user", content: "Марат сигареты" },
        { role: "assistant", content: [{ type: "text", text: '{"entities":[]}' }] },
      ],
      { type: "object" },
    );
    expect(out[0].role).toBe("system");
    expect(out[0].content).toContain("Ты парсер.\n\n[ростер]");
    expect(out[0].content).toContain('{"type":"object"}');
    expect(out.slice(1)).toEqual([
      { role: "user", content: "Марат сигареты" },
      { role: "assistant", content: '{"entities":[]}' },
    ]);
  });
});

describe("readDeepSeekUsage", () => {
  it("maps cache hits to cache reads and misses to input", () => {
    expect(
      readDeepSeekUsage({
        prompt_tokens: 5000,
        prompt_cache_hit_tokens: 4200,
        prompt_cache_miss_tokens: 800,
        completion_tokens: 300,
      }),
    ).toEqual({
      input_tokens: 800,
      output_tokens: 300,
      cache_read_input_tokens: 4200,
      cache_creation_input_tokens: 0,
    });
  });

  it("derives the miss count when the field is absent", () => {
    expect(readDeepSeekUsage({ prompt_tokens: 100, completion_tokens: 10 })).toEqual({
      input_tokens: 100,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });
});

describe("isDeepSeekModel", () => {
  it("recognises the DeepSeek ids only", () => {
    expect(isDeepSeekModel("deepseek-chat")).toBe(true);
    expect(isDeepSeekModel("deepseek-reasoner")).toBe(true);
    expect(isDeepSeekModel("claude-haiku-4-5")).toBe(false);
  });
});
