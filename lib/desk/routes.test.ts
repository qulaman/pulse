import { describe, expect, it } from "vitest";

import { DESK_NAV, deskAllows, deskHomeFor, deskNavActive, deskRouteFor, mayHaveDeskRoute } from "./routes";

describe("deskHomeFor (D-153)", () => {
  it("sends the director to tasks and the secretary to the errands", () => {
    expect(deskHomeFor("director")).toBe("/desk/today");
    expect(deskHomeFor("secretary")).toBe("/desk/errands");
  });
});

describe("deskRouteFor — the director", () => {
  const to = (path: string, search = "") => deskRouteFor(path, search, "director");

  it("takes Пульс and a draft to the director's day, «Задачи» to the dashboard (D-154)", () => {
    expect(to("/pulse")).toBe("/desk/today");
    expect(to("/confirm")).toBe("/desk/today");
    expect(to("/sent")).toBe("/desk/tasks");
  });

  it("opens a task in the panel", () => {
    expect(to("/tasks/abc-123")).toBe("/desk/tasks?id=abc-123");
  });

  it("maps the team, its card, its editor and a new person", () => {
    expect(to("/people")).toBe("/desk/team");
    expect(to("/people/new")).toBe("/desk/team/new");
    expect(to("/people/p1")).toBe("/desk/team/p1");
    expect(to("/people/p1/edit")).toBe("/desk/team/p1?edit=1");
  });

  it("keeps the tab of the settings, the dictionary and the lab", () => {
    expect(to("/settings", "?tab=ai")).toBe("/desk/settings?tab=ai");
    expect(to("/settings")).toBe("/desk/settings");
    expect(to("/settings/dictionary", "tab=words")).toBe("/desk/settings/dictionary?tab=words");
    expect(to("/lab", "?tab=costs&x=1")).toBe("/desk/settings/lab?tab=costs");
  });

  it("leaves the lab's shelf of pages and the notification rules on the phone screens", () => {
    expect(to("/lab/about")).toBeNull();
    expect(to("/lab/mascot")).toBeNull();
    expect(to("/profile/notifications")).toBeNull();
  });

  it("maps the data tables, the errands, the calendar, notes, boards, wall, reports, points, profile", () => {
    expect(to("/admin", "?table=tasks")).toBe("/desk/settings/data?table=tasks");
    expect(to("/secretary", "?e=e1")).toBe("/desk/errands?e=e1");
    expect(to("/calendar")).toBe("/desk/calendar");
    expect(to("/notes", "?tab=boards")).toBe("/desk/notes?tab=boards");
    // what the pushes carry: a meeting, a reminder
    expect(to("/calendar", "?e=ev1")).toBe("/desk/calendar?e=ev1");
    expect(to("/notes", "?n=n1")).toBe("/desk/notes?n=n1");
    expect(to("/notes/b/b1")).toBe("/desk/notes/b/b1");
    expect(to("/screen")).toBe("/desk/screen");
    expect(to("/reports")).toBe("/desk/reports");
    expect(to("/rating")).toBe("/desk/settings/points");
    expect(to("/shop")).toBe("/desk/settings/points?view=shop");
    expect(to("/profile")).toBe("/desk/profile");
  });

  it("has nothing for the team's screens and the rest", () => {
    for (const path of ["/feed", "/tasks", "/report", "/ether", "/tv", "/desk/tasks", "/", "/login", "/pulse-pixel"]) {
      expect(to(path)).toBeNull();
    }
  });

  it("ignores a trailing slash", () => {
    expect(to("/sent/")).toBe("/desk/tasks");
    expect(to("/pulse/")).toBe("/desk/today");
  });
});

describe("deskRouteFor — the secretary", () => {
  const to = (path: string, search = "") => deskRouteFor(path, search, "secretary");

  it("takes her Лента and the errands to the errands", () => {
    expect(to("/feed")).toBe("/desk/errands");
    expect(to("/secretary", "?e=e2")).toBe("/desk/errands?e=e2");
  });

  it("maps what her desk has: the team, the calendar, the settings, the lab, the profile", () => {
    expect(to("/people")).toBe("/desk/team");
    expect(to("/people/p2/edit")).toBe("/desk/team/p2?edit=1");
    expect(to("/calendar")).toBe("/desk/calendar");
    expect(to("/settings", "?tab=team")).toBe("/desk/settings?tab=team");
    expect(to("/settings/dictionary")).toBe("/desk/settings/dictionary");
    expect(to("/lab")).toBe("/desk/settings/lab");
    expect(to("/profile")).toBe("/desk/profile");
  });

  it("keeps her own task on its phone screen and has no director's screens", () => {
    expect(to("/tasks/t1")).toBeNull();
    for (const path of ["/pulse", "/sent", "/confirm", "/admin", "/notes", "/notes/b/b1", "/screen", "/reports", "/rating", "/shop", "/tasks"]) {
      expect(to(path)).toBeNull();
    }
  });
});

describe("deskRouteFor — everyone else", () => {
  it("has no desk for the team and the kiosk", () => {
    for (const role of ["employee", "manager", "shopkeeper", "tv", undefined] as const) {
      expect(deskRouteFor("/profile", "", role)).toBeNull();
      expect(deskRouteFor("/pulse", "", role)).toBeNull();
    }
  });
});

describe("mayHaveDeskRoute", () => {
  it("is true where either desk role has a twin, false elsewhere", () => {
    expect(mayHaveDeskRoute("/feed")).toBe(true);
    expect(mayHaveDeskRoute("/pulse")).toBe(true);
    expect(mayHaveDeskRoute("/tasks/x")).toBe(true);
    expect(mayHaveDeskRoute("/tasks")).toBe(false);
    expect(mayHaveDeskRoute("/report")).toBe(false);
    expect(mayHaveDeskRoute("/desk/tasks")).toBe(false);
  });
});

describe("deskAllows and the navigation", () => {
  it("keeps the secretary off the director's desk screens", () => {
    for (const path of ["/desk/today", "/desk/tasks", "/desk/inbox", "/desk/reports", "/desk/notes", "/desk/notes/b/1", "/desk/screen", "/desk/settings/data", "/desk/settings/points"]) {
      expect(deskAllows(path, "secretary")).toBe(false);
      expect(deskAllows(path, "director")).toBe(true);
    }
    for (const path of ["/desk", "/desk/errands", "/desk/team/1", "/desk/calendar", "/desk/settings", "/desk/settings/lab", "/desk/settings/dictionary", "/desk/profile"]) {
      expect(deskAllows(path, "secretary")).toBe(true);
    }
    expect(deskAllows("/desk/tasks", "employee")).toBe(false);
  });

  it("lists for the secretary only what she may open", () => {
    for (const item of DESK_NAV.secretary) expect(deskAllows(item.href, "secretary")).toBe(true);
  });

  it("lights the longest matching item", () => {
    expect(deskNavActive("/desk/team/123", "director")).toBe("/desk/team");
    expect(deskNavActive("/desk/settings/lab", "director")).toBe("/desk/settings");
    expect(deskNavActive("/desk/profile", "secretary")).toBe("/desk/profile");
    expect(deskNavActive("/desk", "director")).toBeNull();
  });
});
