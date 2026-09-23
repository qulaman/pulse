import { describe, expect, it } from "vitest";

import { generatePassword, loginMessage } from "./password";

describe("generatePassword", () => {
  it("is four syllables and two digits, lowercase latin only", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).toMatch(/^([bdfgkmnprstvz][aeiu]){4}[2-9]{2}$/);
    }
  });

  it("is long enough for the login API (6+)", () => {
    expect(generatePassword().length).toBe(10);
  });

  it("uses the injected randomness", () => {
    expect(generatePassword(() => 0)).toBe("babababa22");
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe("loginMessage", () => {
  it("greets by first name and carries the address, email and password", () => {
    const text = loginMessage({ name: "Марат Оспанов", email: "marat@demo.local", password: "kazemuti47", url: "https://pulse.example" });
    expect(text.split("\n")).toEqual([
      "Марат, вход в приложение:",
      "https://pulse.example",
      "Почта: marat@demo.local",
      "Пароль: kazemuti47",
      "Пароль смени в «Профиле».",
    ]);
  });

  it("skips the email line when the login is unknown", () => {
    expect(loginMessage({ name: "Марат", email: null, password: "x", url: "u" })).not.toContain("Почта");
  });
});
