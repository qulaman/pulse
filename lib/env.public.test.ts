import { describe, expect, it } from "vitest";

import { checkPublicEnv } from "./env.public";
import { parsePublicEnv } from "./env.schema";

const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

const CASES: Record<string, string | undefined>[] = [
  GOOD,
  { ...GOOD, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPub", NEXT_PUBLIC_SENTRY_DSN: "https://k@sentry.io/1" },
  { ...GOOD, NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined },
  { ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "not a url" },
  { ...GOOD, NEXT_PUBLIC_SUPABASE_URL: undefined },
  { ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  { ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
  { ...GOOD, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" },
  { ...GOOD, NEXT_PUBLIC_SENTRY_DSN: "" },
];

function outcome(run: () => unknown): unknown {
  try {
    return { ok: run() };
  } catch {
    return "throws";
  }
}

describe("checkPublicEnv (the browser's check, without zod)", () => {
  it.each(CASES.map((source, i) => [i, source] as const))("agrees with publicEnvSchema — case %i", (_i, source) => {
    expect(outcome(() => checkPublicEnv(source))).toEqual(outcome(() => parsePublicEnv(source)));
  });

  it("names the variable that is wrong", () => {
    expect(() => checkPublicEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
