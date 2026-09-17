import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS,
  cancellableByOwner,
  isOpenOrder,
  pointsWord,
  progressPct,
  shortfall,
} from "./format";

describe("pointsWord", () => {
  it("declines the ordinary tails", () => {
    expect(pointsWord(1)).toBe("очко");
    expect(pointsWord(2)).toBe("очка");
    expect(pointsWord(4)).toBe("очка");
    expect(pointsWord(5)).toBe("очков");
    expect(pointsWord(0)).toBe("очков");
  });

  it("keeps the teens in the genitive", () => {
    expect(pointsWord(11)).toBe("очков");
    expect(pointsWord(12)).toBe("очков");
    expect(pointsWord(14)).toBe("очков");
    expect(pointsWord(111)).toBe("очков");
  });

  it("follows the last digit above twenty", () => {
    expect(pointsWord(21)).toBe("очко");
    expect(pointsWord(22)).toBe("очка");
    expect(pointsWord(25)).toBe("очков");
    expect(pointsWord(1000)).toBe("очков");
  });
});

describe("shortfall", () => {
  it("is what is still missing, never negative", () => {
    expect(shortfall(1000, 320)).toBe(680);
    expect(shortfall(200, 200)).toBe(0);
    expect(shortfall(200, 900)).toBe(0);
  });
});

describe("progressPct", () => {
  it("clamps to 0…100", () => {
    expect(progressPct(1000, 250)).toBe(25);
    expect(progressPct(1000, 5000)).toBe(100);
    // a negative balance (the director took points away) is an empty bar, not a broken one
    expect(progressPct(1000, -50)).toBe(0);
  });
});

describe("order status", () => {
  it("names every status of the enum", () => {
    expect(Object.keys(ORDER_STATUS)).toEqual(["pending", "approved", "delivered", "cancelled"]);
  });

  it("lets the owner take back only an unconfirmed order (D-37)", () => {
    expect(cancellableByOwner("pending")).toBe(true);
    expect(cancellableByOwner("approved")).toBe(false);
    expect(cancellableByOwner("delivered")).toBe(false);
  });

  it("keeps pending and approved in the shopkeeper's queue", () => {
    expect(isOpenOrder("pending")).toBe(true);
    expect(isOpenOrder("approved")).toBe(true);
    expect(isOpenOrder("delivered")).toBe(false);
    expect(isOpenOrder("cancelled")).toBe(false);
  });
});
