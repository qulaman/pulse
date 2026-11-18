import { describe, expect, it } from "vitest";

import { retryDelayMs } from "./useRealtimeQuery";

describe("retryDelayMs — пауза перед новой подпиской на брошенный канал (D-182)", () => {
  it("растёт вдвое с двух секунд", () => {
    expect([0, 1, 2, 3, 4].map(retryDelayMs)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000]);
  });

  it("не дольше минуты, сколько бы попыток ни было", () => {
    expect(retryDelayMs(5)).toBe(60_000);
    expect(retryDelayMs(50)).toBe(60_000);
    expect(retryDelayMs(Number.MAX_SAFE_INTEGER)).toBe(60_000);
  });

  it("странный номер попытки — как первая", () => {
    expect(retryDelayMs(-3)).toBe(2_000);
    expect(retryDelayMs(Number.NaN)).toBe(2_000);
    expect(retryDelayMs(Number.POSITIVE_INFINITY)).toBe(2_000);
  });
});
