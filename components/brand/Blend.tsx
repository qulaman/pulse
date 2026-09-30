"use client";

import { Component, createRef, type ReactNode } from "react";

type Timing = { readonly duration: number; readonly curve: readonly [number, number, number, number] };

/** How a cut motion of the body goes back to rest: `--t-effect`, `--ease-in-out` (DESIGN §2). */
export const BODY_BLEND: Timing = { duration: 400, curve: [0.4, 0, 0.2, 1] };
/** The eyes move the way eyes do — quickly: `--t-screen`, `--ease-out`. */
export const EYE_BLEND: Timing = { duration: 150, curve: [0.2, 0, 0, 1] };
/** The pace of `mascot-settle 0.22s cubic-bezier(0.16, 1, 0.3, 1)` — the squash a face arrives in a state with. */
export const SETTLE_LEAD: Timing = { duration: 220, curve: [0.16, 1, 0.3, 1] };

const easing = ({ curve }: Timing) => `cubic-bezier(${curve.join(", ")})`;

/** The share of a timing's duration at which its curve reaches `progress` (the curve inverted by halving). */
function timeAt({ curve: [x1, y1, x2, y2] }: Timing, progress: number): number {
  const bezier = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (bezier(y1, y2, middle) < progress) low = middle;
    else high = middle;
  }
  return bezier(x1, x2, low);
}

/** Read at the moment of the change, like Linger: under «уменьшить движение» there is no mid-pose to carry. */
function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function matrixOf(element: Element): DOMMatrix {
  const value = getComputedStyle(element).transform;
  return value && value !== "none" ? new DOMMatrix(value) : new DOMMatrix();
}

/** Close enough to rest that nobody would see it go: a hundredth of a unit, a fifth of a percent. */
function isRest(m: DOMMatrix): boolean {
  return Math.abs(m.a - 1) < 0.002 && Math.abs(m.b) < 0.002 && Math.abs(m.c) < 0.002 && Math.abs(m.d - 1) < 0.002 && Math.abs(m.e) < 0.01 && Math.abs(m.f) < 0.01;
}

/**
 * A motion that is cut off does not jump. `k` names the animation of the one element inside (its
 * `animation` string): when it changes, CSS starts the new animation from its first frame, and the
 * body — tilted to the ear, in the air of a hop, halfway through a roll — would be back at the start
 * in one frame. Right before React commits the change this wrapper reads where the element is, and
 * right after it plays that pose back to nothing on itself, around the same origin, while the new
 * animation takes over: the picture stays whole. The part that only cancels the new animation's own
 * first frame (the squash of `mascot-settle`) goes at that animation's pace (`lead`), so the two
 * cancel out instead of showing as a squash of their own. Web Animations: one-shots the compositor
 * runs, with no CSS events. A change that cuts nothing plays nothing.
 */
export class Blend extends Component<{
  k: string;
  /** the transform-origin of the element inside — the carried pose turns around the same point */
  origin: string;
  timing?: Timing;
  /** the pace of the new animation's own way out of its first frame, when that frame is not rest */
  lead?: Timing;
  /** an HTML element inside (the director's desk) instead of an SVG group */
  html?: boolean;
  children: ReactNode;
}> {
  private readonly node = createRef<SVGGElement & HTMLSpanElement>();
  private running: Animation[] = [];

  getSnapshotBeforeUpdate(previous: { k: string }): DOMMatrix | null {
    if (previous.k === this.props.k) return null;
    const self = this.node.current;
    const inner = self?.firstElementChild;
    if (!self || !inner || reducedMotion()) return null;
    // a blend still under way is part of where the body is now
    return matrixOf(self).multiply(matrixOf(inner));
  }

  componentDidUpdate(_previous: unknown, _state: unknown, was: DOMMatrix | null) {
    if (!was) return;
    const self = this.node.current;
    const inner = self?.firstElementChild;
    if (!self || !inner) return;
    for (const animation of this.running) animation.cancel();
    this.running = [];
    // the new animation's first frame (reading it starts the animation at its time zero)
    const start = matrixOf(inner);
    const invertible = Math.abs(start.a * start.d - start.b * start.c) > 1e-4;
    const timing = this.props.timing ?? BODY_BLEND;
    const lead = this.props.lead;
    const split = lead !== undefined && invertible && !isRest(start);
    const from = invertible && !split ? was.multiply(start.inverse()) : was;
    if (!isRest(from)) this.running.push(self.animate([{ transform: from.toString() }, { transform: "none" }], { duration: timing.duration, easing: easing(timing) }));
    if (split) {
      this.running.push(
        self.animate([{ transform: start.inverse().toString() }, { transform: "none" }], { duration: lead.duration, easing: easing(lead), composite: "add" }),
      );
    }
    // cut while it showed its back (a spin, mirrored): it turns to the front on the way back, and
    // what only the front has (`data-front` — the eyes and the mouth) comes back once it is edge-on
    if (from.a * from.d - from.b * from.c < 0 && from.a < 0) {
      const edge = timeAt(timing, -from.a / (1 - from.a));
      for (const front of self.querySelectorAll("[data-front]")) {
        this.running.push(
          front.animate(
            [
              { opacity: 0, offset: 0 },
              { opacity: 0, offset: edge },
              { opacity: 1, offset: edge },
            ],
            { duration: timing.duration },
          ),
        );
      }
    }
  }

  componentWillUnmount() {
    for (const animation of this.running) animation.cancel();
  }

  render() {
    const style = { transformOrigin: this.props.origin };
    return this.props.html ? (
      <span ref={this.node} className="block" style={style}>
        {this.props.children}
      </span>
    ) : (
      <g ref={this.node} style={style}>
        {this.props.children}
      </g>
    );
  }
}
