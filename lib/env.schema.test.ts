import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.schema";

const full = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  OPENAI_API_KEY: "sk-openai",
  ANTHROPIC_API_KEY: "sk-anthropic",
};

describe("parseServerEnv", () => {
  it("accepts a full set of required variables", () => {
    const env = parseServerEnv(full);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(full.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBe(full.ANTHROPIC_API_KEY);
  });

  it("names the missing variable in the error", () => {
    const withoutKey: Record<string, string | undefined> = { ...full };
    delete withoutKey.ANTHROPIC_API_KEY;
    expect(() => parseServerEnv(withoutKey)).toThrow(/ANTHROPIC_API_KEY/);
  });
});
