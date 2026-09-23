import { describe, expect, it } from "vitest";

import { parseSettingsTab, SETTINGS_TABS } from "./settings-tabs";

describe("parseSettingsTab", () => {
  it("opens the tab the link names", () => {
    for (const tab of SETTINGS_TABS) expect(parseSettingsTab(tab)).toBe(tab);
  });

  it("falls back to the first tile for a missing or unknown tab", () => {
    expect(parseSettingsTab(undefined)).toBe("company");
    expect(parseSettingsTab("")).toBe("company");
    expect(parseSettingsTab("points")).toBe("company");
  });

  it("takes the first value of a repeated ?tab=", () => {
    expect(parseSettingsTab(["ai", "team"])).toBe("ai");
  });
});
