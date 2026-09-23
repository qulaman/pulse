import { describe, expect, it } from "vitest";

import { canManageTeam, homeForRole, tabBarRole } from "./routes";

describe("canManageTeam (D-104)", () => {
  it("lets the director and the secretary run settings and the roster", () => {
    expect(canManageTeam("director")).toBe(true);
    expect(canManageTeam("secretary")).toBe(true);
  });

  it("keeps everyone else out", () => {
    for (const role of ["employee", "manager", "shopkeeper", "tv", undefined] as const) {
      expect(canManageTeam(role)).toBe(false);
    }
  });
});

describe("tabBarRole", () => {
  it("gives the secretary her own bar and the rest of the team the employee's", () => {
    expect(tabBarRole("director")).toBe("director");
    expect(tabBarRole("secretary")).toBe("secretary");
    expect(tabBarRole("manager")).toBe("employee");
    expect(tabBarRole("shopkeeper")).toBe("employee");
  });

  it("does not move the secretary's home: she still lands on her Лента", () => {
    expect(homeForRole("secretary")).toBe("/feed");
  });
});
