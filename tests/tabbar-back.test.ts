import { describe, expect, it } from "vitest";

import { backTarget } from "@/components/TabBar";

describe("backTarget (D-113): «Назад» on every screen that is not a tab's own root", () => {
  it("gives a tab's own root no way back", () => {
    for (const path of ["/pulse", "/sent", "/calendar", "/notes", "/screen", "/profile"]) {
      expect(backTarget("director", path)).toBeNull();
    }
    for (const path of ["/feed", "/tasks", "/calendar", "/rating", "/profile"]) {
      expect(backTarget("secretary", path)).toBeNull();
    }
    for (const path of ["/feed", "/tasks", "/calendar", "/rating", "/profile"]) {
      expect(backTarget("employee", path)).toBeNull();
    }
    // the team's «Лаб» while the company tests stays a tab (D-150)
    expect(backTarget("employee", "/lab", true)).toBeNull();
  });

  it("leads the director's nested screens to the tab they open from", () => {
    // «Настройки» and «Лаб» left the phone bar for the desk (D-153): their screens live in «Профиль»
    for (const path of ["/settings", "/settings/dictionary", "/lab", "/lab/about", "/people", "/people/p1/edit", "/shop", "/rating", "/admin", "/secretary", "/reports"]) {
      expect(backTarget("director", path)).toBe("/profile");
    }
    expect(backTarget("director", "/ether")).toBe("/pulse");
    expect(backTarget("director", "/confirm")).toBe("/pulse");
    expect(backTarget("director", "/tasks/abc")).toBe("/sent");
  });

  it("keeps a screen inside a tab under that tab, and a stray one under home", () => {
    expect(backTarget("director", "/notes/b/1")).toBe("/notes");
    expect(backTarget("secretary", "/settings/dictionary")).toBe("/profile");
    expect(backTarget("secretary", "/settings")).toBe("/profile");
    expect(backTarget("secretary", "/lab")).toBe("/profile");
    expect(backTarget("secretary", "/people/new")).toBe("/profile");
    expect(backTarget("secretary", "/secretary")).toBe("/profile");
    expect(backTarget("secretary", "/report")).toBe("/tasks");
    expect(backTarget("employee", "/shop")).toBe("/rating");
    expect(backTarget("employee", "/ether")).toBe("/feed");
    expect(backTarget("employee", "/somewhere")).toBe("/feed");
  });
});
