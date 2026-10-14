import { afterEach, describe, expect, it, vi } from "vitest";

import { signInPlace } from "./device";

function browser({ ua, standalone = false, platform = "", touch = 0 }: { ua: string; standalone?: boolean; platform?: string; touch?: number }) {
  vi.stubGlobal("window", {
    navigator: { userAgent: ua, platform, maxTouchPoints: touch, standalone },
    matchMedia: () => ({ matches: standalone }),
  });
}

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; 23078RKD5C) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";

describe("signInPlace (D-135 §4)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("an iPhone tab waits for the home screen; the installed app is ready", () => {
    browser({ ua: IPHONE_SAFARI });
    expect(signInPlace()).toBe("ios-browser");
    browser({ ua: IPHONE_SAFARI, standalone: true });
    expect(signInPlace()).toBe("ready");
  });

  it("an iPad that says it is a Mac is still iOS", () => {
    browser({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", platform: "MacIntel", touch: 5 });
    expect(signInPlace()).toBe("ios-browser");
  });

  it("Android's Chrome and a computer take the code straight away", () => {
    browser({ ua: ANDROID_CHROME });
    expect(signInPlace()).toBe("ready");
    browser({ ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", platform: "Win32" });
    expect(signInPlace()).toBe("ready");
  });

  it("a messenger's browser cannot install anything", () => {
    browser({ ua: `${IPHONE_SAFARI} Instagram 300.0` });
    expect(signInPlace()).toBe("in-app");
    browser({ ua: "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130 Mobile Safari/537.36" });
    expect(signInPlace()).toBe("in-app");
  });
});
