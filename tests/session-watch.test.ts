import { describe, expect, it } from "vitest";

import { isWallPath, sessionLoss, watchesSession } from "@/components/auth/SessionWatch";

describe("SessionWatch (D-135)", () => {
  it("watches the app's screens, including the wall", () => {
    for (const path of ["/pulse", "/feed", "/tasks/1", "/tv", "/profile", "/people/1/edit"]) {
      expect(watchesSession(path)).toBe(true);
    }
  });

  it("leaves the sign-in screens alone — a 401 there would send the screen to itself", () => {
    for (const path of ["/", "/login", "/c/wag", "/dev/tasks", "/tv-connect"]) {
      expect(watchesSession(path)).toBe(false);
    }
  });
});

describe("SessionWatch on the wall (D-182)", () => {
  it("tells the wall from its pairing screen", () => {
    expect(isWallPath("/tv")).toBe(true);
    expect(isWallPath("/tv/anything")).toBe(true);
    expect(isWallPath("/tv-connect")).toBe(false);
    expect(isWallPath("/pulse")).toBe(false);
  });

  it("sends the wall to pairing only after two refusals in a row", () => {
    expect(sessionLoss("/tv")).toEqual({ to: "/tv-connect", strikes: 2 });
  });

  it("keeps a person's screen as it was: the sign-in after the first refusal", () => {
    expect(sessionLoss("/pulse")).toEqual({ to: "/login", strikes: 1 });
    expect(sessionLoss("/desk/today")).toEqual({ to: "/login", strikes: 1 });
  });
});
