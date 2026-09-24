import { describe, expect, it } from "vitest";

import { deviceLabel } from "./device";

describe("deviceLabel", () => {
  it("names the common phones", () => {
    expect(
      deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"),
    ).toBe("iPhone · Safari");
    expect(
      deviceLabel("Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"),
    ).toBe("Android · Chrome");
  });

  it("tells Edge from the Chrome it pretends to be", () => {
    expect(
      deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0"),
    ).toBe("Windows · Edge");
  });

  it("falls back to a plain word", () => {
    expect(deviceLabel(null)).toBe("Устройство");
    expect(deviceLabel("curl/8.0")).toBe("Устройство");
  });
});
