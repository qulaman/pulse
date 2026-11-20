import { describe, expect, it } from "vitest";

import { median } from "./stats";

describe("median", () => {
  it("is the middle, or the mean of the two middles; nothing — null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
