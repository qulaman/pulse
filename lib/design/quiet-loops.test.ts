import { describe, expect, it } from "vitest";

import { QUIET_LOOPS } from "./quiet-loops";

describe("QUIET_LOOPS", () => {
  it("drops animationiteration registrations and keeps every other event", () => {
    const added: string[] = [];
    class Target {
      addEventListener(type: string) {
        added.push(type);
      }
    }
    // the script patches the global EventTarget: run it against a stand-in prototype
    new Function("EventTarget", QUIET_LOOPS)(Target);
    const target = new Target();
    for (const type of ["animationiteration", "webkitAnimationIteration", "animationend", "click", "animationstart"]) {
      target.addEventListener(type);
    }
    expect(added).toEqual(["animationend", "click", "animationstart"]);
  });
});
