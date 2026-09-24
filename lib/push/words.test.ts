import { describe, expect, it } from "vitest";

import { pushBlocker } from "./words";

describe("pushBlocker", () => {
  it("sends an iPhone in Safari to the home screen first", () => {
    expect(pushBlocker("unsupported", { platform: "ios", standalone: false })).toMatch(/экране «Домой»/);
  });

  it("says nothing where a push can simply be switched on", () => {
    expect(pushBlocker("default", { platform: "ios", standalone: true })).toBeNull();
    expect(pushBlocker("default", { platform: "android", standalone: false })).toBeNull();
    expect(pushBlocker("unsupported", { platform: "other", standalone: false })).toBeNull();
  });

  it("names the way out of a refusal on each platform", () => {
    expect(pushBlocker("denied", { platform: "ios", standalone: true })).toMatch(/«Настройки» iPhone/);
    expect(pushBlocker("denied", { platform: "android", standalone: false })).toMatch(/замок/);
    expect(pushBlocker("denied", { platform: "other", standalone: false })).toMatch(/настройках сайта/);
  });
});
