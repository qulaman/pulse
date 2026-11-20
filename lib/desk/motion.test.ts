import { describe, expect, it } from "vitest";

import { screenMove } from "./motion";
import { DESK_NAV } from "./routes";

const director = DESK_NAV.director.map((item) => item.href);
const secretary = DESK_NAV.secretary.map((item) => item.href);

describe("screenMove (D-184)", () => {
  it("moves down and up the navigation as the role's list stands", () => {
    expect(screenMove("/desk/today", "/desk/team", director)).toBe("desk-section-down");
    expect(screenMove("/desk/team", "/desk/tasks", director)).toBe("desk-section-up");
    // the secretary's list starts with «Заявки»: «Команда» is below it for her
    expect(screenMove("/desk/errands", "/desk/team", secretary)).toBe("desk-section-down");
    expect(screenMove("/desk/team", "/desk/errands", secretary)).toBe("desk-section-up");
  });

  it("takes the section of a deep address, not its page", () => {
    expect(screenMove("/desk/team/abc", "/desk/calendar", director)).toBe("desk-section-down");
    expect(screenMove("/desk/boards/b1", "/desk/today", director)).toBe("desk-section-up");
  });

  it("goes deeper into a person, a board, a note's board and comes back out", () => {
    expect(screenMove("/desk/team", "/desk/team/abc", director)).toBe("desk-deeper");
    expect(screenMove("/desk/team/abc", "/desk/team", director)).toBe("desk-back");
    expect(screenMove("/desk/team", "/desk/team/new", director)).toBe("desk-deeper");
    expect(screenMove("/desk/boards", "/desk/boards/b1", director)).toBe("desk-deeper");
    expect(screenMove("/desk/notes", "/desk/notes/b/b1", director)).toBe("desk-deeper");
    expect(screenMove("/desk/notes/b/b1", "/desk/notes", director)).toBe("desk-back");
  });

  it("changes in place between two people, and between the pages of «Настройки»", () => {
    expect(screenMove("/desk/team/abc", "/desk/team/def", director)).toBe("desk-swap");
    expect(screenMove("/desk/settings", "/desk/settings/data", director)).toBe("desk-swap");
    expect(screenMove("/desk/settings/lab", "/desk/settings", director)).toBe("desk-swap");
  });

  it("changes in place for a section the list does not show (the profile, the secretary's address to the director's screen)", () => {
    expect(screenMove("/desk/today", "/desk/profile", director)).toBe("desk-swap");
    expect(screenMove("/desk/team", "/desk/tasks", secretary)).toBe("desk-swap");
  });

  it("does not move for the same screen or off the desk", () => {
    expect(screenMove("/desk/team", "/desk/team", director)).toBe("none");
    expect(screenMove("/desk/team", "/desk/team/", director)).toBe("none");
    expect(screenMove("/pulse", "/desk/today", director)).toBe("none");
    expect(screenMove("/desk/today", "/settings", director)).toBe("none");
  });
});
