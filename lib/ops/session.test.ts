import { afterEach, describe, expect, it, vi } from "vitest";

import { OPS_COOKIE } from "./contract";
import { opsCookieOptions } from "./session";

describe("opsCookieOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is its own cookie, out of reach of scripts and of other sites", () => {
    expect(opsCookieOptions()).toMatchObject({ name: OPS_COOKIE, httpOnly: true, sameSite: "strict", path: "/" });
  });

  it("is secure in production only: `next dev` runs over plain http", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(opsCookieOptions().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(opsCookieOptions().secure).toBe(false);
  });
});
