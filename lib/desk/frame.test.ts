import { describe, expect, it } from "vitest";

import { clampPanel, navFoldedFromCookie, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN } from "./frame";

describe("the desk's frame (D-154 wave 3)", () => {
  it("keeps the panel between its bounds", () => {
    expect(clampPanel(200)).toBe(PANEL_MIN);
    expect(clampPanel(5000)).toBe(PANEL_MAX);
    expect(clampPanel(512.4)).toBe(512);
    expect(clampPanel(Number.NaN)).toBe(PANEL_DEFAULT);
  });

  it("reads the fold from the cookie", () => {
    expect(navFoldedFromCookie("icons")).toBe(true);
    expect(navFoldedFromCookie("wide")).toBe(false);
    expect(navFoldedFromCookie(undefined)).toBe(false);
  });
});
