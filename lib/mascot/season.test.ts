import { describe, expect, it } from "vitest";

import { seasonOf } from "./season";

/** An instant given on the Aqtobe wall clock (+05:00). */
const at = (local: string) => new Date(`${local}+05:00`);

describe("seasonOf", () => {
  it("dresses for the New Year from December 20 to January 7", () => {
    expect(seasonOf(at("2026-12-19T23:59:00"))).toBeNull();
    expect(seasonOf(at("2026-12-20T00:00:00"))).toBe("new_year");
    expect(seasonOf(at("2026-12-31T12:00:00"))).toBe("new_year");
    expect(seasonOf(at("2027-01-07T23:59:00"))).toBe("new_year");
    expect(seasonOf(at("2027-01-08T00:00:00"))).toBeNull();
  });

  it("dresses for Наурыз from March 20 to March 23", () => {
    expect(seasonOf(at("2027-03-19T23:59:00"))).toBeNull();
    expect(seasonOf(at("2027-03-20T08:00:00"))).toBe("nauryz");
    expect(seasonOf(at("2027-03-23T23:00:00"))).toBe("nauryz");
    expect(seasonOf(at("2027-03-24T00:00:00"))).toBeNull();
  });

  it("reads the day on the company's clock, not the server's", () => {
    // 19:30 UTC on December 19 is already 00:30 on December 20 in Aqtobe
    expect(seasonOf(new Date("2026-12-19T19:30:00Z"))).toBe("new_year");
  });

  it("wears nothing the rest of the year", () => {
    expect(seasonOf(at("2026-09-25T12:00:00"))).toBeNull();
  });
});
