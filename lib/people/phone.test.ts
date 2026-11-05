import { describe, expect, it } from "vitest";

import { cleanPhone, phoneHref, phoneLooksRight } from "./phone";

describe("phoneLooksRight", () => {
  it("takes the ways phones are written", () => {
    for (const phone of ["+7 701 234 56 78", "8 (7132) 55-12-34", "87012345678", "+7-701-234-56-78", "55.12.34"]) {
      expect(phoneLooksRight(phone)).toBe(true);
    }
  });

  it("empty is no phone, not a mistake", () => {
    expect(phoneLooksRight("")).toBe(true);
    expect(phoneLooksRight("   ")).toBe(true);
  });

  it("stops what is plainly not a phone", () => {
    for (const phone of ["марат", "12-34", "+7 701 abc", "12345678901234567890123456789012345", "(((((-----"]) {
      expect(phoneLooksRight(phone)).toBe(false);
    }
  });
});

describe("cleanPhone", () => {
  it("keeps it as typed, without the edges; empty is null", () => {
    expect(cleanPhone("  +7 701 234 56 78 ")).toBe("+7 701 234 56 78");
    expect(cleanPhone("  ")).toBeNull();
  });
});

describe("phoneHref", () => {
  it("dials digits and the leading plus", () => {
    expect(phoneHref("+7 (701) 234-56-78")).toBe("tel:+77012345678");
    expect(phoneHref("8 701 234 56 78")).toBe("tel:87012345678");
  });
});
