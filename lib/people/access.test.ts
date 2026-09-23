import { describe, expect, it } from "vitest";

import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin } from "./access";

const director = { id: "d1", role: "director" as const };
const director2 = { id: "d2", role: "director" as const };
const secretary = { id: "s1", role: "secretary" as const };
const marat = { id: "e1", role: "employee" as const };
const kiosk = { id: "tv", role: "tv" as const };

describe("assignableRoles", () => {
  it("lets the director hand out every people role, the kiosk only at creation", () => {
    expect(assignableRoles("director", "employee")).toEqual(["employee", "manager", "secretary", "shopkeeper", "director"]);
    expect(assignableRoles("director", null)).toContain("tv");
  });

  it("never lets the secretary make a director", () => {
    expect(assignableRoles("secretary", "employee")).not.toContain("director");
    expect(assignableRoles("secretary", null)).toEqual(["employee", "manager", "secretary", "shopkeeper", "tv"]);
  });

  it("keeps a kiosk a kiosk", () => {
    expect(assignableRoles("director", "tv")).toEqual(["tv"]);
  });

  it("gives nothing to anyone else", () => {
    expect(assignableRoles("employee", "employee")).toEqual([]);
    expect(assignableRoles("manager", null)).toEqual([]);
  });
});

describe("canEditPerson", () => {
  it("director edits anyone, secretary anyone but a director", () => {
    expect(canEditPerson(director, director2)).toBe(true);
    expect(canEditPerson(secretary, marat)).toBe(true);
    expect(canEditPerson(secretary, kiosk)).toBe(true);
    expect(canEditPerson(secretary, director)).toBe(false);
  });

  it("an employee edits only themself", () => {
    expect(canEditPerson(marat, marat)).toBe(true);
    expect(canEditPerson(marat, secretary)).toBe(false);
  });
});

describe("canChangeAccess", () => {
  it("never on one's own card", () => {
    expect(canChangeAccess(director, director)).toBe(false);
    expect(canChangeAccess(secretary, secretary)).toBe(false);
  });

  it("follows who may edit whom", () => {
    expect(canChangeAccess(director, secretary)).toBe(true);
    expect(canChangeAccess(secretary, marat)).toBe(true);
    expect(canChangeAccess(secretary, director)).toBe(false);
    expect(canChangeAccess(marat, secretary)).toBe(false);
  });
});

describe("canResetLogin", () => {
  it("the director resets anyone but another director", () => {
    expect(canResetLogin(director, marat)).toBe(true);
    expect(canResetLogin(director, director)).toBe(true);
    expect(canResetLogin(director, director2)).toBe(false);
  });

  it("the secretary resets anyone but a director, herself included", () => {
    expect(canResetLogin(secretary, marat)).toBe(true);
    expect(canResetLogin(secretary, secretary)).toBe(true);
    expect(canResetLogin(secretary, director)).toBe(false);
  });

  it("nobody else resets anything", () => {
    expect(canResetLogin(marat, marat)).toBe(false);
  });
});
