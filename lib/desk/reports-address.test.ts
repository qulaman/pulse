import { describe, expect, it } from "vitest";

import { asksSheet, clampCustom, holdsToday, monthTitle, periodRange, personFeedHref, readAddress, stepPeriod, writeAddress, type ReportsAddress } from "./reports-address";

const FEED: ReportsAddress = { day: null, period: null, person: null, who: null, q: "", unchecked: false };
const read = (query: string) => readAddress(new URLSearchParams(query));

describe("reports address", () => {
  it("reads the day, the person and nothing broken; the old ?day&p of «Команда» opens the feed there", () => {
    expect(read("day=2026-11-13&p=u1")).toEqual({ ...FEED, day: "2026-11-13", person: "u1" });
    expect(read("day=2026-13-40").day).toBeNull();
    expect(read("")).toEqual(FEED);
    expect(read("tab=day&day=2026-11-13")).toEqual({ ...FEED, day: "2026-11-13" });
  });

  it("reads the feed's filters: one person, words cut to a sane length, «Не проверены»", () => {
    expect(read("who=u7&q=%20смета%20&only=new")).toEqual({ ...FEED, who: "u7", q: "смета", unchecked: true });
    expect(read(`q=${"а".repeat(200)}`).q).toHaveLength(80);
    expect(read("only=all").unchecked).toBe(false);
  });

  it("keeps the old ?tab=tabel and ?tab=period links: the card opens with its people, the rest reads as on one page", () => {
    expect(read("tab=period&p=u2")).toEqual({ ...FEED, person: "u2" });
    expect(asksSheet(new URLSearchParams("tab=period&p=u2"))).toBe(true);
    expect(asksSheet(new URLSearchParams("tab=tabel&month=2026-11"))).toBe(true);
    expect(asksSheet(new URLSearchParams("tab=day"))).toBe(false);
    expect(asksSheet(new URLSearchParams(""))).toBe(false);
    // one page (D-201): the period of the card and the feed's filters live together
    expect(read("tab=tabel&month=2026-10&who=u7&only=new&day=2026-11-03")).toEqual({ ...FEED, period: { kind: "month", month: "2026-10" }, who: "u7", unchecked: true, day: "2026-11-03" });
  });

  it("reads a month, a week by any of its days and a custom range clamped to 92 days", () => {
    expect(read("month=2026-11").period).toEqual({ kind: "month", month: "2026-11" });
    expect(read("week=2026-11-19").period).toEqual({ kind: "week", monday: "2026-11-16" });
    expect(read("from=2026-01-01&to=2026-12-31").period).toEqual({ kind: "custom", from: "2026-10-01", to: "2026-12-31" });
    expect(read("month=2026-13").period).toBeNull();
  });

  it("writes back only what differs from the defaults", () => {
    expect(writeAddress(FEED)).toBe("");
    expect(writeAddress({ ...FEED, day: "2026-11-13", person: "u1" })).toBe("day=2026-11-13&p=u1");
    expect(writeAddress({ ...FEED, who: "u7", q: " смета ", unchecked: true })).toBe(`who=u7&q=${encodeURIComponent("смета").replace(/%20/g, "+")}&only=new`);
    expect(writeAddress({ ...FEED, day: "2026-11-13", period: { kind: "month", month: "2026-11" }, who: "u7", q: "x", unchecked: true })).toBe("month=2026-11&who=u7&q=x&only=new&day=2026-11-13");
    expect(writeAddress({ ...FEED, period: { kind: "custom", from: "2026-11-01", to: "2026-11-10" } })).toBe("from=2026-11-01&to=2026-11-10");
  });

  it("reads back what it writes", () => {
    const state: ReportsAddress = { ...FEED, day: "2026-10-30", period: { kind: "week", monday: "2026-10-26" }, person: "u1", who: "u1", q: "акт сверки", unchecked: true };
    expect(read(writeAddress(state))).toEqual(state);
  });

  it("links a person's reports in the feed, at a day when given", () => {
    expect(personFeedHref("u1")).toBe("/desk/reports?who=u1");
    expect(personFeedHref("u1", "2026-11-25")).toBe("/desk/reports?who=u1&day=2026-11-25");
  });

  it("gives a calendar month and a Monday–Sunday week", () => {
    expect(periodRange({ kind: "month", month: "2026-02" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange({ kind: "week", monday: "2026-11-16" })).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(stepPeriod({ kind: "month", month: "2026-01" }, -1)).toEqual({ kind: "month", month: "2025-12" });
    expect(stepPeriod({ kind: "week", monday: "2026-11-16" }, 1)).toEqual({ kind: "week", monday: "2026-11-23" });
    expect(holdsToday({ kind: "month", month: "2026-11" }, "2026-11-18")).toBe(true);
    expect(clampCustom("2026-11-10", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("names a month", () => {
    expect(monthTitle("2026-11")).toBe("Ноябрь 2026");
  });
});
