import { describe, expect, it } from "vitest";

import { pushBlocker, pushEnabledToast } from "./words";

describe("pushEnabledToast (D-125)", () => {
  it("tells an Android phone where Chrome's battery saver is, and stays long enough to read", () => {
    const toast = pushEnabledToast({ platform: "android", standalone: true });
    expect(toast.text).toMatch(/^Уведомления включены\. .*Chrome → «Батарея» → «Без ограничений»/);
    expect(toast.lifetimeMs).toBeGreaterThan(5000);
  });

  it("says just that it is on everywhere else", () => {
    expect(pushEnabledToast({ platform: "ios", standalone: true })).toEqual({ text: "Уведомления включены" });
    expect(pushEnabledToast({ platform: "other", standalone: false }, "Включены на этом устройстве")).toEqual({
      text: "Включены на этом устройстве",
    });
  });
});

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
