import { describe, expect, it } from "vitest";

import { hasLogin, isNewCompany, launchHiddenKey, launchSteps, nextInTurn, nextStep, tasksShowHistory, type LaunchFacts, type LoginFact } from "./launch";

describe("isNewCompany", () => {
  it("is a company with nothing sent and nothing announced", () => {
    expect(isNewCompany({ sentTasks: 0, announcements: 0 })).toBe(true);
  });

  it("is never a company with a history: one task, however old or closed, is enough", () => {
    expect(isNewCompany({ sentTasks: 1, announcements: 0 })).toBe(false);
    expect(isNewCompany({ sentTasks: 4000, announcements: 900 })).toBe(false);
  });

  it("counts an announcement as a history: the director already speaks to the company", () => {
    expect(isNewCompany({ sentTasks: 0, announcements: 1 })).toBe(false);
  });

  it("is never a company it knows nothing about: a failed read shows no checklist", () => {
    expect(isNewCompany(null)).toBe(false);
    expect(isNewCompany(undefined)).toBe(false);
  });
});

describe("tasksShowHistory", () => {
  it("takes any task past `scheduled`, the closed ones too", () => {
    for (const status of ["sent", "accepted", "pending_review", "done", "rework", "declined", "revoked"]) {
      expect(tasksShowHistory([{ status }])).toBe(true);
    }
  });

  it("does not take a task only scheduled: it has reached nobody", () => {
    expect(tasksShowHistory([{ status: "scheduled" }, { status: "scheduled" }])).toBe(false);
    expect(tasksShowHistory([])).toBe(false);
  });
});

describe("hasLogin", () => {
  const nothing: LoginFact = { signedInAt: null, email: null, code: "none" };

  it("says no for a person with nothing", () => {
    expect(hasLogin(nothing)).toBe(false);
  });

  it("says yes for whoever has entered, has a password login or holds a code", () => {
    expect(hasLogin({ ...nothing, signedInAt: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(hasLogin({ ...nothing, email: "a@b.kz" })).toBe(true);
    expect(hasLogin({ ...nothing, code: "open" })).toBe(true);
    expect(hasLogin({ ...nothing, code: "used" })).toBe(true);
  });

  it("says no for a code that burned or was cancelled: the person still has no way in", () => {
    expect(hasLogin({ ...nothing, code: "expired" })).toBe(false);
    expect(hasLogin({ ...nothing, code: "cancelled" })).toBe(false);
  });
});

describe("nextInTurn", () => {
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const ids = (list: { id: string }[]) => list.map((person) => person.id);

  it("goes on from the card and comes round, leaving the card itself out", () => {
    expect(ids(nextInTurn(people, "b"))).toEqual(["c", "d", "a"]);
    expect(ids(nextInTurn(people, "d"))).toEqual(["a", "b", "c"]);
  });

  it("takes everyone from a card off the list (a director's, a fired person's)", () => {
    expect(ids(nextInTurn(people, "z"))).toEqual(["a", "b", "c", "d"]);
  });

  it("has nobody after the only person", () => {
    expect(nextInTurn([{ id: "a" }], "a")).toEqual([]);
  });
});

describe("launchSteps", () => {
  const blank: LaunchFacts = { companyName: "Каспий", hasLogo: false, team: 0, anyLogin: false, nextPersonId: null, firstName: null };
  const step = (facts: Partial<LaunchFacts>, key: string) => {
    const found = launchSteps({ ...blank, ...facts }).find((item) => item.key === key);
    if (!found) throw new Error(key);
    return found;
  };

  it("has the four steps in the order of the launch", () => {
    expect(launchSteps(blank).map((item) => item.key)).toEqual(["brand", "people", "login", "order"]);
    expect(launchSteps(blank).every((item) => !item.done)).toBe(true);
  });

  it("wants both a name and a logo", () => {
    expect(step({ hasLogo: true }, "brand").done).toBe(true);
    expect(step({ hasLogo: false }, "brand").done).toBe(false);
    expect(step({ hasLogo: true, companyName: " " }, "brand").done).toBe(false);
    expect(step({ hasLogo: true, companyName: null }, "brand").done).toBe(false);
    expect(step({}, "brand").action?.href).toBe("/desk/settings");
  });

  it("counts people from the team", () => {
    expect(step({ team: 3 }, "people")).toMatchObject({ done: true, hint: "3 человека в команде" });
    expect(step({ team: 1 }, "people").hint).toBe("1 человек в команде");
    expect(step({ team: 11 }, "people").hint).toBe("11 человек в команде");
    expect(step({}, "people").action?.href).toBe("/desk/team/new");
  });

  it("offers no way to a login before there are people", () => {
    expect(step({}, "login").action).toBeUndefined();
  });

  it("leads the login to the first card without one, or to the team when it is not known", () => {
    expect(step({ team: 2, nextPersonId: "p1" }, "login").action?.href).toBe("/desk/team/p1");
    expect(step({ team: 2 }, "login").action?.href).toBe("/desk/team");
    expect(step({ team: 2, anyLogin: true, nextPersonId: "p2" }, "login")).toMatchObject({ done: true, action: { label: "Следующему", href: "/desk/team/p2" } });
  });

  it("sends the first order to the order line, in the words of the real team", () => {
    expect(step({}, "order").action?.href).toBeNull();
    expect(step({ firstName: "Динара" }, "order").hint).toContain("Динара");
    expect(step({}, "order").done).toBe(false);
  });
});

describe("nextStep", () => {
  it("is the first step not done", () => {
    const facts: LaunchFacts = { companyName: "Каспий", hasLogo: true, team: 2, anyLogin: false, nextPersonId: "p1", firstName: "Дина" };
    expect(nextStep(launchSteps(facts))?.key).toBe("login");
  });

  it("steps over a step with nowhere to lead", () => {
    const steps = launchSteps({ companyName: "Каспий", hasLogo: true, team: 0, anyLogin: false, nextPersonId: null, firstName: null });
    expect(nextStep(steps)?.key).toBe("people");
    expect(nextStep(steps.filter((item) => item.key !== "people"))?.key).toBe("order");
  });
});

describe("launchHiddenKey", () => {
  it("is per company", () => {
    expect(launchHiddenKey("a")).not.toBe(launchHiddenKey("b"));
  });
});
