import { describe, expect, it } from "vitest";

import { watchesSession } from "@/components/auth/SessionWatch";

describe("SessionWatch (D-135)", () => {
  it("watches the app's screens, including the wall", () => {
    for (const path of ["/pulse", "/feed", "/tasks/1", "/tv", "/profile", "/people/1/edit"]) {
      expect(watchesSession(path)).toBe(true);
    }
  });

  it("leaves the sign-in screens alone — a 401 there would send the screen to itself", () => {
    for (const path of ["/", "/login", "/c/wag", "/dev/tasks"]) {
      expect(watchesSession(path)).toBe(false);
    }
  });
});
