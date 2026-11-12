import { afterEach, describe, expect, it, vi } from "vitest";

import { arcFrames, flyInto } from "./flyAway";

/** translate x, y, rotate, scale of a frame's transform. */
function parts(frame: Keyframe): { x: number; y: number; turn: number; scale: number } {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) rotate\((-?[\d.]+)deg\) scale\((-?[\d.]+)\)/.exec(String(frame.transform));
  if (!match) throw new Error(`unexpected transform ${String(frame.transform)}`);
  return { x: Number(match[1]), y: Number(match[2]), turn: Number(match[3]), scale: Number(match[4]) };
}

// a card of the list and the face above it (393 px wide phone)
const CARD = { left: 16, top: 420, width: 361, height: 200 };
const FACE = { left: 130, top: 150, width: 132, height: 132 };

describe("arcFrames", () => {
  it("starts on the card, whole and still", () => {
    const first = arcFrames(CARD, FACE)[0];
    expect(first.offset).toBe(0);
    expect(first.opacity).toBe(1);
    expect(parts(first)).toEqual({ x: 0, y: 0, turn: 0, scale: 1 });
  });

  it("ends in the target's centre, the size of a token, gone", () => {
    const frames = arcFrames(CARD, FACE);
    const last = frames[frames.length - 1];
    const end = parts(last);
    expect(last.offset).toBe(1);
    expect(last.opacity).toBe(0);
    expect(end.x).toBeCloseTo(196 - 196.5, 0);
    expect(end.y).toBeCloseTo(216 - 520, 0);
    expect(end.turn).toBeCloseTo(0, 1);
    expect(end.scale).toBeCloseTo((132 * 0.24) / 361, 3);
  });

  it("is sampled evenly in time and only ever moves towards the target", () => {
    const frames = arcFrames(CARD, FACE, 24);
    expect(frames).toHaveLength(25);
    frames.forEach((frame, k) => expect(frame.offset).toBeCloseTo(k / 24, 4));
    const ys = frames.map((frame) => parts(frame).y);
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeLessThanOrEqual(ys[k - 1] + 0.05);
    const opacities = frames.map((frame) => Number(frame.opacity));
    for (let k = 1; k < opacities.length; k++) expect(opacities[k]).toBeLessThanOrEqual(opacities[k - 1]);
  });

  it("bulges outwards: a card left of the target swings left, one right of it right", () => {
    const leftCard = { left: 0, top: 500, width: 160, height: 120 };
    const rightCard = { left: 233, top: 500, width: 160, height: 120 };
    // how far off the straight way the copy is, sideways, half-way through the flight
    const off = (from: typeof CARD) => {
      const frames = arcFrames(from, FACE);
      const dx = FACE.left + FACE.width / 2 - (from.left + from.width / 2);
      const dy = FACE.top + FACE.height / 2 - (from.top + from.height / 2);
      const { x, y } = parts(frames[Math.round(frames.length / 2)]);
      return x - (dx * y) / dy;
    };
    expect(off(leftCard)).toBeLessThan(-10);
    expect(off(rightCard)).toBeGreaterThan(10);
  });

  it("never grows a small card past its size at the end", () => {
    const chip = { left: 180, top: 600, width: 24, height: 24 };
    const frames = arcFrames(chip, FACE);
    expect(parts(frames[frames.length - 1]).scale).toBe(1);
  });
});

// «+5 очков» under the face and the points under the name in the header (D-165)
const PILL = { left: 145, top: 330, width: 100, height: 28 };
const COUNTER = { left: 270, top: 30, width: 62, height: 16 };

describe("arcFrames arrivesAs", () => {
  it("arrives at the scale asked for, whatever the target's size", () => {
    const frames = arcFrames(PILL, COUNTER, 24, 0.86);
    expect(parts(frames[0]).scale).toBe(1);
    expect(parts(frames[frames.length - 1]).scale).toBeCloseTo(0.86, 3);
  });

  it("keeps the way and the fade: only the size differs from the token", () => {
    const token = arcFrames(PILL, COUNTER);
    const readable = arcFrames(PILL, COUNTER, 24, 0.86);
    expect(readable).toHaveLength(token.length);
    token.forEach((frame, k) => {
      expect(parts(readable[k]).x).toBe(parts(frame).x);
      expect(parts(readable[k]).y).toBe(parts(frame).y);
      expect(readable[k].opacity).toBe(frame.opacity);
    });
    expect(parts(token[token.length - 1]).scale).toBeCloseTo((16 * 0.24) / 100, 3);
  });
});

describe("flyInto", () => {
  type Flight = { frames: Keyframe[]; timing: KeyframeAnimationOptions; shadow: string | undefined };

  /** The least of a page a flight needs: a layer on <body>, a copy that animates, a media query. */
  function stage(reduce = false) {
    const flights: Flight[] = [];
    vi.stubGlobal("window", { matchMedia: () => ({ matches: reduce }) });
    vi.stubGlobal("document", {
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
      body: { appendChild() {} },
    });
    const ghost = {
      style: {} as Record<string, string>,
      removeAttribute() {},
      querySelectorAll: () => [],
      remove() {},
      animate(frames: Keyframe[], timing: KeyframeAnimationOptions) {
        flights.push({ frames, timing, shadow: ghost.style.boxShadow });
        return {};
      },
    };
    const element = (rect: typeof PILL) => ({ getBoundingClientRect: () => rect, cloneNode: () => ghost }) as unknown as HTMLElement;
    return { flights, node: element(PILL), target: element(COUNTER) };
  }
  const endScale = (flight: Flight) => parts(flight.frames[flight.frames.length - 1]).scale;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("by default lifts a card off the page and lands it as a token", () => {
    const { flights, node, target } = stage();
    flyInto(node, target);
    expect(flights).toHaveLength(1);
    expect(flights[0].shadow).toBeTruthy();
    expect(flights[0].timing.duration).toBe(450);
    expect(endScale(flights[0])).toBeCloseTo((16 * 0.24) / 100, 3);
  });

  it("flies a chip of text flat and lands it at the scale asked for", () => {
    const { flights, node, target } = stage();
    flyInto(node, target, { duration: 650, lifted: false, arrivesAs: 0.86 });
    expect(flights).toHaveLength(1);
    expect(flights[0].shadow).toBeUndefined();
    expect(flights[0].timing.duration).toBe(650);
    expect(endScale(flights[0])).toBeCloseTo(0.86, 3);
  });

  it("flies nothing under «уменьшить движение» and lands at once", () => {
    const { flights, node, target } = stage(true);
    const onLand = vi.fn();
    flyInto(node, target, { lifted: false, arrivesAs: 0.86, onLand });
    expect(flights).toHaveLength(0);
    expect(onLand).toHaveBeenCalledOnce();
  });
});
