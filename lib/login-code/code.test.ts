import { describe, expect, it } from "vitest";

import { CODE_DIGITS, codeMessage, deviceLabel, formatCode, generateCode, normalizeCode } from "./code";

describe("generateCode", () => {
  it("is eight digits, leading zeros kept", () => {
    for (let i = 0; i < 300; i++) expect(generateCode()).toMatch(/^\d{8}$/);
    expect(generateCode(() => 0)).toBe("00000000");
    expect(CODE_DIGITS).toBe(8);
  });

  it("uses every digit", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()).join(""));
    expect(seen.size).toBe(10);
  });
});

describe("normalizeCode", () => {
  it("takes the digits of a typed or pasted code", () => {
    expect(normalizeCode("4829 1375")).toBe("48291375");
    expect(normalizeCode("4829-1375")).toBe("48291375");
    expect(normalizeCode(" 48291375\n")).toBe("48291375");
    expect(normalizeCode("Код: 4829 1375")).toBe("48291375");
  });

  it("is null unless exactly eight digits", () => {
    expect(normalizeCode("4829 137")).toBeNull();
    expect(normalizeCode("4829 13755")).toBeNull();
    expect(normalizeCode("")).toBeNull();
  });
});

describe("formatCode", () => {
  it("groups by four while typed", () => {
    expect(formatCode("4829")).toBe("4829");
    expect(formatCode("48291")).toBe("4829 1");
    expect(formatCode("48291375")).toBe("4829 1375");
    expect(formatCode("4829 13759")).toBe("4829 1375");
  });
});

describe("codeMessage", () => {
  it("names the person, the company, the link, the code and its time on the clock of Aqtobe", () => {
    const text = codeMessage({
      name: "Айгуль Сапарова",
      company: "Альфа",
      code: "48291375",
      expiresAt: "2026-10-14T09:35:00Z",
      url: "https://app.example/c/alfa",
    });
    expect(text).toContain("Айгуль, вход в Альфа:");
    expect(text).toContain("https://app.example/c/alfa");
    expect(text).toContain("Код: 4829 1375 — действует до 14:35.");
  });
});

describe("deviceLabel", () => {
  it("names the device from its user agent", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("iPad");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; 23078RKD5C) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe("Android");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe("Android-планшет");
    expect(deviceLabel("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36")).toBe("телевизор");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("компьютер");
    expect(deviceLabel(null)).toBe("устройство");
  });
});
