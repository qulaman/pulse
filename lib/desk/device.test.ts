import { describe, expect, it } from "vitest";

import { clearViewCookie, isDesktopUa, phoneViewCookie, VIEW_COOKIE, wantsPhoneView } from "./device";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const IPAD_OLD = "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";

describe("isDesktopUa (D-153)", () => {
  it("trusts the client hint first", () => {
    expect(isDesktopUa(ANDROID, "?0")).toBe(true);
    expect(isDesktopUa(CHROME_WIN, "?1")).toBe(false);
  });

  it("reads the user agent when there is no hint", () => {
    expect(isDesktopUa(CHROME_WIN, null)).toBe(true);
    expect(isDesktopUa(SAFARI_MAC, undefined)).toBe(true);
    expect(isDesktopUa(IPHONE, null)).toBe(false);
    expect(isDesktopUa(ANDROID, null)).toBe(false);
    expect(isDesktopUa(IPAD_OLD, null)).toBe(false);
  });

  it("counts a browser that says nothing as a computer", () => {
    expect(isDesktopUa(null, null)).toBe(true);
    expect(isDesktopUa("", "")).toBe(true);
  });
});

describe("the phone-view cookie", () => {
  it("is set for a year on the whole site and taken off at once", () => {
    expect(phoneViewCookie()).toMatch(new RegExp(`^${VIEW_COOKIE}=phone;`));
    expect(phoneViewCookie()).toContain("Max-Age=31536000");
    expect(phoneViewCookie()).toContain("Path=/");
    expect(phoneViewCookie()).toContain("SameSite=Lax");
    expect(clearViewCookie()).toMatch(new RegExp(`^${VIEW_COOKIE}=;`));
    expect(clearViewCookie()).toContain("Max-Age=0");
  });

  it("keeps the phone screens only for its own value", () => {
    expect(wantsPhoneView("phone")).toBe(true);
    expect(wantsPhoneView(undefined)).toBe(false);
    expect(wantsPhoneView("desk")).toBe(false);
  });
});
