import { describe, expect, it } from "vitest";

import { DESK_SHEET_SCRIPT } from "./device";
import { DESK_THEME_KEY, otherDeskTheme, parseDeskTheme } from "./theme";

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
});
