import { describe, expect, it } from "vitest";

import {
  confirmError,
  dammDigit,
  formatPairCode,
  generatePairCode,
  PAIR_DIGITS,
  pairErrorOf,
  pairTimeLeft,
  readPairCode,
  waitMinutes,
} from "./pairing";

describe("Damm check digit", () => {
  it("matches the textbook example", () => {
    expect(dammDigit("572")).toBe(4);
    expect(dammDigit("5724")).toBe(0);
  });

  it("catches every single wrong digit and every swap of neighbours", () => {
    for (let n = 0; n < 2000; n++) {
      const code = generatePairCode();
      for (let i = 0; i < PAIR_DIGITS; i++) {
        for (let d = 0; d < 10; d++) {
          if (String(d) === code[i]) continue;
          const typo = code.slice(0, i) + d + code.slice(i + 1);
          expect(readPairCode(typo).state).toBe("typo");
        }
        if (i < PAIR_DIGITS - 1 && code[i] !== code[i + 1]) {
          const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
          expect(readPairCode(swapped).state).toBe("typo");
        }
      }
    }
  });
});

describe("generatePairCode", () => {
  it("draws six digits with a valid check", () => {
    for (let n = 0; n < 500; n++) {
      const code = generatePairCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(readPairCode(code)).toEqual({ state: "ok", digits: code });
    }
  });

  it("takes the random source it is given", () => {
    const digits = [4, 8, 2, 9, 1];
    let i = 0;
    const code = generatePairCode(() => digits[i++]);
    expect(code.slice(0, 5)).toBe("48291");
    expect(dammDigit(code)).toBe(0);
  });
});

describe("readPairCode", () => {
  it("reads what was typed or pasted", () => {
    const code = generatePairCode();
    expect(readPairCode(`${code.slice(0, 3)} ${code.slice(3)}`).state).toBe("ok");
    expect(readPairCode(`${code.slice(0, 3)}-${code.slice(3)}`).state).toBe("ok");
    expect(readPairCode("48")).toEqual({ state: "short", digits: "48" });
    expect(readPairCode("")).toEqual({ state: "short", digits: "" });
  });

  it("ignores digits past the sixth", () => {
    const code = generatePairCode();
    expect(readPairCode(`${code}99`)).toEqual({ state: "ok", digits: code });
  });
});

describe("formatPairCode", () => {
  it("groups three and three, also while typing", () => {
    expect(formatPairCode("482913")).toBe("482 913");
    expect(formatPairCode("4829")).toBe("482 9");
    expect(formatPairCode("482")).toBe("482");
    expect(formatPairCode("48a2-91 3x7")).toBe("482 913");
  });
});

describe("words", () => {
  it("counts whole minutes, never zero", () => {
    expect(waitMinutes(0)).toBe(1);
    expect(waitMinutes(61)).toBe(2);
    expect(waitMinutes(600)).toBe(10);
  });

  it("says how long the code stands", () => {
    expect(pairTimeLeft(600_000)).toBe("Код действует ещё 10 мин");
    expect(pairTimeLeft(61_000)).toBe("Код действует ещё 2 мин");
    expect(pairTimeLeft(59_000)).toMatch(/новый появится сам/);
  });

  it("names every failure in Russian", () => {
    expect(confirmError("bad_code")).toBe("Код не подошёл или истёк");
    expect(confirmError("too_many", 250)).toBe("Слишком много попыток — подождите 5 мин");
    expect(confirmError("too_many")).toBe("Слишком много попыток — подождите 10 мин");
    expect(confirmError("offline")).toBe("Нет связи, экран не подключён");
    expect(confirmError("failed")).toMatch(/ещё раз/);
  });

  it("keeps unknown server codes as a plain failure", () => {
    expect(pairErrorOf("bad_code")).toBe("bad_code");
    expect(pairErrorOf("which_screen")).toBe("which_screen");
    expect(pairErrorOf("internal")).toBe("failed");
    expect(pairErrorOf(undefined)).toBe("failed");
  });
});
