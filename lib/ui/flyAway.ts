/**
 * Flights of copies (D-166, D-167): a copy of a card leaves its place while the card itself is
 * already where the data put it. The copies live in a layer of their own on <body>, so a flight
 * never waits for the screen under it and is not cut short when the card unmounts or moves on
 * landing (principle 1a). The layer takes no taps: a second tap under a flight still lands.
 *
 * Transform and opacity only, by WAAPI on the compositor; the layer removes itself when the last
 * copy is out. Under «уменьшить движение» nothing flies.
 */

type Box = { left: number; top: number; width: number; height: number };

/** A copy leaving without a wind-up stays whole for this share of the way, then fades. */
const HOLD = 0.5;
/** The shadow of a copy lifted off the page. */
const LIFTED = "0 18px 40px rgba(0, 0, 0, 0.45)";

function motionWanted(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A layer for `count` copies over the screen; it goes when the last one has landed. */
function openLayer(count: number, z: number): { layer: HTMLDivElement; landed: () => void } {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-fly-layer", "");
  layer.style.cssText = `position:fixed;inset:0;z-index:${z};pointer-events:none;overflow:hidden`;
  document.body.appendChild(layer);
  let flying = count;
  return {
    layer,
    landed: () => {
      flying -= 1;
      if (flying === 0) layer.remove();
    },
  };
}

/** A copy of `node` standing exactly over it, without ids or test ids the page could find twice. */
function copyOf(node: HTMLElement, rect: Box): HTMLElement {
  const ghost = node.cloneNode(true) as HTMLElement;
  for (const element of [ghost, ...ghost.querySelectorAll<HTMLElement>("[id], [data-testid]")]) {
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
  }
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.willChange = "transform, opacity";
  return ghost;
}

/**
 * What has been sent leaves upwards (D-166): a copy of each card flies off the top of the screen,
 * one after another, fanning out a little. By default the cards themselves hide in place for the
 * flight — they are already gone from the data; the returned function shows them again, for a send
 * that came back with an error.
 */
export function flyAway(
  nodes: HTMLElement[],
  {
    stagger = 55,
    duration = 560,
    delay = 0,
    keep = false,
    z = 60,
    windUp = true,
  }: {
    stagger?: number;
    duration?: number;
    /** Holds the copies still at their places first. */
    delay?: number;
    /** The cards stay visible: each stays in its list with a new state, only its copy goes (an employee's report, D-167). */
    keep?: boolean;
    /** The layer's z-index: 49 flies under a sheet that is still sliding away (sheets are at 50). */
    z?: number;
    /** A dip before the rise, as a send gathers itself (D-166); without it the copy leaves at once on `--ease-in`. */
    windUp?: boolean;
  } = {},
): () => void {
  const restore = () => {
    for (const node of nodes) node.style.visibility = "";
  };
  if (nodes.length === 0 || !motionWanted()) return restore;

  const { layer, landed } = openLayer(nodes.length, z);
  nodes.forEach((node, i) => {
    const rect = node.getBoundingClientRect();
    const ghost = copyOf(node, rect);
    layer.appendChild(ghost);
    if (!keep) node.style.visibility = "hidden";

    // a fan: every other card to the other side, each a little further and more turned
    const side = i % 2 === 0 ? -1 : 1;
    const dx = side * (10 + 12 * i);
    const turn = side * (3 + 1.5 * i);
    const rise = rect.bottom + 80;
    const at = (share: number, opacity: number): Keyframe => ({
      transform: `translate(${(dx * share).toFixed(1)}px, ${(-rise * share).toFixed(1)}px) rotate(${(turn * share).toFixed(2)}deg) scale(${(1 - 0.16 * share).toFixed(4)})`,
      opacity,
    });
    const timing = { duration, delay: delay + i * stagger, fill: "both" } as const;
    let flight: Animation;
    if (windUp) {
      // a wind-up, then gathering speed as it goes (D-131: what leaves accelerates)
      flight = ghost.animate(
        [
          at(0, 1),
          { transform: `translate(${(dx * 0.2).toFixed(1)}px, 10px) rotate(${(turn * 0.2).toFixed(1)}deg) scale(0.98)`, opacity: 1, offset: 0.18 },
          at(1, 0),
        ],
        { ...timing, easing: "cubic-bezier(0.5, 0, 0.75, 0)" },
      );
    } else {
      // a card that stays behind must not stand doubled under its copy: the copy is off the mark
      // at once on `--ease-in`, lifted by a deeper shadow, and whole over what it passes until it
      // is well on its way
      ghost.style.boxShadow = LIFTED;
      flight = ghost.animate([at(0, 1), { ...at(HOLD, 1), offset: HOLD }, at(1, 0)], { ...timing, easing: "cubic-bezier(0.4, 0, 1, 1)" });
    }
    flight.onfinish = () => {
      ghost.remove();
      landed();
    };
    flight.oncancel = flight.onfinish;
  });
  return restore;
}

/** A CSS `cubic-bezier()` as a function of time, for curves sampled into keyframes. */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return at(y1, y2, t);
  };
}

