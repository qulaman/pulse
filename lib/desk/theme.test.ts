import { describe, expect, it } from "vitest";

import { DESK_SHEET_SCRIPT } from "./device";
import { DESK_LOOK_KEY, DESK_THEME_KEY, otherDeskLook, otherDeskTheme, parseDeskLook, parseDeskTheme } from "./theme";

describe("the desk's theme", () => {
  it("is dark unless light was chosen", () => {
    expect(parseDeskTheme("light")).toBe("light");
    expect(parseDeskTheme("dark")).toBe("dark");
    expect(parseDeskTheme(null)).toBe("dark");
    expect(parseDeskTheme(undefined)).toBe("dark");
    expect(parseDeskTheme("sepia")).toBe("dark");
  });

  it("switches both ways", () => {
    expect(otherDeskTheme("dark")).toBe("light");
    expect(otherDeskTheme("light")).toBe("dark");
  });

  it("reads the same key in the head script, before the first paint", () => {
    expect(DESK_SHEET_SCRIPT).toContain(DESK_THEME_KEY);
  });

  it("looks «Графит» unless «Журнал» was chosen (D-171)", () => {
    expect(parseDeskLook("journal")).toBe("journal");
    expect(parseDeskLook("graphite")).toBe("graphite");
    expect(parseDeskLook(null)).toBe("graphite");
    expect(parseDeskLook("sepia")).toBe("graphite");
    expect(otherDeskLook("graphite")).toBe("journal");
    expect(otherDeskLook("journal")).toBe("graphite");
    expect(DESK_SHEET_SCRIPT).toContain(DESK_LOOK_KEY);
  });
});
