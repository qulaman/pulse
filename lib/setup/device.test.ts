import { describe, expect, it } from "vitest";

import { browserApp, inAppBrowser, phoneMaker } from "./device";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// Chrome's reduced user agent: the model is «K» whatever the phone
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const TELEGRAM_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; 23078RKD5C Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Telegram-Android/11.4.2 (Xiaomi 23078RKD5C; Android 14; SDK 34; AVERAGE)";

describe("inAppBrowser (D-190)", () => {
  it("names the messenger whose browser opened Pulse", () => {
    expect(inAppBrowser(TELEGRAM_ANDROID)).toBe("Telegram");
    expect(inAppBrowser(`${IPHONE_SAFARI} Instagram 300.0.0.0`)).toBe("Instagram");
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]")).toBe("Facebook");
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 13; wv) Chrome/120 Mobile Safari/537.36 WhatsApp/2.24")).toBe("WhatsApp");
  });

  it("an Android web view that says nothing is still not a browser", () => {
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130 Mobile Safari/537.36")).toBe("");
  });

  it("Safari, Chrome and a computer are real browsers", () => {
    expect(inAppBrowser(IPHONE_SAFARI)).toBeNull();
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36")).toBeNull();
  });
});

describe("phoneMaker (D-190)", () => {
  it("an iPhone is an iPhone", () => {
    expect(phoneMaker(IPHONE_SAFARI)).toBe("iphone");
  });

  it("Xiaomi by its browser, its words or its model number from Chrome's client hints", () => {
    expect(phoneMaker("Mozilla/5.0 (Linux; U; Android 13; ru-ru; 2201117TG) Chrome/112 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.5")).toBe("xiaomi");
    expect(phoneMaker(ANDROID_CHROME, "2201117TG")).toBe("xiaomi");
    expect(phoneMaker(ANDROID_CHROME, "M2101K6G")).toBe("xiaomi");
    expect(phoneMaker(ANDROID_CHROME, "23049PCD8G")).toBe("xiaomi");
    expect(phoneMaker(ANDROID_CHROME, "Redmi Note 8 Pro")).toBe("xiaomi");
    expect(phoneMaker(ANDROID_CHROME, "POCO F3")).toBe("xiaomi");
    // a browser that still names the model in its user agent
    expect(phoneMaker("Mozilla/5.0 (Linux; Android 13; 2201117TG Build/TKQ1.221114.001) Chrome/112 Mobile Safari/537.36")).toBe("xiaomi");
    expect(phoneMaker("Mozilla/5.0 (Linux; U; Android 12; ru-ru; M2101K6G) Chrome/112 Mobile Safari/537.36")).toBe("xiaomi");
  });

  it("Samsung by its browser or its SM- model", () => {
    expect(phoneMaker("Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36")).toBe("samsung");
    expect(phoneMaker(ANDROID_CHROME, "SM-A546B")).toBe("samsung");
  });

  it("Huawei and Honor by name or by their model's shape", () => {
    expect(phoneMaker("Mozilla/5.0 (Linux; Android 10; HUAWEI ELS-NX9) HuaweiBrowser/14.0 Mobile Safari/537.36")).toBe("huawei");
    expect(phoneMaker(ANDROID_CHROME, "ANY-LX1")).toBe("huawei");
    expect(phoneMaker(ANDROID_CHROME, "HONOR 90")).toBe("huawei");
  });

  it("any other Android, and a computer", () => {
    expect(phoneMaker(ANDROID_CHROME)).toBe("android");
    expect(phoneMaker(ANDROID_CHROME, "Pixel 8")).toBe("android");
    expect(phoneMaker(ANDROID_CHROME, "CPH2449")).toBe("android");
    expect(phoneMaker("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131")).toBe("other");
  });
});

describe("browserApp (D-190)", () => {
  it("the app that carries the pushes", () => {
    expect(browserApp(ANDROID_CHROME)).toBe("Chrome");
    expect(browserApp("Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) SamsungBrowser/25.0 Chrome/121")).toBe("Samsung Internet");
    expect(browserApp("Mozilla/5.0 (Linux; Android 13) Chrome/120 YaBrowser/24.1 Mobile Safari/537.36")).toBe("Яндекс Браузер");
    expect(browserApp(IPHONE_SAFARI)).toBe("Safari");
    expect(browserApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0 Mobile/15E148 Safari/604.1")).toBe("Chrome");
  });
});
