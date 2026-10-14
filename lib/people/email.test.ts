import { describe, expect, it } from "vitest";

import { NO_EMAIL_DOMAIN, isSyntheticEmail, syntheticEmail, visibleEmail } from "./email";

describe("service email of a person without one (D-135)", () => {
  it("lives on the reserved .invalid TLD and is unique", () => {
    const a = syntheticEmail();
    const b = syntheticEmail();
    expect(a).toMatch(/^p-[0-9a-f-]{36}@people\.invalid$/);
    expect(a).not.toBe(b);
    expect(NO_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
  });

  it("is never shown", () => {
    expect(isSyntheticEmail(syntheticEmail())).toBe(true);
    expect(isSyntheticEmail("P-1@PEOPLE.INVALID")).toBe(true);
    expect(visibleEmail(syntheticEmail())).toBeNull();
    expect(visibleEmail("aigul@alfa.kz")).toBe("aigul@alfa.kz");
    expect(visibleEmail(null)).toBeNull();
    expect(isSyntheticEmail("someone@invalid.kz")).toBe(false);
  });
});
