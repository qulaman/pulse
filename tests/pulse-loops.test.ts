import { describe, expect, it } from "vitest";

import { loop, loopsCss } from "@/components/pulse/loops";

/** Each `@keyframes` of the folded loops: its offsets (in %) and the frame at each. */
function blocks(): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  for (const [, name, body] of loopsCss.matchAll(/@keyframes ([\w-]+) \{ (.*?) \}\s*(?=@keyframes|$)/g)) {
    const frames = new Map<number, string>();
    for (const [, selector, frame] of body!.matchAll(/([\d.%, ]+)\{ ([^}]*) \}/g)) {
      for (const at of selector!.split(",")) frames.set(Number.parseFloat(at), frame!.trim());
    }
    out.set(name!, frames);
  }
  return out;
}

describe("folded loops (components/pulse/loops.tsx)", () => {
  it("fold every loop of the waiting screen", () => {
    expect([...blocks().keys()].sort()).toEqual(
      [
        "crew-ping",
        "crew-wait",
        "dream-bank",
        "dream-beam",
        "dream-buzz",
        "dream-grab",
        "dream-hover",
        "dream-lights",
        "dream-puff",
        "dream-step",
        "dream-thrust",
        "dream-wave",
        "orb-breathe",
        "orb-drift",
      ].sort(),
    );
  });

  it("run from 0% to 100% with every offset once", () => {
    for (const [name, frames] of blocks()) {
      const at = [...frames.keys()].sort((a, b) => a - b);
      expect(at[0], name).toBe(0);
      expect(at[at.length - 1], name).toBe(100);
      expect(new Set(at).size, name).toBe(at.length);
    }
  });

  it("repeat one cycle: the same frame a cycle later", () => {
    for (const [name, frames] of blocks()) {
      const at = [...frames.keys()].sort((a, b) => a - b);
      const first = frames.get(0);
      // the cycle: the shortest shift that maps every frame onto the same frame
      const repeats = (shift: number) =>
        at.every((value) => {
          const later = Number((value + shift).toFixed(4));
          // 100% is where the next iteration starts: a sawtooth's last frame is its end, not a start
          return later >= 100 || !frames.has(later) || frames.get(later) === frames.get(value);
        });
      const cycle = at.find((value) => value > 0 && frames.get(value) === first && repeats(value));
      expect(cycle, name).toBeDefined();
      // and it is a real fold: many cycles in the one iteration
      expect(100 / cycle!, name).toBeGreaterThanOrEqual(10);
    }
  });

  it("make the iteration as long as its cycles", () => {
    // 40 cycles of the shiver: one cycle of 1.4 s (0.7 s there and back) is a 56 s iteration
    expect(loop("orb-drift", 1_400, "ease-in-out -3000ms infinite")).toBe("orb-drift 56000ms ease-in-out -3000ms infinite");
    // a bee's wings outlast the 14 s flight in one iteration
    expect(Number.parseInt(loop("dream-buzz", 90, "linear infinite").split(" ")[1]!, 10)).toBeGreaterThan(16_000);
  });
});