/** Along the path: it gathers itself for a moment, goes, and slows into the hands. */
const ALONG = bezier(0.4, 0, 0.3, 1);
/** It fades over the last part of the way, ever faster. */
const FADE_FROM = 0.45;
/** How big it arrives: this share of the target's smaller side. */
const ARRIVES_AS = 0.24;

const round = (value: number, places = 1) => Number(value.toFixed(places));

/**
 * The keyframes of a copy of `from` flying into the centre of `to` along a soft arc: it lifts a
 * little as if picked up, curves outwards on the side it stands off the target (to the right when
 * right under it), shrinks to a token of the target's size, turns a little on the way and dissolves
 * as it arrives. Sampled evenly in time, so the curve rides `linear` easing on the compositor.
 */
export function arcFrames(from: Box, to: Box, steps = 24): Keyframe[] {
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - sx;
  const dy = to.top + to.height / 2 - sy;
  const length = Math.hypot(dx, dy) || 1;
  // outwards: a card left of the target bulges left, one right of it right
  const side = dx > 0 ? -1 : 1;
  const bulge = Math.min(80, Math.max(20, length * 0.18)) * side;
  // the arc's control point: the middle of the way, pushed off it sideways
  const cx = dx / 2 + (-dy / length) * bulge;
  const cy = dy / 2 + (dx / length) * bulge;
  const end = Math.min(1, (Math.min(to.width, to.height) * ARRIVES_AS) / Math.max(1, from.width));
  const turn = -side * 6;

  return Array.from({ length: steps + 1 }, (_, k) => {
    const u = k / steps;
    const p = ALONG(u);
    // a quadratic Bézier from the card (0, 0) through the control point into the target's centre
    const x = 2 * (1 - p) * p * cx + p * p * dx;
    const y = 2 * (1 - p) * p * cy + p * p * dy;
    const lift = 1 + 0.035 * Math.sin(Math.PI * Math.min(1, u / 0.3));
    const scale = lift * (1 - (1 - end) * Math.pow(p, 0.8));
    const opacity = u <= FADE_FROM ? 1 : 1 - Math.pow((u - FADE_FROM) / (1 - FADE_FROM), 1.2);
    return {
      offset: round(u, 4),
      transform: `translate(${round(x)}px, ${round(y)}px) rotate(${round(turn * Math.sin(Math.PI * p), 2)}deg) scale(${round(scale, 4)})`,
      opacity: round(opacity, 3),
    };
  });
}

/**
 * A copy of `node` flies along a soft arc into the centre of `target` — a card into the hands of
 * the face (D-167). The card itself stays where it is: it is still in its list, only its state
 * has changed. `onLand` is told when the copy reaches the target (at once when nothing flies).
 */
export function flyInto(node: HTMLElement, target: HTMLElement, { duration = 450, onLand }: { duration?: number; onLand?: () => void } = {}): void {
  const from = node.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  // nothing to fly from or into: a card or a face that is not on the screen
  if (!motionWanted() || from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) {
    onLand?.();
    return;
  }

  const { layer, landed } = openLayer(1, 60);
  const ghost = copyOf(node, from);
  // picked up: off the page by a deeper shadow
  ghost.style.boxShadow = LIFTED;
  layer.appendChild(ghost);
  const flight = ghost.animate(arcFrames(from, to), { duration, easing: "linear", fill: "both" });
  flight.onfinish = () => {
    ghost.remove();
    landed();
    onLand?.();
  };
  // a flight cut short is over all the same: whoever waits for the landing is not left waiting
  flight.oncancel = flight.onfinish;
}
