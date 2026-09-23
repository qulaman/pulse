import { describe, expect, it } from "vitest";

import { estimateCost, perClientInFleet, PLATFORM_MONTHLY, ROSTER_CAP } from "./costs";

const NOW = { cacheTtl: "5m", trimRoster: false } as const;

describe("estimateCost", () => {
  it("keeps the three sizes at the figures reported to the owner", () => {
    expect(estimateCost(50, NOW).month).toBeCloseTo(29, 0);
    expect(estimateCost(200, NOW).month).toBeCloseTo(90, 0);
    expect(estimateCost(500, NOW).month).toBeCloseTo(208, 0);
  });

  it("sizes the database server by headcount", () => {
    expect(estimateCost(45, NOW).compute.name).toBe("Micro");
    expect(estimateCost(120, NOW).compute.name).toBe("Small");
    expect(estimateCost(500, NOW).compute.name).toBe("Medium");
    expect(estimateCost(1200, NOW).compute.name).toBe("XL");
  });

  it("makes parsing cheaper with an hour-long cache", () => {
    const five = estimateCost(50, NOW);
    const hour = estimateCost(50, { cacheTtl: "1h", trimRoster: false });
    expect(hour.parser.cacheHit).toBeGreaterThan(five.parser.cacheHit);
    expect(hour.month).toBeLessThan(five.month);
  });

  it("caps the roster only above the cap", () => {
    const small = estimateCost(ROSTER_CAP - 10, { cacheTtl: "1h", trimRoster: true });
    expect(small.parser.promptTokens).toBe(estimateCost(ROSTER_CAP - 10, { cacheTtl: "1h", trimRoster: false }).parser.promptTokens);
    const big = estimateCost(500, { cacheTtl: "1h", trimRoster: true });
    expect(big.parser.promptTokens).toBe(7000 + 100 * ROSTER_CAP);
  });

  it("bills a lone client the plans, its server, the dev project and AI", () => {
    const alone = estimateCost(45, NOW).alone;
    expect(alone.platform).toBe(20);
    expect(alone.supabase).toBe(35);
    expect(alone.total).toBeCloseTo(20 + 35 + alone.ai, 6);
  });

  it("spreads the plan subscriptions over the fleet", () => {
    const e = estimateCost(50, NOW);
    expect(perClientInFleet(e, 1) - e.month).toBeCloseTo(PLATFORM_MONTHLY, 6);
    expect(perClientInFleet(e, 100) - e.month).toBeCloseTo(PLATFORM_MONTHLY / 100, 6);
  });
});
