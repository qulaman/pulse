import { describe, expect, it } from "vitest";

import { backTarget } from "@/components/TabBar";

describe("backTarget (D-113): «Назад» on every screen that is not a tab's own root", () => {
  it("gives a tab's own root no way back", () => {
    for (const path of ["/pulse", "/sent", "/calendar", "/notes", "/screen", "/settings", "/profile", "/lab"]) {
      expect(backTarget("director", path)).toBeNull();
    }
    for (const path of ["/feed", "/tasks", "/calendar", "/rating", "/profile"]) {
      expect(backTarget("employee", path)).toBeNull();
    }
  });

  it("leads the director's nested screens to the tab they open from", () => {
    expect(backTarget("director", "/people")).toBe("/settings");
    expect(backTarget("director", "/shop")).toBe("/settings");
    expect(backTarget("director", "/rating")).toBe("/settings");
    expect(backTarget("director", "/admin")).toBe("/settings");
    expect(backTarget("director", "/secretary")).toBe("/settings");
    expect(backTarget("director", "/ether")).toBe("/pulse");
    expect(backTarget("director", "/confirm")).toBe("/pulse");
    expect(backTarget("director", "/tasks/abc")).toBe("/sent");
  });

  it("keeps a screen inside a tab under that tab, and a stray one under home", () => {
    expect(backTarget("director", "/notes/b/1")).toBe("/notes");
    expect(backTarget("secretary", "/settings/dictionary")).toBe("/settings");
    expect(backTarget("employee", "/shop")).toBe("/rating");
    expect(backTarget("employee", "/ether")).toBe("/feed");
    expect(backTarget("employee", "/somewhere")).toBe("/feed");
  });
});
